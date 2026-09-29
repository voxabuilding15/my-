# Testing

How Studexa is tested, what the latest run measured, what is still open, and how ready it
is for production. Numbers come from the Phase 7 run on the local stack (Supabase CLI
2.118 in Docker, 4-core container) unless a CI source is named.

## Where it runs

Every push and pull request runs the `CI` workflow (format, types, lint, unit tests with
coverage, worker benchmark and leak check, Deno tests and leak check, pgTAP on plain
Postgres and on real Supabase, db lint, integration suites, k6, migration upgrade test,
gitleaks, dependency audit, bundle secret scan, worker image) and the `E2E (Android)`
workflow (APK build, then Maestro on a phone and a tablet emulator).

## Test layers

| Layer                                                                          | Tool        | Where                               | Count                    |
| ------------------------------------------------------------------------------ | ----------- | ----------------------------------- | ------------------------ |
| Shared logic (FSRS, text, privacy scrubber, resumable uploads, contracts)      | Vitest      | `packages/shared`                   | 57                       |
| AI provider, prompts, routing, pricing                                         | Vitest      | `packages/ai`                       | 16                       |
| Document worker (extraction, queue)                                            | Vitest      | `services/document-processor`       | 25                       |
| Mobile app: flows, repositories, offline, timeouts, telemetry                  | Jest + RNTL | `apps/mobile`                       | 100                      |
| Mobile quality: accessibility (23 screens × en/ar), contrast, theming, tablets | Jest        | `apps/mobile/src/__tests__/quality` | 59 (159 mobile in total) |
| Admin dashboard                                                                | Vitest      | `apps/admin`                        | 12                       |
| Edge Functions (handlers, auth, email, SSE)                                    | Deno test   | `supabase/functions`                | 54 (+1 leak test)        |
| Database: RLS, grants, quotas, jobs, billing, AI admission                     | pgTAP       | `supabase/tests/database`           | 217                      |
| Integration on the real stack                                                  | Vitest      | `tests/integration/suites`          | 118                      |
| Load                                                                           | k6          | `tests/load`                        | 2 scenarios              |
| End-to-end on Android (phone + tablet)                                         | Maestro     | `tests/e2e`                         | 7 flows + device metrics |

**Integration suites** run against Postgres, GoTrue, Storage, PostgREST and the Edge
Runtime in Docker, the real document worker, and a mock server for Anthropic, Voyage,
email and Sentry (`tests/integration/src/mock-server.ts`): auth (9), documents and large
PDFs (12), AI pipeline (14), RevenueCat webhook (8), security regression (61), concurrency
and crash recovery (6), slow networks and interrupted uploads (4), privacy of diagnostics (4).

Run everything locally:

```bash
pnpm test                 # unit and component tests
pnpm test:coverage        # same, with coverage
pnpm test:functions       # Deno
supabase test db          # pgTAP on the local stack
pnpm test:integration     # starts the backend, runs tests/integration
tests/load/run.sh         # k6 (backend running)
```

## Coverage

Unit and component tests only; the integration suites exercise the wiring these numbers
leave out (Supabase clients, servers, `index.ts` entry points).

| Package                         | Lines | Branches | Functions |
| ------------------------------- | ----- | -------- | --------- |
| shared                          | 92.7% | 84.6%    | 85.7%     |
| Edge Function handlers + shared | 85.5% | 84.3%    | 76.9%     |
| mobile                          | 75.4% | 59.6%    | 66.0%     |
| ai                              | 71.5% | 79.4%    | 56.8%     |
| document-processor              | 40.8% | 84.4%    | 72.7%     |
| admin                           | 35.7% | 21.8%    | 29.1%     |

Every public table has RLS tests (pgTAP) and a cross-user test with real JWTs (integration).

## Performance

**AI endpoint under load** (k6, mock model answering in ~20 ms, so this is Studexa's own
overhead: JWT, admission, quotas, database, streaming):

| Scenario                                            | Result                                                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50 concurrent students, ~8 questions/min each, 90 s | 541/541 answers complete, 0 errors, 0 rate-limited                                                                                                                                                 |
| Time to first byte                                  | median 80 ms, p95 155 ms, p99 322 ms                                                                                                                                                               |
| Full answer                                         | median 117 ms, p95 208 ms                                                                                                                                                                          |
| 100-client burst, no pauses                         | Local: 0 server errors, p95 4.8 s as the single runtime container saturates. On 2-vCPU CI runners the local runtime terminates some isolates, so the burst budget is < 5% failed (steady state: 0) |

**Document processing**

| Document                                            | Extraction (worker only) | End to end (upload → ready → embeddings) |
| --------------------------------------------------- | ------------------------ | ---------------------------------------- |
| 100 pages                                           | 194 ms                   | 0.6 s                                    |
| 250 pages                                           | 478 ms                   | 1.7 s (250 chunks embedded)              |
| 500 pages                                           | 820 ms                   | 3.6 s (500 chunks embedded)              |
| 5,600 pages / 14 MB, resumed after a cut connection | —                        | uploaded, processed, ready               |

**Slow networks** (throttling proxy, sign-in → list → upload → first AI byte → full answer)

| Profile                      | Sign-in | Upload         | First AI byte | Full answer |
| ---------------------------- | ------- | -------------- | ------------- | ----------- |
| 3G (200/90 KB/s, 150 ms)     | 0.6 s   | 0.4 s (250 KB) | 1.0 s         | 4.6 s       |
| 2G EDGE (30/12 KB/s, 400 ms) | 1.1 s   | 0.9 s (38 KB)  | 1.1 s         | 11.9 s      |

**Memory leaks**

- ai function: 3,000 requests (10% cancelled mid-stream): heap +0.2 MB.
- Worker: 300 documents of 50 pages: heap −1.3 MB.
- App: PSS over six repeated AI sessions on the emulator (E2E job, fails above 15% growth).

**20 simultaneous students** signing up, uploading, waiting for processing and asking the
AI: all complete in 2.1 s; quota counters stay exact under parallel requests (6 quizzes at
once on a 3-per-day plan → exactly 3 succeed); parallel workers never process a job twice.

**Android emulator (E2E workflow, GitHub-hosted emulators, API 34, local backend)**

| Check                                                   | Phone (Pixel 6)          | Tablet (Pixel Tablet)    |
| ------------------------------------------------------- | ------------------------ | ------------------------ |
| Cold start, median of 7 (six runs)                      | 2.3 – 3.0 s              | 1.5 – 3.6 s              |
| 01 First launch, sign-up, email code, restart signed in | Pass                     | Pass                     |
| 02 Upload a PDF and read it                             | Pass                     | Pass                     |
| 03 Ask the AI, streamed answer with page citation       | Pass                     | Pass                     |
| 04 Offline reading                                      | Fails (see known issues) | Fails (see known issues) |
| 05 Themes, 06 crash recovery, 07 sign-out               | Not reached              | Not reached              |
| 3G / 2G, memory (PSS), battery, visual diff             | Not measured on device   | Not measured on device   |

Authentication on the device, from the app's own requests in the gateway and database
logs: sign-up `POST /auth/v1/signup` 200; email verification (`email_verified: true`);
refresh token `POST /auth/v1/token?grant_type=refresh_token` 200; session kept after a
cold restart (flow 01). Sign-out on device was not reached (flow 07); it is covered by the
integration auth suite. Google sign-in needs a Google account and OAuth client IDs, so it
is a manual check on a real device.

## Security status

| Check                                                                         | Status                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| RLS on every user table; cross-user reads/writes with real JWTs               | Pass (61 integration + pgTAP)                 |
| Service-only and staff RPCs refused to users; staff require 2FA (aal2)        | Pass                                          |
| Storage: owner-only reads, uploads only through signed slots                  | Pass                                          |
| Declared-size bypass, foreign document/conversation access, hostile input     | Pass                                          |
| Email verification cannot be bypassed or self-granted                         | Pass (bug found and fixed, below)             |
| Secrets in git history (gitleaks)                                             | Clean (one reviewed test fixture allowlisted) |
| Secrets in the shipped app bundle and dashboard                               | Clean                                         |
| Production dependency vulnerabilities (high/critical)                         | None; 2 moderate (below)                      |
| No personal data or document text in Sentry, error log, analytics, job errors | Pass (forced failures quoting user text)      |
| Database lint (plpgsql_check)                                                 | Clean                                         |
| Migrations append-only; upgrade with data keeps every row                     | Pass                                          |

## Bugs found and fixed by Phase 7

1. **Email verification bypass (critical).** With confirmation links off, GoTrue marks
   every new account confirmed, so unverified users could use AI and uploads. Verification
   now lives in service-role-only `app_metadata`.
2. **Chat never saved (critical).** A two-row insert sent `NULL` citations for the question.
3. **Signed-in users told to sign in again under load.** A busy auth server made functions
   answer 401; they now retry and answer 503.
4. **Personal data in diagnostics.** Postgres errors quoted whole rows (a chat question)
   into the error log; provider errors could echo prompts. One scrubber now covers Sentry,
   logs, the error log and job errors on every platform.
5. **Errors logged as `[object Object]`**, hiding root causes.
6. **Touch targets under 48 dp** on chips, segmented controls and checkboxes.
7. **Uploads restarted from zero** after any interruption: now resumable (TUS), including
   after the app is killed.
8. **AI answers could spin forever** on a dead connection: first-byte and idle timeouts,
   server heartbeats.
9. **Nobody could stay signed in on Android (critical).** The encrypted session storage
   passed its key name as a string where expo-crypto expects base64 ("bad base-64"), so
   saving failed; and Android's `AESSealedData.fromCombined` accepts only bytes, so every
   read failed and deleted the session. Fixed, with tests that enforce the native contract.
10. **Verification code field unusable with TalkBack.** The hidden input was 1×1 and fully
    transparent; it now covers the code boxes (still invisible).
11. **Chat message bar hidden behind the keyboard on Android** (edge-to-edge window does not
    shrink): the screen now avoids the keyboard on both platforms.

## Remaining known issues

| Issue                                                                                                                                                                                                    | Impact                                                                                                                | Plan                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| AI quality evaluation (en/fr/ar) not run yet                                                                                                                                                             | Answer quality unmeasured with the real model                                                                         | Runs once an Anthropic key is provided (agreed)                        |
| E2E visual baselines not committed yet                                                                                                                                                                   | First runs report `no-baseline` instead of diffs                                                                      | Commit screenshots from the first green E2E run                        |
| Load test numbers are local, single-container                                                                                                                                                            | Not a production capacity figure                                                                                      | Repeat against a staging project before launch                         |
| Uploads interrupted for over 2 hours cannot resume                                                                                                                                                       | User re-uploads; the stale draft is removed within 24 h                                                               | Could add a "renew slot" action                                        |
| 2 moderate advisories: `uuid` (build tooling only), `decode-uri-component` via expo-router (malformed deep link can slow the app)                                                                        | Low                                                                                                                   | Update with the next Expo SDK patch                                    |
| Admin dashboard coverage 36%                                                                                                                                                                             | UI regressions less likely to be caught                                                                               | Add page tests as the dashboard evolves                                |
| Offline: very large documents (over 150 pages) are not kept for offline reading                                                                                                                          | Must be online to read them                                                                                           | Page-level cache in a later phase                                      |
| "Legal pages" workflow fails on feature branches                                                                                                                                                         | Deploys GitHub Pages only from the default branch                                                                     | Expected; runs on `main`                                               |
| E2E flow 04 (offline): after `back` / `setAirplaneMode` the app goes to the background on the CI emulator (no crash, kill or error in the device log)                                                    | Offline flow and the flows after it are not verified on device; offline mode is covered by jest and integration tests | CI environment limitation (below); verify on a physical Android device |
| Device metrics missing: 3G/2G, memory, battery and visual baselines on the emulator                                                                                                                      | Only cold start measured on device                                                                                    | Produced once flows 04–07 run                                          |
| Flaky CI tests (passed on re-run): `ai.test.ts` "replays a stored result for free" (one stray mock call); `network.test.ts` "app killed mid-upload" (`reuse_document_extraction` statement timeout once) | Occasional red CI                                                                                                     | Watch; investigate if either repeats                                   |
| CI emulators occasionally stall: "Pixel Launcher isn't responding" dialogs (hidden with `hide_error_dialogs`), and one backend start where the document worker did not come up                           | Random E2E failures unrelated to the app                                                                              | Re-run; consider larger runners                                        |
| Temporary E2E diagnostics still in place (raw auth errors, session-storage step log, gateway/GoTrue dumps, foreground sampling)                                                                          | Extra log output in E2E builds only (`EXPO_PUBLIC_E2E_DIAGNOSTICS`)                                                   | Remove once the emulator suites pass                                   |

## Production readiness score

| Area                                                             | Weight | Score                                      |
| ---------------------------------------------------------------- | ------ | ------------------------------------------ |
| Security and privacy                                             | 25%    | 9.5                                        |
| Functional correctness (unit, integration, E2E)                  | 25%    | 8 (E2E flows 04–07 not verified on device) |
| Reliability (offline, resume, timeouts, crash recovery, retries) | 15%    | 8.5                                        |
| Performance and scalability                                      | 15%    | 7.5 (device memory/battery not measured)   |
| Accessibility, tablets, themes                                   | 10%    | 9                                          |
| AI answer quality                                                | 10%    | 6 (not yet evaluated with the real model)  |
| **Total**                                                        |        | **8.3 / 10**                               |

Blocking before launch: the multilingual AI evaluation with the real key, a staging load
test, and the remaining device checks (offline, themes, crash recovery, sign-out, slow
networks, memory, battery) on a real Android phone or an emulator environment where
flow 04 can be diagnosed.

**CI environment limitation (Phase 7 closed here).** On the GitHub-hosted emulator the app
moves to the background during flow 04, right after the `back` and `setAirplaneMode`
steps; the device log shows no crash, kill or error, and the app's own screens behave as
expected up to that point. The logs available from this environment (job logs only; the
artifact download host is blocked here) cannot tell which of the two steps causes it, so
no fix was applied. Decision: record it as a CI limitation and verify flow 04 (and flows
05–07) on a physical Android device when needed. All fixes confirmed on the emulator are kept.
