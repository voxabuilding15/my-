#!/usr/bin/env bash
# Runs the integration suites against a local Supabase stack (Docker): database, Auth, Storage,
# PostgREST and Edge Functions, plus the document worker and mocks of Anthropic, Voyage and email.
#
#   tests/integration/run.sh            # start what's missing, run, stop what we started
#   KEEP_RUNNING=1 tests/integration/run.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
SB="${SUPABASE_BIN:-supabase}"
reports="$root/tests/integration/reports"
mkdir -p "$reports"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

if ! "$SB" status >/dev/null 2>&1; then
  "$SB" start -x studio,imgproxy,logflare,vector,supavisor,postgres-meta,realtime,mailpit
fi
eval "$("$SB" status -o env | sed 's/^/export SB_/')"

wait_for() { # url, name
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$1"; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $2" >&2
  exit 1
}

pnpm --filter @studexa/integration-tests exec tsx src/mock-server.ts >"$reports/mock-server.log" 2>&1 &
pids+=($!)
wait_for http://127.0.0.1:54400/health "mock server"

pnpm --filter @studexa/document-processor build >/dev/null
(
  cd services/document-processor
  SUPABASE_URL="$SB_API_URL" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY" \
    WORKER_SECRET=integration-test-worker-secret-00000000000000 PORT=54410 ENVIRONMENT=development \
    ANTHROPIC_API_KEY=test-anthropic-key ANTHROPIC_BASE_URL=http://127.0.0.1:54400/anthropic \
    VOYAGE_API_KEY=test-voyage-key VOYAGE_BASE_URL=http://127.0.0.1:54400/voyage \
    RUN_BUDGET_SECONDS=60 node --expose-gc dist/main.js
) >"$reports/worker.log" 2>&1 &
pids+=($!)
wait_for http://127.0.0.1:54410/healthz worker

"$SB" functions serve --env-file supabase/functions/test.env >"$reports/functions.log" 2>&1 &
pids+=($!)
# The runtime boots lazily; the first call to any function starts it.
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$SB_API_URL/functions/v1/ai" || true)
  [[ "$code" == "200" ]] && break
  sleep 1
done

export SUPABASE_URL="$SB_API_URL" SUPABASE_ANON_KEY="$SB_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export DB_URL="$SB_DB_URL" MOCK_URL=http://127.0.0.1:54400 WORKER_URL=http://127.0.0.1:54410
export WORKER_SECRET=integration-test-worker-secret-00000000000000
status=0
pnpm --filter @studexa/integration-tests test:integration "$@" || status=$?

if [[ -z "${KEEP_RUNNING:-}" && -n "${STOP_SUPABASE:-}" ]]; then "$SB" stop; fi
exit $status
