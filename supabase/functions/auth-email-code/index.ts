import { APP_LOCALES, type AppLocale, EMAIL_CODE_POLICY, resolveAppLocale } from '@studexa/shared';

import { runInBackground } from '../_shared/background.ts';
import { generateNumericCode, hmacSha256Hex } from '../_shared/crypto.ts';
import { codeEmail, createEmailSender } from '../_shared/email/index.ts';
import { getAuthEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { createAdminClient, getUser, rateLimit, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { type AccountLookup, createAuthEmailCodeHandler, type VerifyStatus } from './handler.ts';

const env = getAuthEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);
const email = createEmailSender(env);

const handler = createAuthEmailCodeHandler({
  async getCaller(req) {
    const auth = await getUser(admin, req);
    if (!auth?.user.email) return null;
    return {
      id: auth.user.id,
      email: auth.user.email,
      emailVerified: Boolean(auth.user.email_confirmed_at),
    };
  },
  async findAccount(address) {
    const rows = await rpc<{ user_id: string; email_verified: boolean; has_password: boolean }[]>(
      admin,
      'find_auth_user_by_email',
      { p_email: address },
    );
    const row = rows[0];
    return row
      ? ({
          id: row.user_id,
          emailVerified: row.email_verified,
          hasPassword: row.has_password,
        } satisfies AccountLookup)
      : null;
  },
  async issueCode(userId, purpose, codeHash) {
    const [row] = await rpc<{ issued: boolean; retry_after_seconds: number }[]>(
      admin,
      'issue_email_code',
      {
        p_user_id: userId,
        p_purpose: purpose,
        p_code_hash: codeHash,
      },
    );
    return { issued: row?.issued ?? false, retryAfterSeconds: row?.retry_after_seconds ?? 0 };
  },
  async verifyCode(userId, purpose, codeHash, consume) {
    const [row] = await rpc<{ status: VerifyStatus; attempts_remaining: number }[]>(
      admin,
      'verify_email_code',
      {
        p_user_id: userId,
        p_purpose: purpose,
        p_code_hash: codeHash,
        p_consume: consume,
      },
    );
    return { status: row?.status ?? 'no_code', attemptsRemaining: row?.attempts_remaining ?? 0 };
  },
  async markEmailVerified(userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) throw error;
  },
  async setPassword(userId, password) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  },
  async revokeSessions(userId) {
    await rpc(admin, 'revoke_user_sessions', { p_user_id: userId });
  },
  rateLimit: (key, max, windowSeconds) => rateLimit(admin, key, max, windowSeconds),
  async sendCodeEmail({ to, code, purpose, locale }) {
    await email.send(
      codeEmail({ to, code, purpose, locale, ttlMinutes: EMAIL_CODE_POLICY.ttlSeconds / 60 }),
    );
  },
  async preferredLocale(userId, req) {
    if (userId) {
      const { data } = await admin
        .from('user_settings')
        .select('locale')
        .eq('user_id', userId)
        .maybeSingle();
      const saved = data?.locale as AppLocale | null | undefined;
      if (saved && APP_LOCALES.includes(saved)) return saved;
    }
    return resolveAppLocale(
      (req.headers.get('accept-language') ?? '').split(',').map((part) => part.split(';')[0] ?? ''),
    );
  },
  generateCode: () => generateNumericCode(),
  hash: (value) => hmacSha256Hex(env.AUTH_CODE_PEPPER, value),
  runInBackground,
});

Deno.serve(withHttp('auth-email-code', handler));
