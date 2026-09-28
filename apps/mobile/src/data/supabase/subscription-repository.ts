import type { PlanTier } from '@studexa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  PlanStatus,
  PremiumPackage,
  SubscriptionRepository,
} from '@/features/subscription/domain/subscription';

import { currentUserId, unwrap } from './postgrest';

/** The subset of the RevenueCat SDK the app uses (injected so it can be faked in tests). */
export type StoreClient = {
  identify(appUserId: string): Promise<void>;
  packages(): Promise<StorePackage[]>;
  /** Resolves false when the user cancels the purchase sheet. */
  purchase(packageId: string): Promise<boolean>;
  restore(): Promise<void>;
};

export type StorePackage = {
  id: string;
  period: 'monthly' | 'yearly';
  price: number;
  priceString: string;
  pricePerMonthString: string | null;
  freeTrialDays: number | null;
};

const SHOWN_METRICS = ['ai_requests', 'chat_messages', 'uploads', 'quizzes', 'flashcard_decks'];

/**
 * Plan state always comes from the database (updated by the RevenueCat webhook), so quotas
 * and the UI never disagree. After a purchase the webhook usually lands within seconds.
 */
export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly store: StoreClient,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async status(): Promise<PlanStatus> {
    const [usageResult, subscriptionResult] = await Promise.all([
      this.client.rpc('get_my_usage'),
      this.client
        .from('subscriptions')
        .select('tier, current_period_end, will_renew')
        .maybeSingle(),
    ]);
    const usage = unwrap(usageResult) as { metric: string; used: number; quota: number | null }[];
    const subscription = unwrap(subscriptionResult) as {
      tier: PlanTier;
      current_period_end: string | null;
      will_renew: boolean | null;
    } | null;
    const active =
      subscription?.tier === 'premium' &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());
    return {
      tier: active ? 'premium' : 'free',
      renewsAt: active && subscription?.will_renew ? subscription.current_period_end : null,
      usage: SHOWN_METRICS.map((metric) => {
        const row = usage.find((u) => u.metric === metric);
        return {
          metric,
          used: Number(row?.used ?? 0),
          quota: row?.quota == null ? null : Number(row.quota),
        };
      }),
    };
  }

  async packages(): Promise<PremiumPackage[]> {
    await this.store.identify(await currentUserId(this.client));
    const packages = await this.store.packages();
    const monthly = packages.find((p) => p.period === 'monthly');
    return packages
      .sort((a, b) => Number(b.period === 'yearly') - Number(a.period === 'yearly'))
      .map((p) => ({
        id: p.id,
        period: p.period,
        price: p.priceString,
        pricePerMonth: p.period === 'yearly' ? p.pricePerMonthString : null,
        savingsPercent:
          p.period === 'yearly' && monthly && monthly.price > 0
            ? Math.round((1 - p.price / 12 / monthly.price) * 100)
            : null,
        trialDays: p.freeTrialDays,
      }));
  }

  async purchase(packageId: string) {
    await this.store.identify(await currentUserId(this.client));
    if (!(await this.store.purchase(packageId))) return this.status();
    return this.awaitPremium();
  }

  async restore() {
    await this.store.identify(await currentUserId(this.client));
    await this.store.restore();
    return this.awaitPremium();
  }

  /** Polls briefly for the webhook to update the plan. */
  private async awaitPremium(attempts = 6): Promise<PlanStatus> {
    let status = await this.status();
    for (let i = 1; i < attempts && status.tier !== 'premium'; i++) {
      await this.wait(1500);
      status = await this.status();
    }
    return status;
  }
}
