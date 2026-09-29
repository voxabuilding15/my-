#!/usr/bin/env bash
# Load test of the AI endpoint against the local stack (Supabase in Docker + worker + mocks),
# started the same way as the integration suites (tests/integration/run.sh with KEEP_RUNNING=1).
# Samples the Edge Runtime container's memory before and after, as a leak indicator.
#
#   K6_BIN=/path/to/k6 tests/load/run.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
SB="${SUPABASE_BIN:-supabase}"
K6="${K6_BIN:-k6}"
reports="$root/tests/load/reports"
mkdir -p "$reports"

eval "$("$SB" status -o env | sed 's/^/export SB_/')"
export SUPABASE_URL="$SB_API_URL" SUPABASE_ANON_KEY="$SB_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export REPORT_DIR="$reports"

mem() { docker stats --no-stream --format '{{.MemUsage}}' "$1" 2>/dev/null | cut -d/ -f1 | tr -d ' '; }
runtime=$(docker ps --format '{{.Names}}' | grep edge_runtime | head -1)
db=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)
before_runtime=$(mem "$runtime"); before_db=$(mem "$db")

status=0
"$K6" run --quiet tests/load/ai-load.js || status=$?

sleep 5
after_runtime=$(mem "$runtime"); after_db=$(mem "$db")
cat >"$reports/memory.json" <<JSON
{"edge_runtime": {"before": "$before_runtime", "after": "$after_runtime"},
 "database": {"before": "$before_db", "after": "$after_db"}}
JSON
cat "$reports/memory.json"
exit $status
