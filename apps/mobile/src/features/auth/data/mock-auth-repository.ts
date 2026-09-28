import {
  AppError,
  EMAIL_CODE_POLICY,
  REAUTHENTICATION_WINDOW_SECONDS,
  unmetPasswordRules,
} from '@studexa/shared';

import type { AuthRepository, CodeSent, SignUpInput } from '../domain/auth-repository';
import type { AuthUser, SocialProviderId } from '../domain/auth-user';

/** The code every mock email "contains". */
export const MOCK_EMAIL_CODE = '123456';

type MockAccount = AuthUser & { password: string | null };
type PendingCode = { code: string; issuedAt: number; attempts: number };

/**
 * In-memory implementation for demo mode and tests. Mirrors the server's rules (verification,
 * resend delay, attempt limit, recent sign-in for deletion) so UI flows behave like production.
 */
export class MockAuthRepository implements AuthRepository {
  private accounts = new Map<string, MockAccount>();
  private codes = new Map<string, PendingCode>();
  private current: MockAccount | null = null;
  private signedInAt = 0;
  private listeners = new Set<(user: AuthUser | null) => void>();

  constructor(
    private readonly latencyMs = 400,
    private readonly now: () => number = Date.now,
  ) {
    this.accounts.set('demo@studexa.app', {
      id: 'demo-user',
      email: 'demo@studexa.app',
      displayName: 'Demo Student',
      emailVerified: true,
      providers: ['email'],
      password: 'Studexa2026',
    });
  }

  private async delay() {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }

  private publicUser(account: MockAccount | null): AuthUser | null {
    if (!account) return null;
    const { password: _password, ...user } = account;
    return { ...user };
  }

  private notify() {
    const user = this.publicUser(this.current);
    this.listeners.forEach((listener) => listener(user));
  }

  private setCurrent(account: MockAccount | null) {
    this.current = account;
    this.signedInAt = account ? this.now() : 0;
    this.notify();
  }

  private issue(key: string): CodeSent {
    const existing = this.codes.get(key);
    const elapsed = existing ? (this.now() - existing.issuedAt) / 1000 : Infinity;
    if (elapsed < EMAIL_CODE_POLICY.resendAfterSeconds) {
      throw new AppError('resend_too_soon', undefined, {
        retryAfterSeconds: Math.ceil(EMAIL_CODE_POLICY.resendAfterSeconds - elapsed),
      });
    }
    this.codes.set(key, { code: MOCK_EMAIL_CODE, issuedAt: this.now(), attempts: 0 });
    return { retryAfterSeconds: EMAIL_CODE_POLICY.resendAfterSeconds };
  }

  private verify(key: string, code: string, consume: boolean) {
    const pending = this.codes.get(key);
    if (!pending || this.now() - pending.issuedAt > EMAIL_CODE_POLICY.ttlSeconds * 1000) {
      throw new AppError('code_expired');
    }
    if (pending.code !== code) {
      pending.attempts += 1;
      const remaining = EMAIL_CODE_POLICY.maxAttempts - pending.attempts;
      if (remaining <= 0) {
        this.codes.delete(key);
        throw new AppError('code_expired');
      }
      throw new AppError('invalid_code', undefined, { attemptsRemaining: remaining });
    }
    if (consume) this.codes.delete(key);
  }

  private requireCurrent(): MockAccount {
    if (!this.current) throw new AppError('unauthenticated');
    return this.current;
  }

  getCurrentUser(): Promise<AuthUser | null> {
    return Promise.resolve(this.publicUser(this.current));
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    await this.delay();
    const account = this.accounts.get(email.trim().toLowerCase());
    if (!account || account.password !== password) throw new AppError('invalid_credentials');
    this.setCurrent(account);
    return this.publicUser(account)!;
  }

  async signUp({ email, password, displayName }: SignUpInput): Promise<AuthUser> {
    await this.delay();
    const key = email.trim().toLowerCase();
    if (this.accounts.has(key)) throw new AppError('email_in_use');
    if (unmetPasswordRules(password).length > 0) throw new AppError('weak_password');
    const account: MockAccount = {
      id: `user-${this.accounts.size + 1}`,
      email: key,
      displayName,
      emailVerified: false,
      providers: ['email'],
      password,
    };
    this.accounts.set(key, account);
    this.setCurrent(account);
    this.issue(`verify:${account.id}`);
    return this.publicUser(account)!;
  }

  async signInWithProvider(provider: SocialProviderId): Promise<AuthUser> {
    await this.delay();
    const email = `student.${provider}@gmail.com`;
    const account = this.accounts.get(email) ?? {
      id: `${provider}-user`,
      email,
      displayName: 'Google Student',
      emailVerified: true,
      providers: [provider],
      password: null,
    };
    this.accounts.set(email, account);
    this.setCurrent(account);
    return this.publicUser(account)!;
  }

  async signOut(): Promise<void> {
    await this.delay();
    this.setCurrent(null);
  }

  async sendVerificationCode(): Promise<CodeSent> {
    await this.delay();
    return this.issue(`verify:${this.requireCurrent().id}`);
  }

  async confirmVerificationCode(code: string): Promise<void> {
    await this.delay();
    const account = this.requireCurrent();
    this.verify(`verify:${account.id}`, code, true);
    account.emailVerified = true;
    this.notify();
  }

  async requestPasswordReset(email: string): Promise<CodeSent> {
    await this.delay();
    const account = this.accounts.get(email.trim().toLowerCase());
    if (account?.password) {
      try {
        this.issue(`reset:${account.id}`);
      } catch {
        // Silently ignored, like the server, so responses don't reveal which emails exist.
      }
    }
    return { retryAfterSeconds: EMAIL_CODE_POLICY.resendAfterSeconds };
  }

  private resetAccount(email: string): MockAccount {
    const account = this.accounts.get(email.trim().toLowerCase());
    if (!account?.password) throw new AppError('invalid_code');
    return account;
  }

  async checkPasswordResetCode(email: string, code: string): Promise<void> {
    await this.delay();
    const account = this.resetAccount(email);
    this.verify(`reset:${account.id}`, code, false);
  }

  async completePasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    await this.delay();
    if (unmetPasswordRules(newPassword).length > 0) throw new AppError('weak_password');
    const account = this.resetAccount(email);
    this.verify(`reset:${account.id}`, code, true);
    account.password = newPassword;
    account.emailVerified = true;
  }

  async updateDisplayName(displayName: string): Promise<void> {
    await this.delay();
    const account = this.requireCurrent();
    account.displayName = displayName;
    this.notify();
  }

  async deleteAccount(): Promise<void> {
    await this.delay();
    const account = this.requireCurrent();
    if ((this.now() - this.signedInAt) / 1000 > REAUTHENTICATION_WINDOW_SECONDS) {
      throw new AppError('reauthentication_required');
    }
    this.accounts.delete(account.email);
    this.setCurrent(null);
  }
}
