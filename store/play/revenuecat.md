# RevenueCat production configuration

The app and backend are already wired: the app buys through RevenueCat (Google Play Billing),
identifies the customer with the Supabase user id, and the `revenuecat-webhook` Edge Function
turns RevenueCat events into the user's plan. What remains is creating the products and
connecting the accounts. Product ids are **proposals** — keep them unless you prefer others,
but they cannot be reused once created in Play.

## 1. Google Play Console → Monetise → Subscriptions

| Item                        | Value                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| Subscription product id     | `studexa_premium`                                                       |
| Name                        | Studexa Premium                                                         |
| Base plan 1                 | id `monthly`, auto-renewing, billing period 1 month                     |
| Base plan 2                 | id `annual`, auto-renewing, billing period 1 year                       |
| Offer (optional)            | free trial on the base plans (e.g. 7 days), eligibility "new customers" |
| Prices                      | your decision; set per country in the console                           |
| Grace period / account hold | on (Play defaults)                                                      |

Subscriptions can only be created after an App Bundle with the `BILLING` permission has been
uploaded to a testing track (the closed-testing draft is enough).

## 2. RevenueCat dashboard

1. **Project → Apps → + Google Play**: package `com.studexa.ai`.
2. **Service credentials**: create a Google Cloud service account with Play Console access
   ("View financial data", "Manage orders and subscriptions"), upload its JSON key to
   RevenueCat. This JSON is a secret: it lives only in RevenueCat, never in the repository.
3. **Real-time developer notifications**: follow RevenueCat's "Google Play RTDN" setup
   (Pub/Sub topic), so renewals and cancellations arrive in seconds.
4. **Products**: import `studexa_premium:monthly` and `studexa_premium:annual`.
5. **Entitlement**: `premium`, attach both products.
6. **Offering**: `default` (mark as _current_), packages **$rc_monthly** →
   `studexa_premium:monthly` and **$rc_annual** → `studexa_premium:annual`. The paywall shows
   exactly these two package types and reads prices and trials from the store.
7. **Integrations → Webhooks**: URL
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`, Authorization header =
   the `REVENUECAT_WEBHOOK_SECRET` function secret (see `docs/DEPLOYMENT.md`), environment
   **Production only** (sandbox purchases from testers are sent too if you enable both).
8. **API keys**: copy the **public** Google SDK key (`goog_…`) into the EAS production
   environment as `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Never use the secret key in the app.

## 3. What the app does in production

- Configures the SDK once per signed-in user with that user's id (so webhook events map to
  accounts); logs only errors in release builds.
- Paywall: packages from the current offering (monthly and annual), with introductory free
  trials when the product has one.
- Restore purchases from the paywall.
- The plan shown in the app comes from the backend (`subscriptions` table), updated by the
  webhook; the admin dashboard can also set a plan manually (store `manual`).

## 4. Test before production

- Play Console → Setup → **License testing**: add the testers' Google accounts, so their
  purchases are free test purchases.
- On a closed-testing build: buy monthly, check the user becomes Premium within a minute
  (dashboard → Users), cancel in Play, check the plan returns to Free at expiry; restore
  purchases after reinstalling.
