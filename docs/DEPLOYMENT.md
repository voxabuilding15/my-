# Studexa — Deployment

Everything below needs accounts that do not exist yet; the code runs in demo mode until the
values are provided. **Secrets go only into the listed secret stores — never into git or the
app.** The Android build and store release are in [RELEASE](RELEASE.md); this is the backend setup.

## 1. Supabase

**Recommended: the "Deploy backend" workflow** (Actions → Deploy backend → Run workflow; `check`
first, then `deploy`). It applies the migrations, sets the Auth settings, the Edge Function
secrets, deploys the functions, stores the cron secret in Vault and schedules the storage
janitor, then prints a summary. It reads these GitHub values (Settings → Secrets and variables
→ Actions):

| Kind     | Name                                                                            | Value                                                             |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Secret   | `SUPABASE_ACCESS_TOKEN`                                                         | supabase.com → Account → Access tokens                            |
| Secret   | `SUPABASE_DB_PASSWORD`                                                          | the database password chosen when creating the project            |
| Variable | `SUPABASE_PROJECT_REF`                                                          | the 20-character id in `https://<ref>.supabase.co`                |
| Secret   | `AUTH_CODE_PEPPER`, `CRON_SECRET`, `WORKER_SECRET`, `REVENUECAT_WEBHOOK_SECRET` | 4 different random values: `openssl rand -hex 32`                 |
| Secret   | `RESEND_API_KEY`                                                                | resend.com → API keys (sending access)                            |
| Variable | `EMAIL_FROM`                                                                    | e.g. `Studexa <no-reply@your-domain>` (domain verified in Resend) |
| Secret   | `ANTHROPIC_API_KEY`                                                             | console.anthropic.com → API keys                                  |
| Secret   | `VOYAGE_API_KEY` (optional)                                                     | dashboard.voyageai.com → API keys                                 |
| Variable | `BACKEND_SENTRY_DSN`, `DOCUMENT_PROCESSOR_URL` (later)                          | Sentry backend project DSN; Cloud Run service URL                 |

The manual steps below do the same by hand.

1. Create a project (region close to your users). Enable **Auth → MFA → TOTP**.
2. Link and push the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Function secrets (`supabase secrets set KEY=value …`):

   | Secret                         | Used by            | Value                                     |
   | ------------------------------ | ------------------ | ----------------------------------------- |
   | `AUTH_CODE_PEPPER`             | auth-email-code    | 32+ random bytes (`openssl rand -hex 32`) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | auth-email-code    | Resend                                    |
   | `REVENUECAT_WEBHOOK_SECRET`    | revenuecat-webhook | 32+ random characters                     |
   | `CRON_SECRET`                  | storage-janitor    | 32+ random characters                     |
   | `DOCUMENT_PROCESSOR_URL`       | document-upload    | Cloud Run service URL (step 2)            |
   | `WORKER_SECRET`                | document-upload    | 32+ random characters, same as Cloud Run  |
   | `SENTRY_DSN` (optional)        | all functions      | Sentry project DSN (backend)              |
   | `ENVIRONMENT`                  | all functions      | `production`                              |

4. Deploy functions: `supabase functions deploy` (uses `supabase/config.toml`).
5. Schedules (SQL editor; needs the `pg_cron` and `pg_net` extensions):
   ```sql
   select cron.schedule('studexa-maintenance', '17 3 * * *', 'select private.run_maintenance()');
   select cron.schedule('studexa-storage-janitor', '*/10 * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/storage-janitor',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     )$$);
   ```
   (Store the secret in Vault and read it with `vault.decrypted_secrets` rather than inline.)
6. First admin: see [ADMIN](ADMIN.md#roles).

## 2. Document processor (Google Cloud Run)

```bash
gcloud artifacts repositories create studexa --repository-format=docker --location=europe-west1
docker build -f services/document-processor/Dockerfile -t europe-west1-docker.pkg.dev/<project>/studexa/document-processor .
docker push europe-west1-docker.pkg.dev/<project>/studexa/document-processor

gcloud run deploy document-processor \
  --image europe-west1-docker.pkg.dev/<project>/studexa/document-processor \
  --region europe-west1 --allow-unauthenticated \
  --memory 2Gi --cpu 2 --concurrency 4 --timeout 300 --min-instances 0 --max-instances 20 \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role:latest,WORKER_SECRET=worker-secret:latest,SENTRY_DSN=sentry-dsn:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,VOYAGE_API_KEY=voyage-api-key:latest \
  --set-env-vars SUPABASE_URL=https://<ref>.supabase.co,ENVIRONMENT=production
```

- `/work` requires `Authorization: Bearer <WORKER_SECRET>` (constant-time check); the service
  is public at the network level so Supabase can reach it without Google credentials.
- Keep `--timeout` above `RUN_BUDGET_SECONDS` (240 s default) and memory ≥ 4 × the largest
  file (four documents are processed at once per instance).
- Safety net — Cloud Scheduler calls the worker every minute so jobs never wait for a wake-up:
  ```bash
  gcloud scheduler jobs create http document-processor-drain --schedule "* * * * *" \
    --uri https://<service-url>/work --http-method POST \
    --headers "Authorization=Bearer <WORKER_SECRET>" --location europe-west1
  ```
- Health: the dashboard's **System health** page shows each instance's last heartbeat.

### AI keys and limits

- Anthropic: create a workspace for Studexa with a **spend limit** in the Anthropic Console as an
  outer guard; the app's own daily budget (`ai.daily_budget_usd`) stops earlier.
- Streaming answers can take up to a minute on long documents; Supabase Edge Functions allow
  150 s (free) / 400 s (paid) per request.
- Tune `ai.routes`, `ai.rate_limits`, `ai.context` and plan limits in the dashboard's Remote
  config.

## 3. RevenueCat

1. Connect the Google Play app, create the `premium` entitlement and an offering with
   **monthly** and **annual** packages (free trial as an introductory offer).
2. Integrations → Webhooks: URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header = `REVENUECAT_WEBHOOK_SECRET`.
3. App: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (public SDK key, `goog_…`).

## 4. Sentry

Create three projects (React Native, Node/Deno backend, React admin) or one per platform:

| Where            | Setting                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Android app      | `EXPO_PUBLIC_SENTRY_DSN`; EAS secrets `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source maps |
| Edge Functions   | `SENTRY_DSN` function secret                                                                              |
| Cloud Run worker | `SENTRY_DSN` secret                                                                                       |
| Admin dashboard  | `VITE_SENTRY_DSN` build variable                                                                          |

## 5. Admin dashboard (Cloudflare Pages)

Create a Pages project connected to the repository:

| Setting             | Value                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| Build command       | `pnpm install --frozen-lockfile && pnpm --filter @studexa/admin build`              |
| Build output        | `apps/admin/dist`                                                                   |
| Environment (build) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `NODE_VERSION=22` |

`_headers` (security headers + CSP) and `_redirects` (SPA routing) are generated into the
output. Put the dashboard behind **Cloudflare Access** as an extra layer if desired, and add
its URL to Supabase **Auth → URL configuration**.

CLI alternative: `pnpm --filter @studexa/admin build && npx wrangler pages deploy apps/admin/dist`.

## 6. Mobile app

`apps/mobile/.env` (or EAS environment variables): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_SENTRY_DSN`. With the Supabase values set,
the app switches from demo data to the real backend automatically. Store builds, EAS and the
release checklist: [RELEASE](RELEASE.md).
