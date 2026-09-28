import { z } from 'zod';

/** Mirrors supabase/config.toml: minimum_password_length and password_requirements. */
export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores bytes beyond 72. */
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULES = ['length', 'lowercase', 'uppercase', 'digit'] as const;
export type PasswordRule = (typeof PASSWORD_RULES)[number];

const RULE_TESTS: Record<PasswordRule, (password: string) => boolean> = {
  length: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  lowercase: (p) => /\p{Ll}/u.test(p),
  uppercase: (p) => /\p{Lu}/u.test(p),
  digit: (p) => /\d/.test(p),
};

/** Rules the password does not satisfy yet (drives the live checklist in the app). */
export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !RULE_TESTS[rule](password));
}

export const passwordSchema = z
  .string()
  .refine((password) => unmetPasswordRules(password).length === 0, { message: 'weak_password' });

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const EMAIL_CODE_LENGTH = 6;
export const emailCodeSchema = z.string().regex(/^\d{6}$/);

/** Defaults shown by the app; the server's app_config 'auth.email_codes' is authoritative. */
export const EMAIL_CODE_POLICY = {
  ttlSeconds: 600,
  resendAfterSeconds: 60,
  maxAttempts: 5,
} as const;

export const EMAIL_CODE_PURPOSES = ['verify_email', 'reset_password'] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

/** Request contract of the auth-email-code Edge Function. */
export const authEmailCodeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send_verification') }),
  z.object({ action: z.literal('confirm_verification'), code: emailCodeSchema }),
  z.object({ action: z.literal('send_password_reset'), email: emailSchema }),
  z.object({
    action: z.literal('check_password_reset'),
    email: emailSchema,
    code: emailCodeSchema,
  }),
  z.object({
    action: z.literal('complete_password_reset'),
    email: emailSchema,
    code: emailCodeSchema,
    newPassword: passwordSchema,
  }),
]);
export type AuthEmailCodeRequest = z.infer<typeof authEmailCodeRequestSchema>;

export type AuthEmailCodeResponse =
  | { status: 'sent'; retryAfterSeconds: number }
  | { status: 'already_verified' }
  | { status: 'verified' }
  | { status: 'valid' }
  | { status: 'password_updated' };

/** How recent a sign-in must be for sensitive actions such as deleting the account. */
export const REAUTHENTICATION_WINDOW_SECONDS = 600;
