import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Bearer secret shared with the document-upload Edge Function and Cloud Scheduler. */
  WORKER_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(8080),
  /** Documents processed in parallel per instance (bounded by memory: ~50 MB file each). */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  /** Lease per job; a crashed instance's jobs are reclaimed after this. */
  JOB_LEASE_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  /** Stop claiming new work after this, so a run ends well inside the request timeout. */
  RUN_BUDGET_SECONDS: z.coerce.number().int().min(10).max(3000).default(240),
  ENVIRONMENT: z.enum(['development', 'production']).default('production'),
  SENTRY_DSN: z.url().optional(),
  /** Photo OCR with Claude vision (Arabic, handwriting). Without it, such photos fail with ocr_unavailable. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Embeddings for large documents. Without it, they are searched by full text only. */
  VOYAGE_API_KEY: z.string().min(1).optional(),
  /** Set by Cloud Run. */
  K_REVISION: z.string().default('local'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
