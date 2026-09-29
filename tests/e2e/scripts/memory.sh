#!/usr/bin/env bash
# Total PSS (KB) of the app process, after asking it to trim memory like Android does.
# Usage: memory.sh <appId>
set -euo pipefail
app="$1"
adb shell am send-trim-memory "$app" RUNNING_LOW >/dev/null 2>&1 || true
sleep 2
adb shell dumpsys meminfo "$app" | tr -d '\r' | awk '/TOTAL PSS:/ {print $3; exit} /^ *TOTAL / {print $2; exit}'
