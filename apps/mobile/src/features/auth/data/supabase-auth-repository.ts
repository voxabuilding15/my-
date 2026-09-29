import {
  AppError,
  type AuthEmailCodeRequest,
  type AuthEmailCodeResponse,
  isEmailVerified,
} from '@studexa/shared';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { invokeFunction } from '@/core/supabase/functions';

import type { AuthRepository, CodeSent, SignUpInput } from '../domain/auth-repository';
import type { AuthProviderId, AuthUser, SocialProviderId } from '../domain/auth-user';
import { getGoogleIdToken, signOutOfGoogle } from './google-sign-in';
import { mapAuthError } from './map-auth-error';

const KNOWN_PROVIDERS: readonly AuthProviderId[] = ['email', 'google', 'apple'];

export function toAuthUser(user: User): AuthUser {
  const providers = ((user.app_metadata.providers as string[] | undefined) ?? []).filter(
    (p): p is AuthProviderId => KNOWN_PROVIDERS.includes(p as AuthProviderId),
  );
  const meta = user.user_metadata as Record<string, unknown>;
  const name = [meta.display_name, meta.full_name, meta.name].find(
    (v) => typeof v === 'string' && v.trim(),
  );
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: (name as string | undefined) ?? null,
    emailVerified: isEmailVerified(user.app_metadata),
    providers,
  };
}

const emailCode = <T extends AuthEmailCodeResponse>(request: AuthEmailCodeRequest) =>
  invokeFunction<T>('auth-email-code', request);

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session ? toAuthUser(data.session.user) : null;
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((_event, session) => {
      listener(session ? toAuthUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw mapAuthError(error);
    return toAuthUser(data.user);
  }

  async signUp({ email, password, displayName }: SignUpInput): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw mapAuthError(error);
    // With email confirmations handled by our own codes, sign-up returns a session directly.
    // An existing address comes back as a user without identities.
    if (!data.user || data.user.identities?.length === 0) throw new AppError('email_in_use');
    await this.sendVerificationCode().catch(() => undefined);
    return toAuthUser(data.user);
  }

  async signInWithProvider(provider: SocialProviderId): Promise<AuthUser> {
    if (provider !== 'google')
      throw new AppError('unknown', `${provider} sign-in is not available yet`);
    const token = await getGoogleIdToken();
    const { data, error } = await this.supabase.auth.signInWithIdToken({
      provider: 'google',
      token,
    });
    if (error) throw mapAuthError(error);
    return toAuthUser(data.user);
  }

  async signOut(scope: 'local' | 'global'): Promise<void> {
    await signOutOfGoogle();
    const { error } = await this.supabase.auth.signOut({ scope });
    // A failed server call must still clear the local session.
    if (error) await this.supabase.auth.signOut({ scope: 'local' });
  }

  async sendVerificationCode(): Promise<CodeSent> {
    const res = await emailCode<AuthEmailCodeResponse>({ action: 'send_verification' });
    return { retryAfterSeconds: res.status === 'sent' ? res.retryAfterSeconds : 0 };
  }

  async confirmVerificationCode(code: string): Promise<void> {
    await emailCode({ action: 'confirm_verification', code });
    // Pull the updated app_metadata.email_verified into the session.
    const { error } = await this.supabase.auth.refreshSession();
    if (error) throw mapAuthError(error);
  }

  async requestPasswordReset(email: string): Promise<CodeSent> {
    const res = await emailCode<AuthEmailCodeResponse>({ action: 'send_password_reset', email });
    return { retryAfterSeconds: res.status === 'sent' ? res.retryAfterSeconds : 0 };
  }

  async checkPasswordResetCode(email: string, code: string): Promise<void> {
    await emailCode({ action: 'check_password_reset', email, code });
  }

  async completePasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    // Revokes every session server-side; a signed-in caller ends its local session afterwards.
    await emailCode({ action: 'complete_password_reset', email, code, newPassword });
  }

  async updateDisplayName(displayName: string): Promise<void> {
    const { data, error } = await this.supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw mapAuthError(error);
    const { error: profileError } = await this.supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', data.user.id);
    if (profileError) throw new AppError('unknown', profileError.message);
  }

  async deleteAccount(): Promise<void> {
    await invokeFunction('delete-account');
    await signOutOfGoogle();
    await this.supabase.auth.signOut({ scope: 'local' });
  }
}
