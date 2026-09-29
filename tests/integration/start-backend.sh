#!/usr/bin/env bash
# Starts the full local backend in the background and waits until it answers:
#   Supabase in Docker (Postgres, Auth, Storage, PostgREST, Edge Functions via `functions serve`),
#   the document worker, and the mock server (Anthropic, Voyage, email inbox, Sentry ingest).
# Writes the connection details to tests/integration/reports/backend.env and the process ids
# to backend.pids. Used by run.sh (integration suites), the load test and the Android E2E job.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
SB="${SUPABASE_BIN:-supabase}"
reports="$root/tests/integration/reports"
mkdir -p "$reports"
: >"$reports/backend.pids"

if ! "$SB" status >/dev/null 2>&1; then
  "$SB" start -x studio,imgproxy,logflare,vector,supavisor,postgres-meta,realtime,mailpit
fi
eval "$("$SB" status -o env | sed 's/^/export SB_/')"

wait_for() { # url, name
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null "$1"; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $2" >&2
  exit 1
}

(cd tests/integration && nohup node --import tsx src/mock-server.ts >"$reports/mock-server.log" 2>&1 & echo $! >>"$reports/backend.pids")
wait_for http://127.0.0.1:54400/health "mock server"

WORKER_SECRET=integration-test-worker-secret-00000000000000
pnpm --filter @studexa/document-processor build >/dev/null
(
  cd services/document-processor
  SUPABASE_URL="$SB_API_URL" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY" \
    WORKER_SECRET="$WORKER_SECRET" PORT=54410 ENVIRONMENT=development \
    ANTHROPIC_API_KEY=test-anthropic-key ANTHROPIC_BASE_URL=http://127.0.0.1:54400/anthropic \
    VOYAGE_API_KEY=test-voyage-key VOYAGE_BASE_URL=http://127.0.0.1:54400/voyage \
    SENTRY_DSN=http://public@127.0.0.1:54400/1 RUN_BUDGET_SECONDS=60 \
    nohup node --expose-gc dist/main.js >"$reports/worker.log" 2>&1 &
  echo $! >>"$reports/backend.pids"
)
wait_for http://127.0.0.1:54410/healthz worker

nohup "$SB" functions serve --env-file "${FUNCTIONS_ENV_FILE:-supabase/functions/test.env}" \
  >"$reports/functions.log" 2>&1 &
echo $! >>"$reports/backend.pids"
# The runtime boots lazily; the first call to a function starts it.
for _ in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$SB_API_URL/functions/v1/ai" || true)
  [[ "$code" == "200" ]] && break
  sleep 1
done
[[ "$code" == "200" ]] || { echo "edge functions did not start" >&2; tail -50 "$reports/functions.log" >&2; exit 1; }

cat >"$reports/backend.env" <<ENV
export SUPABASE_URL="$SB_API_URL"
export SUPABASE_ANON_KEY="$SB_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export DB_URL="$SB_DB_URL"
export MOCK_URL=http://127.0.0.1:54400
export WORKER_URL=http://127.0.0.1:54410
export WORKER_SECRET=$WORKER_SECRET
ENV
echo "backend ready ($SB_API_URL)"
