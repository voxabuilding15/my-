#!/usr/bin/env bash
# Battery checks from batterystats after the E2E run: CPU time, wake locks, alarms and jobs,
# and — most important — that nothing keeps the device awake once the app is in the background.
# Usage: battery.sh <appId> <out.json>
set -euo pipefail
app="$1"; out="$2"
uid=$(adb shell dumpsys package "$app" | tr -d '\r' | awk -F'[= ]' '/userId=/ {for (i=1;i<=NF;i++) if ($i=="userId") {print $(i+1); exit}}')
stats=$(adb shell dumpsys batterystats --charged "$app" | tr -d '\r')
cpu=$(echo "$stats" | awk '/Total cpu time:/ {print; exit}')
wakelocks=$(echo "$stats" | grep -c "Wake lock" || true)
# Background: home screen, then check held wake locks and scheduled wake-ups after 60 s.
adb shell input keyevent KEYCODE_HOME
sleep 60
held=$(adb shell dumpsys power | tr -d '\r' | grep -i "$app" | grep -ci "wake" || true)
alarms=$(adb shell dumpsys alarm | tr -d '\r' | grep -c "$app" || true)
jobs=$(adb shell dumpsys jobscheduler | tr -d '\r' | grep -c "$app" || true)
cat >"$out" <<JSON
{"uid": "$uid", "cpu": "$cpu", "wakeLockEntries": $wakelocks,
 "wakeLocksHeldInBackground": $held, "alarmReferences": $alarms, "jobReferences": $jobs}
JSON
cat "$out"
# A wake lock still held a minute after going to the background drains the battery.
[[ "$held" -eq 0 ]]
