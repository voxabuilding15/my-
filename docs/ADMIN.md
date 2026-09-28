# Studexa — Admin dashboard

`apps/admin` — a Vite + React single-page app deployed to **Cloudflare Pages**. Desktop and
tablet layouts (sidebar ≥ 1024 px, drawer below; wide tables scroll horizontally), light and
dark themes following the system.

## Security model

- **No secrets in the browser.** The dashboard ships only the public Supabase URL and anon key.
  Every read and write goes through row level security or a `SECURITY DEFINER` function that
  checks the caller's staff role itself (`private.require_staff`).
- **Two-factor authentication is mandatory.** Staff functions require an `aal2` session
  (TOTP). First sign-in walks through enrolment (QR code); later sign-ins ask for the code.
  (`app_config.admin.require_mfa` can be set to `false` for local development only.)
- **Sessions** live in `sessionStorage` (closing the tab signs out), bearer tokens only (no
  cookies, so no CSRF surface).
- **Headers**: strict Content-Security-Policy generated at build time for the exact Supabase
  and Sentry origins, HSTS, `X-Frame-Options: DENY`, no referrer, `noindex`.
- **Audit log**: every change to limits, config, flags and announcements (trigger-based), and
  every role change, plan grant, sign-out and deletion is recorded with the acting staff member.
  When a user deletes their account, audit rows about them are kept without their id.

## Roles

| Page                                            | Admin | Support | Analyst |
| ----------------------------------------------- | :---: | :-----: | :-----: |
| Overview, System health, Documents, Storage     |   ✓   |    ✓    |    ✓    |
| Users (search, detail)                          |   ✓   |    ✓    |         |
| Errors                                          |   ✓   |    ✓    |         |
| Subscriptions                                   |   ✓   |    ✓    |    ✓    |
| Revenue, AI usage, Engagement (aggregates)      |   ✓   |         |    ✓    |
| Feature flags, Announcements                    | edit  |  view   |  view   |
| Remote config & plan limits, Reports, Audit log |   ✓   |         |         |
| Change role, set plan, sign out, delete user    |   ✓   |         |         |

The last admin cannot be demoted, staff accounts must be demoted before deletion, and admins
cannot act on their own account from the dashboard.

The first admin is created once in SQL (Supabase SQL editor):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## Pages

| Page          | What it shows / does                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Overview      | Users, active users, premium, revenue, AI requests and cost, errors, processing queue          |
| System health | Worker heartbeats, queue depth and age, dead jobs, error rate, AI budget, DB size, maintenance |
| Errors        | Grouped by code (1 h / 24 h / 7 d) and a filterable log; links to the affected user            |
| Documents     | Status counts, stuck documents, failures with reason and **Retry**, pipeline charts            |
| Storage       | Total and per type, largest accounts, database size                                            |
| Users         | Search by exact email, id or name prefix; plan/role filters; keyset pagination                 |
| User detail   | Account, subscription, content counts, usage, recent errors; admin actions                     |
| Subscriptions | Active by product and status, starts, trials, cancellations, renewals                          |
| Revenue       | Revenue by product (store gross, USD)                                                          |
| AI usage      | Requests by feature and plan, cost by model, tokens, failures                                  |
| Engagement    | Active users, sign-ups, reviews, quizzes, uploads, deletions                                   |
| Feature flags | Toggle, rollout %, platforms, plans, min app version                                           |
| Remote config | Free/Premium limits table and every `app_config` value (JSON, validated)                       |
| Announcements | Localised banners with audience, schedule, priority and call to action                         |
| Reports       | User-flagged content triage                                                                    |
| Audit log     | All staff changes with before/after                                                            |

Charts read `admin_timeseries` over the anonymous daily aggregates (7 d – 1 y).

## Development

```bash
cp apps/admin/.env.example apps/admin/.env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
pnpm --filter @studexa/admin dev
pnpm --filter @studexa/admin test
```

Deployment: see [DEPLOYMENT](DEPLOYMENT.md#admin-dashboard-cloudflare-pages).
