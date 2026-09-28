# Studexa — Architecture

Studexa is an AI study assistant for Android. This document is the blueprint every
implementation phase follows. Decisions are recorded with their reasoning in
[Decision log](#decision-log).

## System overview

```mermaid
flowchart LR
  subgraph Device["Android app (Expo / React Native)"]
    UI[Screens & components] --> Hooks[Feature hooks<br/>TanStack Query]
    Hooks --> Repo[Repositories]
    Repo --> Mock[(Mock data source)]
    Repo --> SB[Supabase client]
    OCRd[ML Kit OCR<br/>on-device]
  end

  subgraph Supabase
    Auth[Auth<br/>email + Google]
    DB[(Postgres + RLS<br/>pgvector)]
    Storage[(Storage<br/>private buckets)]
    Fn[Edge Functions<br/>AI · quotas · webhooks]
  end

  Admin[Admin dashboard<br/>React SPA · Cloudflare Pages] -- staff RPCs (MFA) --> DB
  Admin --> Fn
  SB --> Auth & DB & Storage & Fn
  Fn --> Claude[Anthropic Claude API]
  Fn -- wake --> Worker[Document processor<br/>Cloud Run]
  Worker -- claim jobs / save text --> DB
  Worker --> Storage
  Sched[Cloud Scheduler] -- every minute --> Worker
  RC[RevenueCat] -- webhook --> Fn
  Device -- purchases --> RC
  Device & Fn & Worker & Admin -. errors .-> Sentry[(Sentry)]
```

Key properties:

- **The app never holds a secret.** It ships only the Supabase URL + anon key (public by
  design) and the RevenueCat public key. The Anthropic key, Supabase service-role key and
  webhook secrets exist only in Edge Function secrets.
- **Authorization lives in the database.** Every table has Row Level Security; a bug in
  client code cannot expose another user's data.
- **All AI traffic goes through Edge Functions**, which authenticate the user, check quotas
  from `plan_limits`, rate-limit, call Claude, record usage, and return validated output.
- **Limits are data, not code.** Free/Premium quotas live in the `plan_limits` table and are
  edited from the admin dashboard; the app reads them at runtime, so no release is needed.

## Repository layout

```
.
├── apps/
│   ├── mobile/          Expo SDK 57 Android app
│   └── admin/           Admin dashboard (Vite + React SPA on Cloudflare Pages)
├── services/
│   └── document-processor/  Text extraction worker (Node 22, Google Cloud Run)
├── packages/
│   ├── shared/          Types, zod schemas and constants shared by app, admin and functions
│   └── ai/              AI providers, prompts, routing, schemas (functions + worker)
├── supabase/
│   ├── migrations/      Versioned SQL migrations (Phase 2)
│   ├── functions/       Edge Functions (Deno)
│   └── tests/           pgTAP database tests
├── docs/                Architecture, API, database, deployment, maintenance
└── .github/workflows/   CI: format, typecheck, lint, test
```

Tooling: **pnpm workspaces + Turborepo**, TypeScript **strict** everywhere (plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Prettier, ESLint.

`packages/shared` is the single source of truth for cross-cutting contracts — plan tiers and
limit shape, AI actions, supported locales and file types, error codes. The app, the admin
dashboard and the Edge Functions all import it, so a contract change is a compile error
everywhere it matters instead of a runtime bug.

## Mobile app

### Layers (Clean Architecture, feature-first)

```
apps/mobile/src/
├── app/                 Routes only (Expo Router). Each file re-exports a feature screen.
├── core/                App-wide infrastructure, no feature knowledge
│   ├── config/          Validated env (zod) + automatic mock mode
│   ├── i18n/            i18next, en/ar/fr resources, RTL handling
│   ├── theme/           Design tokens, ThemeProvider, useStyles
│   ├── query/           TanStack Query client + retry policy
│   ├── storage/         Persisted preferences (SQLite KV)
│   └── providers/       Provider composition
├── shared/ui/           Reusable, feature-agnostic components
└── features/<feature>/
    ├── domain/          Entities, repository interfaces, pure use-case logic
    ├── data/            Repository implementations: Supabase + mock
    ├── presentation/    Screens, components, hooks
    └── index.ts         Public API of the feature
```

Dependency rule: `presentation → domain ← data`. Screens depend on repository
_interfaces_; the concrete implementation (Supabase or mock) is selected once, from
`env.useMocks`. Features import each other only through `index.ts` — enforced by ESLint.

Routes stay thin (`export { HomeScreen as default } from '@/features/home'`) so navigation
can be reorganised without touching feature code.

### Planned features

| Feature         | Responsibility                                                              |
| --------------- | --------------------------------------------------------------------------- |
| `auth`          | Email/password, Google sign-in, password reset, session persistence         |
| `home`          | Dashboard: recent files and chats, stats, continue learning, streak         |
| `documents`     | Upload PDF/DOCX/TXT, camera, gallery, rename, delete, search, favorites     |
| `reader`        | Page viewer, bookmarks, "ask about this page"                               |
| `ocr`           | Hybrid OCR (ML Kit on device, Claude vision for Arabic/handwriting)         |
| `ai-tools`      | Explain, summarize, translate, ELI10, notes, mind map, study plan, practice |
| `chat`          | Per-document conversations grounded in the document, search, delete         |
| `quiz`          | MCQ / true-false / short answer, timed mode, scoring, review                |
| `flashcards`    | Generated decks, known/unknown, spaced repetition (FSRS)                    |
| `notes`         | CRUD, pin, search                                                           |
| `voice`         | Read summaries aloud (expo-speech)                                          |
| `notifications` | Daily and study reminders (expo-notifications)                              |
| `settings`      | Language, theme, notifications, account, privacy, subscription              |
| `subscription`  | RevenueCat paywall, entitlement state, usage meters                         |

### State management

| Kind                       | Tool                             | Why                                          |
| -------------------------- | -------------------------------- | -------------------------------------------- |
| Server data                | TanStack Query                   | Caching, dedup, retries, pagination, offline |
| Local preferences          | Zustand + `expo-sqlite/kv-store` | Tiny, synchronous hydration (no flash)       |
| Auth tokens                | `expo-secure-store` (Phase 3)    | Android Keystore-backed encryption           |
| Offline document/text data | `expo-sqlite` (Phase 4+)         | Queryable local cache                        |

The query client never retries `unauthenticated`, `forbidden`, `not_found`,
`validation_failed` or `quota_exceeded` errors — retrying cannot fix them.

### Design system

- Tokens in `core/theme/tokens.ts`: colors (light + dark), spacing, radii, typography,
  motion. Brand blue `#0066FF` comes from the Studexa mark; on dark backgrounds brand-colored
  _text_ uses `#5C9DFF` to keep WCAG AA contrast.
- Styling uses `StyleSheet` + tokens via `useStyles(makeStyles)` — no runtime styling engine.
- Layout uses logical properties (`start`/`end`, `marginStart`) so Arabic mirrors correctly.
- Theme preference: system / light / dark, persisted.
- Icons: Material Community Icons (Material Design, ships with Expo).

### Internationalisation

- UI locales: **English, Arabic (RTL), French**. English is the typed source; `ar` and `fr`
  must match its shape (`Translations` type) and a test verifies no key is missing or blank.
- Device language is used unless the user picks one. Switching between LTR and RTL requires
  an app restart on Android; `changeLocale()` reports this so Settings can prompt and reload.
- AI translation supports many more languages (`TRANSLATION_LANGUAGES` in shared).

### Mock mode

When `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` are absent (or `EXPO_PUBLIC_USE_MOCKS=true`), the
app runs entirely on in-memory mock repositories and shows a "Demo mode" badge. Every feature
is built against the repository interface first, so it works end-to-end before credentials
exist and switches to production by setting env vars — no code changes.

## Backend (Supabase)

### Components

| Component        | Use                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- |
| Auth             | Email/password (with email confirmation), Google OAuth, password recovery             |
| Postgres         | Normalised schema, RLS on every table, migrations in `supabase/migrations`            |
| pgvector + FTS   | Hybrid retrieval for large documents ([details](DATABASE.md#document-retrieval))      |
| Storage          | Private `documents` bucket, path `{user_id}/{document_id}/...`, RLS-guarded           |
| Edge Functions   | `ai`, `document-upload`, `revenuecat-webhook`, `storage-janitor`, `admin-users`, auth |
| Job queue        | `private.jobs` (Postgres, SKIP LOCKED leases, retries, dead letter)                   |
| Cloud Run        | `document-processor`: extracts text once, chunks, caches ([BACKEND](BACKEND.md))      |
| Cron (`pg_cron`) | Data retention, stuck-job and stale-upload cleanup                                    |

### Request flow for an AI action

1. App calls `functions.invoke('ai', { action, documentId, ... })` with the user's JWT.
2. Function verifies the JWT, validates input with the shared zod schema.
3. Rate limit check (per user, sliding window) → `429 rate_limited`.
4. Quota check against `plan_limits` for the user's tier and today's `usage_events`
   → `402 quota_exceeded` with the remaining counts.
5. For document-grounded actions: small/medium documents are sent whole with prompt caching;
   large ones retrieve the best chunks with hybrid full-text + embedding search (RLS applies).
6. Call Claude with a system prompt that restricts answers to the supplied context;
   structured outputs (quiz, flashcards, mind map) are validated against zod schemas.
7. Persist results (quiz, deck, note, chat message) and a `usage_events` row with token
   counts in one transaction; stream text responses back to the app.

### Security model

- **Authentication**: Supabase Auth (JWT, refresh rotation), Google via native sign-in
  (ID token exchange), tokens stored in the Android Keystore via SecureStore.
- **Authorization**: RLS (`auth.uid() = user_id`) on all user tables; staff access via
  `profiles.role`, checked together with a two-factor session by `staff_role()` / `is_admin()`
  in policies and functions.
- **SQL injection**: no string-built SQL — PostgREST parameterises; functions use
  parameterised queries only.
- **XSS**: the app renders text natively (no WebView HTML from AI output); the admin
  dashboard relies on React escaping and a strict Content-Security-Policy.
- **CSRF**: every API (app and admin dashboard) authenticates with bearer tokens, never
  cookies, so there is no ambient credential for a forged request to use.
- **Secrets**: only in Supabase function secrets / EAS secrets; `.env` files are git-ignored.
- **Uploads**: MIME + extension + size validated on device and again server-side against
  `plan_limits.maxFileSizeMb`; storage paths are namespaced by user id.
- **Encryption**: TLS in transit; Postgres and Storage encrypted at rest by Supabase;
  sensitive columns (e.g. push tokens) encrypted with `pgsodium`/Vault where stored.
- **Abuse**: rate limiting per user and per IP in Edge Functions; Claude spend is bounded by
  quotas and a global daily budget kill-switch in `app_config`.
- **Privacy**: account deletion (Play Store requirement) removes DB rows via cascade and
  storage objects via a function; data export available from Settings.

## AI (Anthropic Claude)

One `ai` Edge Function serves every AI feature over server-sent events, on the
provider-independent `packages/ai` (Anthropic today; OpenAI or Gemini can be added behind the
same interface). Haiku 4.5 handles chat, explanations, translation and flashcards; Sonnet 5.5
handles summaries, quizzes, study plans, mind maps and notes — every route is overridable in
remote config. Answers cite pages, say when the document doesn't cover a question, use prompt
caching and stored results to cut cost, and can be reported. Details: [AI](AI.md).

## Subscriptions

RevenueCat wraps Google Play Billing. The app shows the paywall and reads entitlements;
RevenueCat's webhook calls the `revenuecat-webhook` function, which updates the
`subscriptions` table. The server trusts only the webhook — never the client — for the
user's tier.

## Admin dashboard

A static React SPA on Cloudflare Pages ([ADMIN](ADMIN.md)). It holds no secret: it signs in
with Supabase Auth and calls role-checked database functions, so every permission is enforced
in Postgres. Staff roles are `admin`, `support` and `analyst`, and every staff function also
requires a two-factor (TOTP, `aal2`) session.

## Performance

- Lists use `FlashList`; images via `expo-image` (memory + disk cache, downsampling).
- Routes are lazily evaluated by Expo Router; heavy features load on first visit.
- Server data cached by TanStack Query with sensible `staleTime`; pagination with cursors.
- Hermes bytecode, React Compiler enabled (automatic memoisation).
- Database: indexes on every foreign key and common filters, cursor pagination, usage
  aggregation in materialised roll-ups instead of counting raw events per request.

## Testing strategy

| Level       | Tooling                                     | Scope                                 |
| ----------- | ------------------------------------------- | ------------------------------------- |
| Unit        | Vitest (shared), Jest + jest-expo (app)     | Pure logic, schemas, hooks            |
| Integration | Jest + RNTL with mock repositories          | Screens with providers, data flows    |
| Database    | pgTAP (`pnpm test:db` / `supabase test db`) | RLS, privileges, quotas, deletion     |
| Functions   | Deno test                                   | Edge Functions with injected deps     |
| Worker      | Vitest (generated PDF/DOCX fixtures)        | Extraction, chunking, queue handling  |
| Admin       | Vitest + Testing Library (jsdom)            | Auth/MFA gate, roles, pages           |
| UI / E2E    | Maestro                                     | Critical flows on an Android emulator |

## Build & release

- Variants via `APP_VARIANT`: `development` (`com.studexa.ai.dev`), `preview`
  (`com.studexa.ai.preview`), `production` (`com.studexa.ai`) — installable side by side.
- EAS Build produces the signed **AAB** for Google Play; EAS Update ships JS-only fixes.
- CI runs format, typecheck, lint and tests on every pull request.

## Decision log

| Decision                      | Chosen                                                        | Why / alternatives considered                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile framework              | Expo SDK 57 (React Native 0.86)                               | TypeScript requirement rules out native Kotlin; Expo gives CNG, EAS Build (AAB), OTA updates and iOS later for free. Flutter rejected (Dart, not TS).       |
| Backend                       | Supabase                                                      | Chosen by product owner: managed Postgres (relational, migrations, RLS), Auth, Storage, Edge Functions. Faster to ship than a custom NestJS API.            |
| AI provider                   | Anthropic Claude                                              | Strong long-document reasoning, native PDF understanding, reliable structured output.                                                                       |
| OCR                           | Hybrid: ML Kit + Claude vision                                | ML Kit is free/offline for Latin, CJK; Claude vision covers Arabic and handwriting where ML Kit is weak.                                                    |
| Payments                      | RevenueCat over Play Billing                                  | Play requires Play Billing for digital goods; RevenueCat handles receipt validation and server webhooks.                                                    |
| Monorepo                      | pnpm + Turborepo                                              | Shared contracts between app, admin and functions without publishing packages. `node-linker=hoisted` for React Native/Gradle compatibility.                 |
| Navigation                    | Expo Router (`js-tabs`)                                       | File-based typed routes and deep links. Stable JS tabs chosen over `unstable-native-tabs`.                                                                  |
| Styling                       | Tokens + `StyleSheet`                                         | Zero runtime cost, strict types, RTL-safe. NativeWind/Tamagui add a build/runtime layer we don't need.                                                      |
| Server state                  | TanStack Query                                                | Caching, retries, lazy loading, pagination out of the box.                                                                                                  |
| Client state                  | Zustand                                                       | Minimal API; persisted with synchronous SQLite KV so preferences apply on first frame.                                                                      |
| i18n                          | i18next + expo-localization                                   | Mature, typed keys, pluralisation; RTL via `I18nManager`.                                                                                                   |
| Plan limits                   | `plan_limits` table + admin editor                            | Product owner requirement: change quotas without an app release.                                                                                            |
| Document retrieval            | Full context ≤ threshold, else hybrid FTS + Voyage embeddings | Product owner choice. Embeddings only for large documents (cost); provider is a table row, swappable without schema changes.                                |
| Account deletion              | Immediate hard delete via cascade; anonymous aggregates kept  | Product owner choice; GDPR Art. 17 and Google Play policy. Verified by a whole-database scan test.                                                          |
| Credentials not yet available | Env vars + automatic mock mode                                | Product owner requirement: build now, add keys later via `.env`.                                                                                            |
| Admin dashboard               | Vite + React SPA on Cloudflare Pages                          | Static hosting at the edge, no server to secure or scale; all authorisation in Postgres (staff RPCs + MFA). Next.js SSR would add a server holding secrets. |
| Background work               | Postgres job queue (`private.jobs`)                           | Transactional with the data it describes, SKIP LOCKED scales to many workers; no extra infrastructure. pgmq/Pub/Sub possible later behind the same RPCs.    |
| Document processing           | Cloud Run worker, extract once                                | Product owner choice. Parsing 50 MB PDFs needs more memory/CPU time than Edge Functions allow; text is cached per user by SHA-256 and reused.               |
| Crash reporting               | Sentry + internal `error_logs`                                | Product owner choice. Sentry for stack traces and alerts; `error_logs` powers the dashboard and works without Sentry.                                       |
| Staff access                  | Roles (admin/support/analyst) + TOTP MFA                      | Least privilege: analysts see only anonymous aggregates; a leaked staff password alone opens nothing.                                                       |
| AI routing                    | Haiku 4.5 (light) / Sonnet 5.5 (heavy), remote-configurable   | Product owner choice. One cached system prompt, stored results, and refunds on failure keep cost predictable; the provider is an interface.                 |
| Streaming transport           | Server-sent events via `expo/fetch`                           | Native streaming body on Android without WebSockets; quota/validation errors stay plain JSON before the stream starts.                                      |
