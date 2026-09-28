import { AppError } from '@studexa/shared';
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases';

import type { StoreClient, StorePackage } from './subscription-repository';

const DAYS_PER_UNIT: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** RevenueCat (Google Play Billing). The app user id is the Supabase user id, so webhooks map to accounts. */
export function createRevenueCatStore(apiKey: string | undefined): StoreClient {
  let configuredFor: string | null = null;
  let packages = new Map<string, PurchasesPackage>();

  const requireKey = () => {
    if (!apiKey) throw new AppError('unknown', 'RevenueCat is not configured');
    return apiKey;
  };

  return {
    async identify(appUserId) {
      if (configuredFor === appUserId) return;
      if (configuredFor === null && !(await Purchases.isConfigured())) {
        Purchases.configure({ apiKey: requireKey(), appUserID: appUserId });
      } else {
        await Purchases.logIn(appUserId);
      }
      configuredFor = appUserId;
    },
    async packages() {
      const offerings = await Purchases.getOfferings();
      const available = offerings.current?.availablePackages ?? [];
      packages = new Map(available.map((p) => [p.identifier, p]));
      return available.flatMap((p): StorePackage[] => {
        const period =
          p.packageType === PACKAGE_TYPE.ANNUAL
            ? 'yearly'
            : p.packageType === PACKAGE_TYPE.MONTHLY
              ? 'monthly'
              : null;
        if (!period) return [];
        const intro = p.product.introPrice;
        return [
          {
            id: p.identifier,
            period,
            price: p.product.price,
            priceString: p.product.priceString,
            pricePerMonthString: p.product.pricePerMonthString,
            freeTrialDays:
              intro && intro.price === 0
                ? intro.periodNumberOfUnits * (DAYS_PER_UNIT[intro.periodUnit] ?? 1)
                : null,
          },
        ];
      });
    },
    async purchase(packageId) {
      const selected = packages.get(packageId);
      if (!selected) throw new AppError('not_found');
      try {
        await Purchases.purchasePackage(selected);
        return true;
      } catch (error) {
        if ((error as { userCancelled?: boolean | null }).userCancelled) return false;
        throw new AppError('unknown', String(error));
      }
    },
    async restore() {
      await Purchases.restorePurchases();
    },
  };
}
