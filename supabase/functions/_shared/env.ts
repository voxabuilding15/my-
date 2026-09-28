import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Secret key for HMAC-ing one-time codes and email rate-limit keys (32+ random bytes). */
  AUTH_CODE_PEPPER: z.string().min(32),
  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Studexa <onboarding@resend.dev>'),
  ENVIRONMENT: z.enum(['development', 'production']).default('production'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Secrets come only from the function environment (`supabase secrets set …`). */
export function getEnv(): Env {
  cached ??= envSchema
    .superRefine((env, ctx) => {
      if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          message: 'RESEND_API_KEY is required',
          path: ['RESEND_API_KEY'],
        });
      }
      if (env.EMAIL_PROVIDER === 'console' && env.ENVIRONMENT === 'production') {
        ctx.addIssue({
          code: 'custom',
          message: 'console email is for development only',
          path: ['EMAIL_PROVIDER'],
        });
      }
    })
    .parse(Deno.env.toObject());
  return cached;
}
