# Studexa

AI-powered study assistant for Android: upload documents or photos, then summarise,
translate, quiz yourself, study flashcards and chat with your material.

> **Status:** Phases 1–6 of 10 (architecture, database, authentication, UI, backend, AI) complete.
> See the [roadmap](#roadmap), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the testing report in [`docs/TESTING.md`](docs/TESTING.md).

## Stack

Expo SDK 57 (React Native, TypeScript strict) · Supabase (Postgres, Auth, Storage, Edge
Functions) · Google Cloud Run · Cloudflare Pages · Anthropic Claude · RevenueCat · Sentry ·
pnpm + Turborepo.

## Getting started

Requirements: Node 22+, pnpm 10 (`corepack enable`), and an Android device or emulator
with a development build (Expo Go does not include every native module this app will use).

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env   # optional — without it the app runs in demo mode
pnpm dev:mobile
```

With no Supabase credentials the app runs on mock data and shows a **Demo mode** badge.

## Scripts

| Command               | What it does                   |
| --------------------- | ------------------------------ |
| `pnpm dev:mobile`     | Start the Expo dev server      |
| `pnpm dev:admin`      | Start the admin dashboard      |
| `pnpm typecheck`      | TypeScript across all packages |
| `pnpm lint`           | ESLint                         |
| `pnpm test`           | Unit and component tests       |
| `pnpm test:db`        | Migrations + pgTAP DB tests    |
| `pnpm test:functions` | Edge Function tests (Deno)     |
| `pnpm format`         | Prettier write                 |

## Repository layout

```
apps/mobile                   Android app (Expo)
apps/admin                    Admin dashboard (React SPA, Cloudflare Pages)
services/document-processor   Text extraction worker (Google Cloud Run)
packages/shared               Contracts shared by app, admin and backend
packages/ai                   AI providers, prompts, routing and schemas
supabase                      Migrations, RLS policies, pgTAP tests, Edge Functions
site                          Privacy Policy, Terms, account deletion page (GitHub Pages)
docs                          Architecture, database, auth, UI, backend, AI, admin, deployment
```

## Roadmap

1. ✅ Project architecture
2. ✅ Database (schema, RLS, migrations, tests)
3. ✅ Authentication (email, Google, verification, reset, profile, deletion)
4. ✅ UI (all screens, design system, animations, tablets, RTL)
5. ✅ Backend (Supabase data layer, document pipeline, billing, Sentry, admin dashboard)
6. ✅ AI (Claude features with citations, streaming, caching, OCR, reports)
7. ✅ Testing — integration, load, E2E, security, accessibility ([report](docs/TESTING.md))
8. ✅ Optimisation — size, speed, vitals, database, security, AI cost ([report](docs/OPTIMISATION.md))
9. 🟡 Production release — build, verification, store listing and forms ready; awaiting accounts and approval ([release guide](docs/RELEASE.md))
10. ⬜ Android release (AAB)
