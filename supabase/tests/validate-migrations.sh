#!/usr/bin/env bash
# Static checks on migrations (no database needed):
#   - names: <14-digit timestamp>_<snake_case>.sql, timestamps unique
#   - append-only: migrations already on the base branch are never edited, renamed or deleted
#     (deployed databases would silently diverge from the repository)
#
#   BASE_REF=origin/main supabase/tests/validate-migrations.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
dir=supabase/migrations
base="${BASE_REF:-origin/main}"
status=0

for file in "$dir"/*.sql; do
  name=$(basename "$file")
  if [[ ! "$name" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "bad migration name: $name" >&2
    status=1
  fi
done
dupes=$(ls "$dir" | cut -c1-14 | sort | uniq -d)
if [[ -n "$dupes" ]]; then
  echo "duplicate migration timestamps: $dupes" >&2
  status=1
fi

if git rev-parse --verify --quiet "$base" >/dev/null; then
  while IFS= read -r released; do
    [[ -z "$released" ]] && continue
    if [[ ! -f "$released" ]]; then
      echo "released migration deleted or renamed: $released" >&2
      status=1
    elif ! diff -q <(git show "$base:$released") "$released" >/dev/null; then
      echo "released migration edited: $released (add a new migration instead)" >&2
      status=1
    fi
  done < <(git ls-tree -r --name-only "$base" -- "$dir" | grep '\.sql$' || true)
  newest_base=$(git ls-tree -r --name-only "$base" -- "$dir" | grep -o '[0-9]\{14\}' | sort | tail -1 || true)
  for file in "$dir"/*.sql; do
    version=$(basename "$file" | cut -c1-14)
    if [[ -n "$newest_base" && "$version" < "$newest_base" ]] && ! git cat-file -e "$base:$file" 2>/dev/null; then
      echo "new migration $file is older than the newest released one ($newest_base)" >&2
      status=1
    fi
  done
else
  echo "base ref $base not found: append-only check skipped"
fi

[[ $status -eq 0 ]] && echo "migrations valid ($(ls "$dir" | wc -l) files)"
exit $status
