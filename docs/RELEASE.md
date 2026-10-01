# Studexa — Android release (Phase 9)

How a production build is made, what is verified automatically, and the checklist of manual
steps. **Nothing is ever uploaded to Google Play automatically**: building, submitting and
publishing are separate, manual commands, and the last two need your approval each time.

Store listing, graphics and every Play Console form: [`store/play/`](../store/play/README.md).

## How a release is built

| Piece             | Where                                   | What it does                                                                                                                        |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Build profiles    | `apps/mobile/eas.json`                  | `development` (debug APK), `preview` (internal APK), `production` (App Bundle)                                                      |
| Version           | `app.config.ts` `version` (1.0.0)       | Shown to users. The Android **versionCode** is stored by EAS (`appVersionSource: remote`) and incremented on every production build |
| Signing           | EAS credentials                         | EAS keeps the **upload key**; Google Play App Signing keeps the app signing key                                                     |
| Production values | GitHub variables → EAS `production`     | `EXPO_PUBLIC_*` values (below); an EAS production build **fails** if one is missing, so a store build can never run on demo data    |
| Code shrinking    | `expo-build-properties`                 | R8 and resource shrinking in release builds; no mapping upload (decision of Phase 8)                                                |
| Console output    | `apps/mobile/babel.config.js`           | Release bundles drop `console.log/info/debug/warn/trace`; `console.error` stays                                                     |
| OTA updates       | `runtimeVersion` + `updates` + channels | EAS Update, channel `production`; an update only reaches builds with the same native fingerprint                                    |
| Verification      | `.github/workflows/release-android.yml` | Every app change: builds the production AAB with Gradle and checks it (next section)                                                |

### Checked on every change (release-bundle verification)

`scripts/verify-release-bundle.mjs` on the Gradle-built production bundle:

- not debuggable, no cleartext (HTTP) traffic, backups disabled
- package `com.studexa.ai`, versionName `1.0.0`, a versionCode
- only reviewed permissions; none of: advertising ID, microphone, overlay, shared-storage write,
  location, contacts, photo/video library, biometrics
- R8 ran (mapping written), R8 and resource shrinking enabled, Hermes enabled
- JavaScript compiled to Hermes bytecode; no dev dependencies or test files in the bundle; no
  `console.log/info/debug` in app code

The CI build is signed with the debug key and **cannot** be uploaded to Play — it only proves
the configuration. The signed bundle comes from EAS.

### Production environment values (EAS → Project → Environment variables → production)

| Variable                             | Value                                                  | Visibility |
| ------------------------------------ | ------------------------------------------------------ | ---------- |
| `EXPO_PUBLIC_SUPABASE_URL`           | `https://<ref>.supabase.co`                            | Plain text |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`      | Supabase anon key (public by design, protected by RLS) | Plain text |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`   | Google OAuth **web** client id                         | Plain text |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat **public** Google key (`goog_…`)            | Plain text |
| `EXPO_PUBLIC_SENTRY_DSN`             | Sentry DSN of the React Native project                 | Plain text |
| `EXPO_PUBLIC_LEGAL_BASE_URL`         | `https://voxabuilding15.github.io/my-/`                | Plain text |
| `SENTRY_ORG`, `SENTRY_PROJECT`       | for JavaScript source-map upload                       | Plain text |
| `SENTRY_AUTH_TOKEN`                  | Sentry auth token (source maps)                        | **Secret** |

Never add service-role, Anthropic, Voyage or RevenueCat secret keys here: they belong to the
backend only (`docs/DEPLOYMENT.md`).

## Building the signed App Bundle (GitHub Actions → EAS)

The Expo API cannot be reached from every environment, so the build runs from GitHub Actions.

**One-time setup in GitHub** (Settings → Secrets and variables → Actions):

| Kind     | Name                                 | Value                                                                                                                                       |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret   | `EXPO_TOKEN`                         | expo.dev → Account settings → Access tokens → Create token                                                                                  |
| Variable | `EXPO_PUBLIC_SUPABASE_URL`           | Supabase → Project settings → API → Project URL                                                                                             |
| Variable | `EXPO_PUBLIC_SUPABASE_ANON_KEY`      | Supabase → Project settings → API → `anon` public key                                                                                       |
| Variable | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`   | Google Cloud → Credentials → OAuth client ID of type **Web** (`….apps.googleusercontent.com`)                                               |
| Secret   | `GOOGLE_WEB_CLIENT_SECRET`           | the same Web client's secret (backend only: Supabase Google provider, set by Deploy backend)                                                |
| Variable | `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat → Project → API keys → Google **public** SDK key (`goog_…`)                                                                      |
| Variable | `SENTRY_ORG`                         | Sentry organisation slug (Settings → Organization → slug)                                                                                   |
| Secret   | `SENTRY_AUTH_TOKEN`                  | Sentry → User settings → Personal tokens; scopes `org:read`, `team:read`, `team:write`, `project:read`, `project:write`, `project:releases` |
| Variable | `EXPO_PUBLIC_LEGAL_BASE_URL`         | optional, defaults to `https://voxabuilding15.github.io/my-/`                                                                               |
| Variable | `EXPO_ACCOUNT`                       | optional, only if the token can create projects in several accounts                                                                         |

With `SENTRY_ORG` and `SENTRY_AUTH_TOKEN`, the workflows create the Sentry projects
`studexa-mobile` (React Native) and `studexa-backend` on first use and fill in the DSNs
(`scripts/sentry-dsn.sh`); `EXPO_PUBLIC_SENTRY_DSN` / `BACKEND_SENTRY_DSN` variables override
them. The same token uploads the JavaScript source maps during the EAS build.

**Build:** Actions → **Android release** → Run workflow → tick **"Also start the signed production
build on EAS"**. The `eas-build` job then:

1. checks that every value above is present (and names the missing ones);
2. on the first run, creates the EAS project and commits `apps/mobile/app.json` (project id and
   owner — not secret) back to the branch, so later builds reuse it;
3. copies the values into the EAS **production** environment (the Sentry token as a secret);
4. builds the signed App Bundle on EAS — the first build generates the **upload keystore**,
   which EAS keeps (download a backup from expo.dev → Credentials);
5. downloads the bundle, verifies it (`--bundle` mode: manifest, permissions, R8, Hermes, signed
   with the upload key) and prints the upload certificate SHA-1/SHA-256 for Google Sign-In;
6. attaches `studexa-production-aab` to the run for 14 days. **It never submits to Play.**

**Google sign-in needs one Android OAuth client per signing key** (Google Cloud → Credentials →
Create OAuth client ID → Android, package `com.studexa.ai`): one with the EAS upload-key SHA-1
(printed in the run summary), and — after the first upload to Play — one with the **App signing
key** SHA-1 (Play Console → Test and release → App integrity), because Play re-signs what
testers install. No rebuild is needed for either.

Locally (where expo.dev is reachable) the same build is `npx eas-cli@24 build -p android
--profile production` from `apps/mobile`.

**After your approval only:**

```bash
# Upload the build as a DRAFT to the closed-testing track (eas.json → submit.production).
# Needs a Google Play service-account key (JSON) configured in EAS; the key never goes in git.
npx eas-cli@24 submit -p android --profile production --latest

# JavaScript-only fix for installed builds (same native fingerprint), after testing on preview:
npx eas-cli@24 update --channel production --message "<what changed>"
```

## Release checklist

Legend: ✅ done in the repository · 👤 needs you (accounts, secrets, legal, approvals)

### Build and code

- ✅ EAS profiles, remote versionCode, production App Bundle, closed-track submit profile (draft)
- ✅ Version 1.0.0; versionCode assigned by EAS on each build
- ✅ R8 + resource shrinking + PNG crunching; Hermes bytecode
- ✅ No console.log/info/debug/warn in release JavaScript; RevenueCat logs errors only
- ✅ No debug flags: dev-only code is behind `__DEV__` (compiled out); E2E network exception only
  when `E2E_BUILD=1`; production build refuses demo mode or missing values
- ✅ No test files or dev dependencies in the bundle (verified on every change)
- ✅ Permissions reviewed; biometric permissions removed; advertising ID absent
- ✅ EAS Update configured (fingerprint runtime, `production` / `preview` channels)
- ✅ Crash reporting: Sentry (crashes, native crashes, ANRs, app hangs, release health)
- ✅ Tablet navigation rail fixed (labels under icons; the default wide sidebar squeezed the
  content on portrait tablets)
- ✅ One-run EAS pipeline in GitHub Actions: project link, production values, signed build,
  verification, bundle attached (never submitted)
- 👤 GitHub secret `EXPO_TOKEN` and the production variables (table above), then run the
  workflow; commit the `app.json` it shows on the first run
- 👤 Test the signed build on a physical phone and tablet: flows 04–07 (offline, themes, crash
  recovery, sign-out), cold start < 2 s, a 500-document library, a purchase with a license tester

### Backend (before any tester signs in)

- 👤 Production Supabase, Cloud Run worker, secrets, schedules, admin dashboard — `docs/DEPLOYMENT.md`
- 👤 Anthropic workspace with a spend limit; `ai.daily_budget_usd` set
- 👤 Google Sign-In: Android OAuth client with the **Play App Signing** SHA-1 (Play Console →
  Setup → App signing) and the EAS upload-key SHA-1
- 👤 Sentry projects and DSNs

### Legal

- 👤 Fill `site/legal.config.json` (publisher, address, country, contact email, effective date,
  database region, backup retention, liability amount), verify each AI provider's current
  terms and have the texts reviewed, then set `aiProviderTermsVerified` and `legalReviewDone`
  to `true` and push. `node scripts/build-legal-site.mjs --check` must pass.

### Play Console

- ✅ Listing text, icon, feature graphic, phone and tablet screenshots — `store/play/`
- ✅ Answers for Data safety, Content rating, App access, Ads, Advertising ID, Target audience,
  other declarations — `store/play/forms/`
- 👤 Create the app (name "Studexa", default language English (US), app, free with in-app purchases)
- 👤 Enter the listing, upload graphics, answer the forms from `store/play/forms/`
- 👤 Create the review account (`store/play/forms/app-access.md`)
- 👤 Subscriptions and RevenueCat — `store/play/revenuecat.md` (products can be created after the
  first bundle is uploaded to a testing track)
- 👤 **Approve** the upload of the first build as a closed-testing draft (`eas submit`), then
  review and start the rollout in the console yourself
- 👤 Closed test: ≥ 12 testers for 14 days, then apply for production —
  `store/play/closed-testing.md`
