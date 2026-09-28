import type { PlanTier } from '@studexa/shared';

export type UsageMeter = { metric: string; used: number; quota: number | null };

export type PlanStatus = { tier: PlanTier; renewsAt: string | null; usage: UsageMeter[] };

export type PremiumPackage = {
  id: string;
  period: 'monthly' | 'yearly';
  /** Localised price string from the store (e.g. "€4.99"). */
  price: string;
  /** Yearly packages: equivalent per-month price. */
  pricePerMonth: string | null;
  savingsPercent: number | null;
  trialDays: number | null;
};

export interface SubscriptionRepository {
  status(): Promise<PlanStatus>;
  packages(): Promise<PremiumPackage[]>;
  purchase(packageId: string): Promise<PlanStatus>;
  restore(): Promise<PlanStatus>;
}
