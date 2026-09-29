#!/usr/bin/env bash
# Runs the integration suites against the local backend (see start-backend.sh): real Supabase
# in Docker, the document worker, and mocks of Anthropic, Voyage, email and Sentry.
#
#   tests/integration/run.sh                  # start the backend, run, stop our processes
#   tests/integration/run.sh suites/ai.test.ts
#   STOP_SUPABASE=1 tests/integration/run.sh  # also stop the Supabase containers afterwards
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
reports="$root/tests/integration/reports"

stop() {
  [[ -f "$reports/backend.pids" ]] && xargs -r kill <"$reports/backend.pids" 2>/dev/null || true
  if [[ -n "${STOP_SUPABASE:-}" ]]; then "${SUPABASE_BIN:-supabase}" stop; fi
}
trap stop EXIT

tests/integration/start-backend.sh
# shellcheck disable=SC1091
source "$reports/backend.env"
pnpm --filter @studexa/integration-tests test:integration "$@"
