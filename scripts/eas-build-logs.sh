#!/usr/bin/env bash
# Prints the status, error and log tail of an EAS build (the latest Android build when no id
# is given), so a failed build can be diagnosed from GitHub Actions without opening expo.dev.
#
#   scripts/eas-build-logs.sh [build id]     (run from apps/mobile, EXPO_TOKEN set)
set -euo pipefail

id=${1:-}
if [ -z "$id" ]; then
  id=$(npx eas-cli@24 build:list --platform android --limit 1 --non-interactive --json | jq -r '.[0].id')
fi
build="${RUNNER_TEMP:-/tmp}/eas-build-$id.json"
npx eas-cli@24 build:view "$id" --json > "$build"
jq '{id, status, profile: .buildProfile, appVersion, appBuildVersion, error, createdAt, completedAt}' "$build"

# Build logs are JSON lines; keep the phase and message of each line.
jq -r '.logFiles[]?' "$build" | while read -r url; do
  echo "----- log ($(cut -d'?' -f1 <<<"$url" | awk -F/ '{print $NF}')) -----"
  curl -sSL "$url" |
    jq -Rr 'fromjson? | select(.msg != null) | "[\(.phase // "-")] \(.msg)"' |
    tail -n "${EAS_LOG_LINES:-250}"
done
