#!/usr/bin/env bash
# Prints the DSN of a Sentry project, creating the project first if it does not exist.
# Used by the release and backend workflows, so DSNs never have to be copied by hand.
#
#   scripts/sentry-dsn.sh <project slug> <platform>
#   e.g. scripts/sentry-dsn.sh studexa-mobile react-native
#
# Needs SENTRY_AUTH_TOKEN (a personal token with org:read, project:read, project:write,
# team:read and project:releases) and SENTRY_ORG (the organisation slug). Works for US and EU
# organisations: the API region comes from the organisation itself.
set -euo pipefail

slug=$1
platform=$2
: "${SENTRY_AUTH_TOKEN:?}" "${SENTRY_ORG:?}"

api() { # method, url, [json body]
  curl -sS --fail-with-body -X "$1" "$2" -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    -H 'Content-Type: application/json' ${3:+--data "$3"}
}

region=$(api GET "https://sentry.io/api/0/organizations/$SENTRY_ORG/" | jq -r '.links.regionUrl // "https://sentry.io"')
base="$region/api/0"

if ! curl -sS -o /dev/null -w '%{http_code}' "$base/projects/$SENTRY_ORG/$slug/" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | grep -qx 200; then
  team=$(api GET "$base/organizations/$SENTRY_ORG/teams/" | jq -r '.[0].slug // empty')
  if [ -z "$team" ]; then
    team=studexa
    api POST "$base/organizations/$SENTRY_ORG/teams/" '{"name":"Studexa","slug":"studexa"}' > /dev/null
  fi
  api POST "$base/teams/$SENTRY_ORG/$team/projects/" \
    "$(jq -nc --arg s "$slug" --arg p "$platform" '{name: $s, slug: $s, platform: $p}')" > /dev/null
  echo "created Sentry project $SENTRY_ORG/$slug ($platform)" >&2
fi

dsn=$(api GET "$base/projects/$SENTRY_ORG/$slug/keys/" | jq -r '[.[] | select(.isActive)][0].dsn.public // empty')
[ -n "$dsn" ] || { echo "no active client key in Sentry project $slug" >&2; exit 1; }
echo "$dsn"
