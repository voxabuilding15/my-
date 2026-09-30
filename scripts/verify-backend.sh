#!/usr/bin/env bash
# Production backend check (run by the "Deploy backend" workflow in `verify` and `deploy` modes).
# Read-only apart from one storage-janitor run (its normal scheduled work) and one test email
# to Resend's sink address. Needs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, CRON_SECRET,
# RESEND_API_KEY, EMAIL_FROM, ANTHROPIC_API_KEY, and the Supabase CLI.
set -uo pipefail

ref="$SUPABASE_PROJECT_REF"
base="https://$ref.supabase.co"
api="https://api.supabase.com/v1/projects/$ref"
failures=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; failures=$((failures + 1)); }
note() { echo "     $*"; }
section() { echo; echo "== $* =="; }

query() {
  jq -n --arg q "$1" '{query: $q}' |
    curl -sS --fail-with-body -X POST "$api/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
      --data-binary @-
}

anon=$(supabase projects api-keys --project-ref "$ref" -o json | jq -r '.[] | select(.name == "anon") | .api_key')
[ -n "$anon" ] || { echo "FAIL could not read the anon key"; exit 1; }

section "Edge Functions (each must start and answer from its own code)"
# A 4xx with the app's error body proves the function booted with valid secrets;
# a 5xx or a gateway error means it did not.
call() { # name, expected status (or "4xx"), curl args...
  local name=$1 expect=$2
  shift 2
  local body="$RUNNER_TEMP/fn-$name.json"
  local status
  status=$(curl -sS -o "$body" -w '%{http_code}' -X POST "$base/functions/v1/$name" \
    -H "apikey: $anon" -H 'Content-Type: application/json' "$@")
  local code
  code=$(jq -r '.error.code // empty' "$body" 2>/dev/null)
  if [ "$expect" = "4xx" ] && [[ "$status" =~ ^4 ]] && [ -n "$code" ]; then
    ok "$name: HTTP $status ($code)"
  elif [ "$status" = "$expect" ]; then
    ok "$name: HTTP $status"
  else
    bad "$name: HTTP $status, expected $expect — $(head -c 300 "$body")"
  fi
}
call ai 4xx -H "Authorization: Bearer $anon" -d '{}'
call auth-email-code 4xx -H "Authorization: Bearer $anon" -d '{}'
call delete-account 4xx -H "Authorization: Bearer $anon" -d '{}'
call document-upload 4xx -H "Authorization: Bearer $anon" -d '{}'
call admin-users 4xx -H "Authorization: Bearer $anon" -d '{}'
call revenuecat-webhook 4xx -d '{}'
call storage-janitor 4xx -d '{}'
call storage-janitor 200 -H "Authorization: Bearer $CRON_SECRET" -d '{}'

section "Edge Function secrets"
secrets=$(supabase secrets list --project-ref "$ref" -o json | jq -r '.[].name')
for name in ENVIRONMENT AUTH_CODE_PEPPER CRON_SECRET WORKER_SECRET REVENUECAT_WEBHOOK_SECRET \
  RESEND_API_KEY EMAIL_FROM ANTHROPIC_API_KEY; do
  grep -qx "$name" <<<"$secrets" && ok "$name set" || bad "$name missing"
done
for name in VOYAGE_API_KEY SENTRY_DSN DOCUMENT_PROCESSOR_URL; do
  grep -qx "$name" <<<"$secrets" && ok "$name set" || note "$name not set (optional or later step)"
done

section "Database"
migrations=$(query "select count(*)::int as n from supabase_migrations.schema_migrations" | jq -r '.[0].n')
expected=$(ls supabase/migrations/*.sql | wc -l)
[ "$migrations" = "$expected" ] && ok "migrations: $migrations of $expected applied" ||
  bad "migrations: $migrations applied, repository has $expected"
tables=$(query "select count(*)::int as n from pg_tables where schemaname = 'public'" | jq -r '.[0].n')
unprotected=$(query "select coalesce(string_agg(tablename, ', '), '') as t from pg_tables where schemaname = 'public' and not rowsecurity" | jq -r '.[0].t')
[ -z "$unprotected" ] && ok "row-level security on all $tables public tables" || bad "tables without RLS: $unprotected"
plans=$(query "select count(*)::int as n from public.plan_limits" | jq -r '.[0].n' 2>/dev/null)
[ "${plans:-0}" -ge 2 ] && ok "plans seeded ($plans)" || bad "plan limits not seeded"
config=$(query "select count(*)::int as n from public.app_config" | jq -r '.[0].n')
[ "${config:-0}" -ge 5 ] && ok "remote config seeded ($config keys)" || bad "remote config missing"

section "Storage"
buckets=$(query "select id, public, file_size_limit from storage.buckets order by id")
echo "$buckets" | jq -r '.[] | "     \(.id): public=\(.public) limit=\(.file_size_limit // "none")"'
[ "$(echo "$buckets" | jq -r '.[] | select(.id == "documents") | .public')" = "false" ] &&
  ok "documents bucket is private" || bad "documents bucket missing or public"
[ "$(echo "$buckets" | jq -r '[.[].id] | index("avatars") != null')" = "true" ] &&
  ok "avatars bucket exists" || bad "avatars bucket missing"

section "Scheduled jobs"
jobs=$(query "select j.jobname, j.schedule, j.active, d.status, d.start_time
  from cron.job j
  left join lateral (select status, start_time from cron.job_run_details r
                     where r.jobid = j.jobid order by start_time desc limit 1) d on true
  order by j.jobname")
echo "$jobs" | jq -r '.[] | "     \(.jobname) [\(.schedule)] active=\(.active) last=\(.status // "not run yet") \(.start_time // "")"'
for job in studexa-maintenance studexa-storage-janitor; do
  [ "$(echo "$jobs" | jq -r --arg j "$job" '.[] | select(.jobname == $j) | .active')" = "true" ] &&
    ok "$job scheduled" || bad "$job not scheduled"
done
[ "$(echo "$jobs" | jq -r '.[] | select(.jobname == "studexa-storage-janitor") | .status // "none"')" != "failed" ] &&
  ok "storage janitor's last run did not fail" || bad "storage janitor's last run failed"
http=$(query "select status_code, error_msg, created from net._http_response
  where created > now() - interval '6 hours' order by created desc")
note "janitor HTTP results (last 6 h): $(echo "$http" | jq -c 'group_by(.status_code) | map({((.[0].status_code // "error") | tostring): length}) | add // {}')"
echo "$http" | jq -r '.[] | select(.status_code != 200) | "     \(.created): \(.status_code // "no response") \(.error_msg // "")"'
# A single timeout (e.g. a cold start) is retried by the next run 10 minutes later; the
# check fails when the latest call failed or when more than 1 in 10 failed.
latest=$(echo "$http" | jq -r '.[0].status_code // "none"')
failed=$(echo "$http" | jq '[.[] | select(.status_code != 200)] | length')
total=$(echo "$http" | jq 'length')
if [ "$total" -eq 0 ]; then
  note "no scheduled janitor call in the last 6 hours yet (runs every 10 minutes)"
elif [ "$latest" != "200" ]; then
  bad "latest scheduled janitor call failed ($latest)"
elif [ $((failed * 10)) -gt "$total" ]; then
  bad "$failed of $total scheduled janitor calls failed"
else
  ok "scheduled janitor calls answered ($((total - failed)) of $total with 200, latest 200)"
fi

section "Auth settings"
auth=$(curl -sS --fail-with-body "$api/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
[ "$(echo "$auth" | jq -r .site_url)" = "studexa://" ] && ok "site URL studexa://" || bad "site URL"
[ "$(echo "$auth" | jq -r .mailer_autoconfirm)" = "true" ] && ok "Supabase confirmation link off (app verifies with its code)" || bad "email confirmation link still on"
[ "$(echo "$auth" | jq -r .mfa_totp_enroll_enabled)" = "true" ] && ok "TOTP MFA on (staff accounts)" || bad "TOTP MFA off"
[ "$(echo "$auth" | jq -r .disable_signup)" = "false" ] && ok "sign-up open" || bad "sign-up disabled"

section "Security advisor"
advisors=$(curl -sS "$api/advisors/security" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
if echo "$advisors" | jq -e '.lints' >/dev/null 2>&1; then
  echo "$advisors" | jq -r '.lints[] | "     \(.level): \(.title) — \(.detail // "" | .[0:160])"'
  errors=$(echo "$advisors" | jq '[.lints[] | select(.level == "ERROR")] | length')
  [ "$errors" = "0" ] && ok "no security errors" || bad "$errors security error(s) above"
else
  note "security advisor unavailable: $(echo "$advisors" | head -c 200)"
fi

section "Email (Resend)"
# Resend's sink address accepts the message without delivering it; the API still checks
# that the sender's domain is verified — exactly what sign-up codes need.
email=$(jq -n --arg from "$EMAIL_FROM" \
  '{from: $from, to: ["delivered@resend.dev"], subject: "Studexa backend check", text: "Deployment check."}' |
  curl -sS -o "$RUNNER_TEMP/resend.json" -w '%{http_code}' -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' --data-binary @-)
if [ "$email" = "200" ]; then
  ok "sign-up codes can be sent from $EMAIL_FROM"
else
  bad "Resend refused the sender ($email): $(jq -r '.message // .' "$RUNNER_TEMP/resend.json" | head -c 300)"
fi

section "AI (Anthropic)"
ai=$(curl -sS -o "$RUNNER_TEMP/anthropic.json" -w '%{http_code}' https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H 'anthropic-version: 2023-06-01')
if [ "$ai" = "200" ]; then
  ok "Anthropic key accepted"
else
  bad "Anthropic key rejected (HTTP $ai): $(jq -r '.error.message // .' "$RUNNER_TEMP/anthropic.json" | head -c 200)"
  [[ "$ANTHROPIC_API_KEY" =~ [[:space:]] ]] && note "the stored key contains a space or line break"
  [[ "$ANTHROPIC_API_KEY" == sk-ant-* ]] || note "the stored key does not start with sk-ant- (not an Anthropic API key)"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "backend verified"
