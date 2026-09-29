# Optimisation (Phase 8)

What was measured, what changed, what was tried and rejected, and the budgets that now
guard against regressions. Scope agreed for this phase: app speed, app size, Android
vitals (crashes and ANRs), battery and memory, backend and database, AI cost, security and
Play Store release. Device measurements come from the GitHub-hosted Android emulator (see
[`TESTING.md`](TESTING.md)); flows 04–07 are verified later on a physical device.

## Budgets

| Budget                                        | Limit                       | Now                            | Enforced by                                        |
| --------------------------------------------- | --------------------------- | ------------------------------ | -------------------------------------------------- |
| Hermes bytecode (the JS the app loads)        | ≤ 9.3 MiB                   | 9.02 MiB                       | CI `security` job, `scripts/check-bundle-size.mjs` |
| Assets bundled with the JS                    | ≤ 2.5 MiB                   | 2.23 MiB (was 4.42)            | same                                               |
| Cold start (CI emulator, median of 7)         | < 2 s                       | phone 2.7 s, tablet 2.2 s      | E2E `startup.json` (reported; emulator times vary) |
| Library of 500 documents                      | virtualised, no full layout | FlashList                      | code (library, chat list, conversation)            |
| AI first token (mock model, p95, 50 students) | < 1.5 s                     | 155 ms                         | CI k6 threshold                                    |
| App crashes and ANRs during E2E flows         | 0                           | 0 (phone and tablet, R8 build) | E2E `vitals.json` (job fails otherwise)            |
| Foreign keys without an index                 | 0                           | 0                              | pgTAP `14_performance.test.sql`                    |
| RLS policies calling `auth.uid()` per row     | 0                           | 0 (32 policies checked)        | same                                               |

The cold-start budget is not met on the CI emulator (software rendering on a shared
runner). It has to be confirmed on a physical mid-range device; see "Open items".

## Release build check (R8)

First E2E run on a release build with R8 and resource shrinking (commit 733bfdf,
[run 36634929828](https://github.com/voxabuilding15/my-/actions/runs/36634929828)):

| Check                                         | Phone (Pixel 6)      | Tablet (Pixel Tablet) |
| --------------------------------------------- | -------------------- | --------------------- |
| Build with R8 and resource shrinking          | Pass                 | (same APK)            |
| Cold start, median of 7                       | 2.72 s (1.65 – 5.46) | 2.23 s (1.55 – 3.26)  |
| 01 Sign-up, 02 upload and read, 03 ask the AI | Pass                 | Pass                  |
| 04 Offline reading                            | Known CI limitation  | Known CI limitation   |
| App crashes / ANRs (`vitals.json`)            | 0 / 0                | 0 / 0                 |

Cold start stays within the range measured before this phase (phone 2.3 – 3.0 s, tablet
1.5 – 3.6 s over six runs). R8 did not break any code path the flows reach (no missing
classes at runtime, no crash). The first attempt of that run failed while the runner
downloaded the NDK, before compiling; the re-run passed.

## Changes

**App size**

- **Fonts shipped once.** The eight app fonts were embedded natively by the `expo-font`
  config plugin _and_ bundled again as JS assets for `useFonts`. Native builds now load
  nothing at runtime (`font-assets.ts`); only the web build keeps runtime loading
  (`font-assets.web.ts`). Bundled assets: 4.42 → 2.23 MiB.
- **R8 and resource shrinking** in release builds (`expo-build-properties`), plus PNG
  crunching. As decided, the ProGuard mapping is not uploaded to Sentry: Java/Kotlin stack
  traces there are obfuscated; JavaScript stack traces are unaffected (source maps).
- **Size budget in CI** on the same export the secret scan uses (with source maps, as the
  release build produces them).

**App speed, memory and battery**

- **Virtualised lists**: the chat list and the conversation thread now use FlashList like
  the library, so hundreds of chats or a long conversation no longer lay out every row.
- Already in place and verified in code review: queries pause when the app is in the
  background (React Query focus manager on AppState), the auth token refresh stops in the
  background, document status is polled only while a document is processing and never in
  the background, the offline cache is written at most once a second and holds only study
  material used in the last 24 hours (very large documents are excluded).

**Android vitals**

- Sentry: release health (crash-free sessions), Java/Kotlin and native (NDK) crash handling
  and app-hang tracking are set explicitly; preview and production report as separate
  environments. Android ANRs are reported by Sentry's native SDK (on by default).
- E2E: the device log of each run is kept, and the job fails if the app crashes or
  Android reports an ANR for it (`vitals.json`).

**Backend and database**

- Review: every hot path already has its index (library newest first, conversation list,
  chat history, due flashcards, jobs queue), every foreign key has an index on its leading
  column, and all 32 RLS policies that use `auth.uid()` evaluate it once per query.
- New pgTAP guards keep it that way (`14_performance.test.sql`).

**Security and Play Store release**

- `WRITE_EXTERNAL_STORAGE` is blocked (added by two plugins for Android ≤ 12; the app never
  writes to shared storage). Manifest review: backups off, only the launcher/deep-link
  activity exported, cleartext traffic off (E2E builds excepted), target SDK 36, min SDK 24.
- Unchanged and still enforced in CI: gitleaks on the full history, no secrets in the app
  bundle or dashboard, production dependency audit.

## Measured and rejected

| Idea                                   | Result                                             | Decision |
| -------------------------------------- | -------------------------------------------------- | -------- |
| Metro inline requires (startup)        | Bytecode +12% (10.09 MiB), no gain measurable here | Rejected |
| Expo's experimental Metro tree shaking | Bytecode +8% (10.2 MiB)                            | Rejected |

## AI cost

Prices are the ones configured in `packages/ai/src/pricing.ts` (editable from the
dashboard). Estimates per request:

| Request                                                   | Model  | First request | Repeat within the cache window |
| --------------------------------------------------------- | ------ | ------------- | ------------------------------ |
| Chat question (8 retrieved passages, 20 history messages) | Haiku  | ≈ $0.01       | ≈ $0.01                        |
| Summary of a 30-page document (≈ 9k tokens)               | Sonnet | ≈ $0.04       | ≈ $0.02                        |
| Summary of a 500-page document (150k-token context limit) | Sonnet | ≈ $0.40       | ≈ $0.05                        |

Already in place: light tasks on Haiku, prompt caching of the document and history,
stored results replayed for free, per-plan quotas and a daily budget. The largest lever
left is the whole-document context limit (`ai.context.max_context_tokens`, default 150k).
Lowering it to 50k would cut the 500-page first request to about $0.15, but the model would
see less of long documents. This is a product decision and has not been changed.

## Open items

- Cold start under 2 s and 500-document scrolling, confirmed on a physical mid-range
  Android phone (the CI emulator uses software rendering).
- Bundle: web-only Sentry code (replay, canvas, feedback; ~4.6 MB of source) and
  RevenueCat's web mappings (~0.9 MB) are included by the SDKs; they cannot be removed
  without patching those packages. An unused 0.9 MB Material Symbols font comes in through
  Expo's UI package.
- AI context limit for whole-document actions (see above).
