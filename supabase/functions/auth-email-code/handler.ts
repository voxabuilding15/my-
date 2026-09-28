import {
  type AppLocale,
  authEmailCodeRequestSchema,
  type AuthEmailCodeResponse,
  EMAIL_CODE_POLICY,
  type EmailCodePurpose,
} from '@studexa/shared';

import { HttpError } from '../_shared/errors.ts';
import { clientIp, json, parseBody } from '../_shared/http.ts';

export type Caller = { id: string; email: string; emailVerified: boolean };
export type AccountLookup = { id: string; emailVerified: boolean; hasPassword: boolean };
export type VerifyStatus = 'valid' | 'invalid' | 'expired' | 'too_many_attempts' | 'no_code';

export interface AuthEmailCodeDeps {
  getCaller(req: Request): Promise<Caller | null>;
  findAccount(email: string): Promise<AccountLookup | null>;
  issueCode(
    userId: string,
    purpose: EmailCodePurpose,
    codeHash: string,
  ): Promise<{ issued: boolean; retryAfterSeconds: number }>;
  verifyCode(
    userId: string,
    purpose: EmailCodePurpose,
    codeHash: string,
    consume: boolean,
  ): Promise<{ status: VerifyStatus; attemptsRemaining: number }>;
  markEmailVerified(userId: string): Promise<void>;
  setPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  /** Returns false when the key exceeded `max` hits in the window. */
  rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  sendCodeEmail(params: {
    to: string;
    code: string;
    purpose: EmailCodePurpose;
    locale: AppLocale;
  }): Promise<void>;
  preferredLocale(userId: string | null, req: Request): Promise<AppLocale>;
  generateCode(): string;
  /** Keyed hash; binding the user and purpose makes a code useless for anything else. */
  hash(value: string): Promise<string>;
  /** Runs work after the response is sent (keeps response timing independent of email delivery). */
  runInBackground(task: Promise<unknown>): void;
}

const LIMITS = {
  sendsPerIpPerHour: 20,
  checksPerIpPer10Min: 30,
  resetSendsPerEmailPerHour: 5,
  resetChecksPerEmailPer10Min: 10,
};

export function createAuthEmailCodeHandler(deps: AuthEmailCodeDeps) {
  const codeHash = (userId: string, purpose: EmailCodePurpose, code: string) =>
    deps.hash(`${purpose}:${userId}:${code}`);

  async function limit(key: string, max: number, windowSeconds: number) {
    if (!(await deps.rateLimit(key, max, windowSeconds))) {
      throw new HttpError('rate_limited', 'Too many requests, try again later');
    }
  }

  async function requireCaller(req: Request): Promise<Caller> {
    const caller = await deps.getCaller(req);
    if (!caller) throw new HttpError('unauthenticated', 'Sign in first');
    return caller;
  }

  function rejectCode(status: VerifyStatus, attemptsRemaining?: number): never {
    if (status === 'invalid') {
      throw new HttpError(
        'invalid_code',
        'Incorrect code',
        attemptsRemaining === undefined ? undefined : { attemptsRemaining },
      );
    }
    throw new HttpError('code_expired', 'This code is no longer valid. Request a new one.');
  }

  return async function handle(req: Request): Promise<Response> {
    const body = await parseBody(req, authEmailCodeRequestSchema);
    const ip = clientIp(req);
    let result: AuthEmailCodeResponse;

    switch (body.action) {
      case 'send_verification': {
        const caller = await requireCaller(req);
        if (caller.emailVerified) {
          result = { status: 'already_verified' };
          break;
        }
        await limit(`auth_send:ip:${ip}`, LIMITS.sendsPerIpPerHour, 3600);
        const code = deps.generateCode();
        const issued = await deps.issueCode(
          caller.id,
          'verify_email',
          await codeHash(caller.id, 'verify_email', code),
        );
        if (!issued.issued) {
          throw new HttpError('resend_too_soon', 'Please wait before requesting another code', {
            retryAfterSeconds: issued.retryAfterSeconds,
          });
        }
        const locale = await deps.preferredLocale(caller.id, req);
        await deps.sendCodeEmail({ to: caller.email, code, purpose: 'verify_email', locale });
        result = { status: 'sent', retryAfterSeconds: issued.retryAfterSeconds };
        break;
      }

      case 'confirm_verification': {
        const caller = await requireCaller(req);
        if (caller.emailVerified) {
          result = { status: 'already_verified' };
          break;
        }
        await limit(`auth_check:ip:${ip}`, LIMITS.checksPerIpPer10Min, 600);
        const check = await deps.verifyCode(
          caller.id,
          'verify_email',
          await codeHash(caller.id, 'verify_email', body.code),
          true,
        );
        if (check.status !== 'valid') rejectCode(check.status, check.attemptsRemaining);
        await deps.markEmailVerified(caller.id);
        result = { status: 'verified' };
        break;
      }

      case 'send_password_reset': {
        await limit(`auth_send:ip:${ip}`, LIMITS.sendsPerIpPerHour, 3600);
        await limit(
          `reset_send:${await deps.hash(body.email)}`,
          LIMITS.resetSendsPerEmailPerHour,
          3600,
        );
        // Same response whether or not the account exists (no account enumeration); the work
        // happens in the background so response timing does not reveal it either.
        deps.runInBackground(
          (async () => {
            const account = await deps.findAccount(body.email);
            if (!account?.hasPassword) return;
            const code = deps.generateCode();
            const issued = await deps.issueCode(
              account.id,
              'reset_password',
              await codeHash(account.id, 'reset_password', code),
            );
            if (!issued.issued) return;
            const locale = await deps.preferredLocale(account.id, req);
            await deps.sendCodeEmail({ to: body.email, code, purpose: 'reset_password', locale });
          })(),
        );
        result = { status: 'sent', retryAfterSeconds: EMAIL_CODE_POLICY.resendAfterSeconds };
        break;
      }

      case 'check_password_reset':
      case 'complete_password_reset': {
        await limit(`auth_check:ip:${ip}`, LIMITS.checksPerIpPer10Min, 600);
        await limit(
          `reset_check:${await deps.hash(body.email)}`,
          LIMITS.resetChecksPerEmailPer10Min,
          600,
        );
        const account = await deps.findAccount(body.email);
        if (!account?.hasPassword) rejectCode('invalid');
        const hash = await codeHash(account.id, 'reset_password', body.code);
        // Remaining attempts are not reported here: they would reveal that the account exists.
        const check = await deps.verifyCode(account.id, 'reset_password', hash, false);
        if (check.status !== 'valid') rejectCode(check.status);

        if (body.action === 'check_password_reset') {
          result = { status: 'valid' };
          break;
        }
        await deps.setPassword(account.id, body.newPassword);
        await deps.verifyCode(account.id, 'reset_password', hash, true);
        await deps.revokeSessions(account.id);
        // Receiving the code proves the user controls the address.
        if (!account.emailVerified) await deps.markEmailVerified(account.id);
        result = { status: 'password_updated' };
        break;
      }
    }

    return json(result);
  };
}
