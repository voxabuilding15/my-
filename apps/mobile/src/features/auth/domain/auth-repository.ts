import type { AuthUser, SocialProviderId } from './auth-user';

export type SignUpInput = { email: string; password: string; displayName: string };
export type CodeSent = { retryAfterSeconds: number };

/**
 * Everything the app needs from the identity provider. Implemented by Supabase in production
 * and by an in-memory mock in demo mode and tests. Methods throw AppError.
 */
export interface AuthRepository {
  getCurrentUser(): Promise<AuthUser | null>;
  /** Called with the current user on every sign-in, sign-out, refresh and profile change. */
  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void;

  signInWithPassword(email: string, password: string): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signInWithProvider(provider: SocialProviderId): Promise<AuthUser>;
  /** 'global' also revokes every other device's session. */
  signOut(scope: 'local' | 'global'): Promise<void>;

  sendVerificationCode(): Promise<CodeSent>;
  confirmVerificationCode(code: string): Promise<void>;

  requestPasswordReset(email: string): Promise<CodeSent>;
  checkPasswordResetCode(email: string, code: string): Promise<void>;
  /** Also revokes every session server-side; callers that are signed in should sign out locally. */
  completePasswordReset(email: string, code: string, newPassword: string): Promise<void>;

  updateDisplayName(displayName: string): Promise<void>;
  /** Throws `reauthentication_required` unless the user signed in within the last few minutes. */
  deleteAccount(): Promise<void>;
}
