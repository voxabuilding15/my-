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

Decision (product owner): the whole-document context stays at **150,000 tokens**
(`ai.context.max_context_tokens`), so long PDFs are read in full by summaries, notes, mind
maps, quizzes and full-document analysis. Cost is reduced around it instead:

| Lever            | What it does                                                                                                                                   | Where                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Model routing    | Haiku for chat, explanations, translation, flashcards, practice questions and **any one-page tool**; Sonnet only for whole-document generation | `packages/ai/src/routes.ts` (`page_tool` is new)                |
| Context routing  | Chat sends the whole document only up to 30k tokens (was 100k); above that, the 8 most relevant passages                                       | `retrieval.full_context_max_tokens`, migration `20261004100000` |
| Prompt caching   | Document first with a cache breakpoint, constant system prompt, chat history breakpoint                                                        | `anthropic-provider.ts` (unchanged)                             |
| Response caching | Stored results replay for free, without quota                                                                                                  | `ai_outputs` (unchanged)                                        |
| Guards           | Per-plan quotas, rate limits, daily budget, kill switch                                                                                        | `begin_ai_request` (unchanged)                                  |

Prices are the ones configured in `packages/ai/src/pricing.ts` (editable from the
dashboard). Estimates per request:

| Request                                             | Model  | Before                                       | Now                           |
| --------------------------------------------------- | ------ | -------------------------------------------- | ----------------------------- |
| Chat question on a 150-page document (≈ 60k tokens) | Haiku  | ≈ $0.08, or ≈ $0.01 within 5 min of the last | ≈ $0.015 every question       |
| Chat question on a 30-page document (≈ 9k tokens)   | Haiku  | ≈ $0.015, or ≈ $0.005 cached                 | unchanged (whole text)        |
| Summary or notes of one page                        | —      | ≈ $0.01 (Sonnet)                             | ≈ $0.005 (Haiku)              |
| Summary of a 30-page document                       | Sonnet | ≈ $0.04                                      | unchanged                     |
| Summary of a 500-page document (150k tokens read)   | Sonnet | ≈ $0.40 first, $0.05 cached                  | unchanged (full context kept) |
| Opening a stored summary again                      | —      | free                                         | free                          |

Chat is the most frequent request, so moving medium documents to retrieval is the largest
saving: a student who asks a question every few minutes no longer pays to re-send the whole
document each time the five-minute cache expires. Questions about the whole document still
work: the summary tools read all of it, and chat answers from the passages that match.

Considered and not changed:

- **1-hour cache TTL:** writes cost 2× instead of 1.25×, which only pays off with three or more
  requests on the same document per hour. Most whole-document results are stored after the
  first request, so it would raise the cost of the common case. Revisit with production data
  (`usage_events` cache reads vs writes).
- **One cache for all whole-document tools:** quizzes use structured output, which cannot be
  combined with citations, so their request differs from a summary's and is cached separately.

## Open items

- Cold start under 2 s and 500-document scrolling, confirmed on a physical mid-range
  Android phone (the CI emulator uses software rendering).
- Bundle: web-only Sentry code (replay, canvas, feedback; ~4.6 MB of source) and
  RevenueCat's web mappings (~0.9 MB) are included by the SDKs; they cannot be removed
  without patching those packages. An unused 0.9 MB Material Symbols font comes in through
  Expo's UI package.
