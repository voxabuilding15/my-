import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAN_LIMITS,
  PLAN_TIERS,
  documentKindFromMime,
  isRtlLocale,
  isWithinQuota,
  planLimitsSchema,
  remainingQuota,
  resolveAppLocale,
} from './index.ts';

describe('plan limits', () => {
  it.each(PLAN_TIERS)('default %s limits satisfy the schema', (tier) => {
    expect(planLimitsSchema.safeParse(DEFAULT_PLAN_LIMITS[tier]).success).toBe(true);
  });

  it('rejects negative quotas', () => {
    const bad = { ...DEFAULT_PLAN_LIMITS.free, aiRequestsPerDay: -1 };
    expect(planLimitsSchema.safeParse(bad).success).toBe(false);
  });

  it('treats null as unlimited', () => {
    expect(isWithinQuota(null, 1_000_000)).toBe(true);
    expect(remainingQuota(null, 5)).toBeNull();
  });

  it('enforces finite quotas including the requested amount', () => {
    expect(isWithinQuota(20, 19)).toBe(true);
    expect(isWithinQuota(20, 20)).toBe(false);
    expect(isWithinQuota(20, 18, 3)).toBe(false);
    expect(remainingQuota(20, 25)).toBe(0);
  });
});

describe('locales', () => {
  it('resolves region tags to supported base locales', () => {
    expect(resolveAppLocale(['ar-MA'])).toBe('ar');
    expect(resolveAppLocale(['fr_CA', 'en'])).toBe('fr');
  });

  it('falls back to English for unsupported locales', () => {
    expect(resolveAppLocale(['de-DE', 'ja'])).toBe('en');
    expect(resolveAppLocale([])).toBe('en');
  });

  it('flags only Arabic as RTL', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('fr')).toBe(false);
  });
});

describe('documents', () => {
  it('maps supported MIME types case-insensitively', () => {
    expect(documentKindFromMime('application/PDF')).toBe('pdf');
    expect(documentKindFromMime('image/heic')).toBe('image');
  });

  it('returns null for unsupported types', () => {
    expect(documentKindFromMime('application/zip')).toBeNull();
  });
});
