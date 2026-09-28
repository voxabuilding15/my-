#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL database (with the Supabase shim) and runs the
# pgTAP suite. For environments without Docker; with Docker, prefer `supabase test db`.
#
# Requires PostgreSQL 15+ with pgvector and pgTAP. Connection via standard PG* env vars.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
db="${STUDEXA_TEST_DB:-studexa_test}"
psql_cmd=(psql -X -q -v ON_ERROR_STOP=1)

dropdb --if-exists "$db"
createdb "$db"
"${psql_cmd[@]}" -d "$db" -f "$here/harness/supabase-shim.psql"
"${psql_cmd[@]}" -d "$db" -c 'create extension if not exists pgtap with schema extensions'
for migration in "$root"/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  "${psql_cmd[@]}" -d "$db" -f "$migration"
done

if [[ "${1:-}" != "--migrate-only" ]]; then
  PGOPTIONS='--search_path=public,extensions' pg_prove -d "$db" --ext .sql "$here"/database/*.test.sql
fi
