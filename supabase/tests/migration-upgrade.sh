#!/usr/bin/env bash
# Upgrade test on the local Supabase stack: a database created by the migrations already
# released (on BASE_REF) and holding real-looking data is upgraded with the new migrations.
# Every row must survive, and the pgTAP suite must pass afterwards... on a fresh reset, since
# the suite assumes an empty database. Resets the local database: run it last.
#
#   BASE_REF=origin/main supabase/tests/migration-upgrade.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
SB="${SUPABASE_BIN:-supabase}"
base="${BASE_REF:-origin/main}"
db_url=$("$SB" status -o env | awk -F= '/^DB_URL=/ {gsub(/"/, "", $2); print $2}')
psql_db() { psql "$db_url" -v ON_ERROR_STOP=1 -X -q "$@"; }

fixture=supabase/tests/upgrade/sample-data.psql
last_released=""
if git rev-parse --verify --quiet "$base" >/dev/null; then
  last_released=$(git ls-tree -r --name-only "$base" -- supabase/migrations | grep -o '[0-9]\{14\}' | sort | tail -1 || true)
  if git cat-file -e "$base:$fixture" 2>/dev/null; then
    git show "$base:$fixture" >/tmp/studexa-upgrade-data.sql
    fixture=/tmp/studexa-upgrade-data.sql
  fi
fi

if [[ -n "$last_released" ]]; then
  echo "→ database at the released schema ($last_released)"
  "$SB" db reset --no-seed --version "$last_released"
else
  echo "→ no released migrations on $base: fresh database with every migration"
  "$SB" db reset --no-seed
fi
psql_db -f "$fixture"

count_rows() {
  psql_db -At -c "select string_agg(format('%s=%s', relname, n_live_tup), ',' order by relname)
                  from (select c.relname, (xpath('/row/c/text()',
                    query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as n_live_tup
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r') t"
}
before=$(count_rows)

echo "→ applying the new migrations"
"$SB" migration up --local --include-all
after=$(count_rows)

lost=0
IFS=',' read -ra rows <<<"$before"
for entry in "${rows[@]}"; do
  table=${entry%%=*}; count=${entry##*=}
  now=$(tr ',' '\n' <<<"$after" | awk -F= -v t="$table" '$1 == t {print $2}')
  if [[ -z "$now" || "$now" -lt "$count" ]]; then
    echo "rows lost in $table: $count → ${now:-table missing}" >&2
    lost=1
  fi
done
[[ $lost -eq 0 ]] || exit 1
echo "→ every row kept ($(tr ',' '\n' <<<"$after" | awk -F= '{s+=$2} END {print s}') rows)"

# Behaviour after the upgrade: verified accounts stay verified, and so on.
psql_db -At -c "select private.is_email_verified('00000000-0000-4000-8000-000000000001'),
                       private.is_email_verified('00000000-0000-4000-8000-000000000002')" | grep -qx 't|t' \
  || { echo "email verification state changed by the upgrade" >&2; exit 1; }

echo "→ fresh reset + pgTAP"
"$SB" db reset --no-seed
"$SB" test db
