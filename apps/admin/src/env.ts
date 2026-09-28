import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  VITE_ENVIRONMENT: z.enum(['development', 'production']).default('production'),
});

export type AdminEnv = z.infer<typeof schema>;

export function readEnv(raw: Record<string, unknown> = import.meta.env): AdminEnv | null {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
