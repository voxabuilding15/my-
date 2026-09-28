# Studexa

AI-powered study assistant for Android: upload documents or photos, then summarise,
translate, quiz yourself, study flashcards and chat with your material.

> **Status:** Phases 1–3 of 10 (architecture, database, authentication) complete. See the
> [roadmap](#roadmap) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Expo SDK 57 (React Native, TypeScript strict) · Supabase (Postgres, Auth, Storage, Edge
Functions) · Anthropic Claude · RevenueCat · pnpm + Turborepo.

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
| `pnpm typecheck`      | TypeScript across all packages |
| `pnpm lint`           | ESLint                         |
| `pnpm test`           | Unit and component tests       |
| `pnpm test:db`        | Migrations + pgTAP DB tests    |
| `pnpm test:functions` | Edge Function tests (Deno)     |
| `pnpm format`         | Prettier write                 |

## Repository layout

```
apps/mobile        Android app (Expo)
apps/admin         Admin dashboard (Next.js) — Phase 5
packages/shared    Contracts shared by app, admin and backend
supabase           Migrations, RLS policies, pgTAP tests, Edge Functions
site               Privacy Policy, Terms, account deletion page (GitHub Pages)
docs               Architecture, database, authentication; later API, deployment
```

## Roadmap

1. ✅ Project architecture
2. ✅ Database (schema, RLS, migrations, tests)
3. ✅ Authentication (email, Google, verification, reset, profile, deletion)
4. ⬜ UI (all screens, design system, animations)
5. ⬜ Backend (Edge Functions, quotas, rate limiting, admin dashboard)
6. ⬜ AI (Claude features, OCR, document Q&A)
7. ⬜ Testing (integration, database, E2E)
8. ⬜ Optimisation
9. ⬜ Deployment
10. ⬜ Android release (AAB)
