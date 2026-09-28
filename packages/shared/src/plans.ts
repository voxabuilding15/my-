import { z } from 'zod';

export const PLAN_TIERS = ['free', 'premium'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Every quota the product enforces. Values live in the `plan_limits` table and are
 * edited from the admin dashboard, so they can change without an app release.
 * `null` means unlimited.
 */
export const planLimitsSchema = z.object({
  aiRequestsPerDay: z.number().int().nonnegative().nullable(),
  uploadsPerMonth: z.number().int().nonnegative().nullable(),
  maxFileSizeMb: z.number().int().positive(),
  maxPagesPerDocument: z.number().int().positive().nullable(),
  quizzesPerDay: z.number().int().nonnegative().nullable(),
  flashcardDecksPerDay: z.number().int().nonnegative().nullable(),
  ocrScansPerDay: z.number().int().nonnegative().nullable(),
  chatMessagesPerDay: z.number().int().nonnegative().nullable(),
  storageMb: z.number().int().positive().nullable(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** Limits that are consumed by counting usage events within a time window. */
export type CountedLimitKey =
  | 'aiRequestsPerDay'
  | 'uploadsPerMonth'
  | 'quizzesPerDay'
  | 'flashcardDecksPerDay'
  | 'ocrScansPerDay'
  | 'chatMessagesPerDay';

/** Seed values and offline fallback only — the database is the source of truth. */
export const DEFAULT_PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    aiRequestsPerDay: 20,
    uploadsPerMonth: 5,
    maxFileSizeMb: 10,
    maxPagesPerDocument: 50,
    quizzesPerDay: 3,
    flashcardDecksPerDay: 3,
    ocrScansPerDay: 10,
    chatMessagesPerDay: 30,
    storageMb: 100,
  },
  premium: {
    aiRequestsPerDay: null,
    uploadsPerMonth: null,
    maxFileSizeMb: 50,
    maxPagesPerDocument: null,
    quizzesPerDay: null,
    flashcardDecksPerDay: null,
    ocrScansPerDay: null,
    chatMessagesPerDay: null,
    storageMb: 10_240,
  },
};

export function remainingQuota(limit: number | null, used: number): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - used);
}

export function isWithinQuota(limit: number | null, used: number, requested = 1): boolean {
  return limit === null || used + requested <= limit;
}
