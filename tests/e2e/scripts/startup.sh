#!/usr/bin/env bash
# Cold-start time: force-stop, launch with `am start -W`, read TotalTime (ms to first frame).
# Usage: startup.sh <appId> <runs> <out.json>
set -euo pipefail
app="$1"; runs="${2:-7}"; out="$3"
activity=$(adb shell cmd package resolve-activity --brief "$app" | tr -d '\r' | tail -1)
times=()
for _ in $(seq 1 "$runs"); do
  adb shell am force-stop "$app"
  sleep 1
  t=$(adb shell am start -W -n "$activity" | tr -d '\r' | awk -F': ' '/TotalTime/ {print $2}')
  times+=("$t")
  sleep 3
done
sorted=$(printf '%s\n' "${times[@]}" | sort -n)
median=$(echo "$sorted" | awk '{a[NR]=$1} END {print a[int((NR+1)/2)]}')
printf '{"runs": [%s], "medianMs": %s}\n' "$(IFS=,; echo "${times[*]}")" "$median" >"$out"
cat "$out"
