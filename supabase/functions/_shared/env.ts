import { z } from 'zod';

const baseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENVIRONMENT: z.enum(['development', 'production']).default('production'),
  /** Optional: errors are always logged internally; Sentry is added when a DSN is set. */
  SENTRY_DSN: z.url().optional(),
  SENTRY_RELEASE: z.string().optional(),
});

const authSchema = baseSchema
  .extend({
    /** Secret key for HMAC-ing one-time codes and email rate-limit keys (32+ random bytes). */
    AUTH_CODE_PEPPER: z.string().min(32),
    EMAIL_PROVIDER: z.enum(['resend', 'console']).default('resend'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Studexa <onboarding@resend.dev>'),
  })
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
  });

const documentsSchema = baseSchema.extend({
  /** Cloud Run document processor; without it jobs wait for the scheduled worker run. */
  DOCUMENT_PROCESSOR_URL: z.url().optional(),
  WORKER_SECRET: z.string().min(32).optional(),
});

const billingSchema = baseSchema.extend({
  /** The Authorization header value configured for the RevenueCat webhook. */
  REVENUECAT_WEBHOOK_SECRET: z.string().min(32),
});

const cronSchema = baseSchema.extend({
  /** Bearer secret for scheduled calls (pg_cron + pg_net or an external scheduler). */
  CRON_SECRET: z.string().min(32),
});

const aiSchema = baseSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
  /** Optional: without it, large documents are searched by full text only. */
  VOYAGE_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof baseSchema>;
export type AiEnv = z.infer<typeof aiSchema>;
export type AuthEnv = z.infer<typeof authSchema>;
export type DocumentsEnv = z.infer<typeof documentsSchema>;
export type BillingEnv = z.infer<typeof billingSchema>;
export type CronEnv = z.infer<typeof cronSchema>;

/** Secrets come only from the function environment (`supabase secrets set …`). */
function load<T extends z.ZodType>(schema: T): z.infer<T> {
  return schema.parse(Deno.env.toObject());
}

export const getEnv = (): Env => load(baseSchema);
export const getAuthEnv = (): AuthEnv => load(authSchema);
export const getDocumentsEnv = (): DocumentsEnv => load(documentsSchema);
export const getBillingEnv = (): BillingEnv => load(billingSchema);
export const getCronEnv = (): CronEnv => load(cronSchema);
export const getAiEnv = (): AiEnv => load(aiSchema);
