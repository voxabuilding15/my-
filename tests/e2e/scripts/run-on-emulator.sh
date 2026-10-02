#!/usr/bin/env bash
# Runs on a booted emulator (GitHub Actions: reactivecircus/android-emulator-runner), with the
# local backend already started by tests/integration/start-backend.sh.
#
#   1. installs the E2E build and the upload fixture, freezes the status bar for screenshots
#   2. startup time (cold starts)
#   3. Maestro flows: sign-up, upload, AI, offline (airplane mode via adb), themes, crash
#      recovery, sign-out
#   4. slow networks: the AI flow again on 3G and 2G (EDGE)
#   5. memory: the AI flow repeated, PSS must not keep growing
#   6. battery: batterystats, no wake locks held in the background
#   7. visual regression against baselines
#
# Env: APK, DEVICE (phone|tablet). Writes everything under tests/e2e/reports/<device>/.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
DEVICE="${DEVICE:-phone}"
APP_ID="${APP_ID:-com.studexa.ai.preview}"
reports="$here/reports/$DEVICE"
shots="$reports/screenshots"
mkdir -p "$reports" "$shots"
export PATH="$HOME/.maestro/bin:$PATH"

run_id="$(date +%s)-$DEVICE"
MAESTRO_ENV=(
  -e "APP_ID=$APP_ID"
  -e "E2E_EMAIL=e2e-$run_id@studexa-tests.dev"
  -e "E2E_PASSWORD=E2eStudent1pass" # disposable account on the throwaway CI backend. gitleaks:allow
  -e "MOCK_URL=http://127.0.0.1:54400"
  -e "THEME_SUFFIX=default"
)
# Screenshots: Maestro only writes inside its own output folder (--test-output-dir); flows
# use plain names and collect_screenshots copies them to $shots for the visual comparison.
maestro_out="$reports/maestro-output"
maestro_run() { # name, flows...
  local name="$1"; shift
  maestro test "${MAESTRO_ENV[@]}" --format junit --output "$reports/$name.xml" \
    --test-output-dir "$maestro_out/$name" --debug-output "$reports/maestro-$name" "$@"
}
collect_screenshots() {
  find "$maestro_out" -type f \( -name 'home-*.png' -o -name 'chat-*.png' -o -name 'offline-*.png' \
    -o -name 'screen-*.png' \) -exec cp {} "$shots/" \; 2>/dev/null || true
  echo "screenshots collected: $(find "$shots" -name '*.png' | wc -l)"
}

echo "::group::Install"
adb install -r -g "$APK"
pnpm --silent fixture /tmp/studexa-e2e-biology.pdf
adb push /tmp/studexa-e2e-biology.pdf /sdcard/Download/studexa-e2e-biology.pdf
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/studexa-e2e-biology.pdf >/dev/null
# Deterministic status bar (clock, battery, signal) for visual comparisons.
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0930 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
adb shell dumpsys batterystats --reset >/dev/null
# CI emulators on slow runners show "Pixel Launcher / System UI isn't responding" dialogs over
# the app at random moments. Hide Android's error dialogs on this throwaway emulator only;
# app crashes are still caught (fatal errors in logcat, flows failing when the app is gone).
adb shell settings put global hide_error_dialogs 1
echo "::endgroup::"

echo "::group::Startup time"
tests_status=0
scripts/startup.sh "$APP_ID" 7 "$reports/startup.json"
echo "::endgroup::"

adb logcat -c || true
echo "::group::Maestro flows"
# One Maestro run per flow, in order: a failure is reported and the next flow still runs.
# Flow 07 signs out, so the offline flows (signed-in account) run before it.
flow() { maestro_run "flow-$1" "maestro/flows/$1.yaml" || tests_status=1; }
flow 01-first-launch-sign-up
flow 02-upload-and-read
flow 03-ask-ai
echo "::endgroup::"

echo "::group::Offline"
# Airplane mode through adb, not Maestro's setAirplaneMode (it opens the Settings app on
# Android 11+, which backgrounds Studexa). The app sees the change through NetInfo.
airplane() { adb shell cmd connectivity airplane-mode "$1"; }
maestro_run offline-cache maestro/offline/04a-cache-document.yaml || tests_status=1
airplane enable
maestro_run offline maestro/offline/04b-offline.yaml || tests_status=1
airplane disable
maestro_run offline-recover maestro/offline/04c-back-online.yaml || tests_status=1
echo "::endgroup::"

echo "::group::Maestro flows (themes, crash recovery, sign-out)"
flow 05-themes-and-screens
flow 06-crash-recovery
flow 07-sign-out
echo "::endgroup::"

if [[ $tests_status -eq 0 ]]; then
  echo "::group::Slow networks"
  for profile in umts edge; do
    scripts/network.sh "$profile"
    started=$(date +%s)
    maestro_run "ai-$profile" maestro/flows/03-ask-ai.yaml || tests_status=1
    echo "{\"profile\": \"$profile\", \"seconds\": $(( $(date +%s) - started ))}" >"$reports/network-$profile.json"
  done
  scripts/network.sh full
  echo "::endgroup::"

  echo "::group::Memory"
  samples=()
  for i in 1 2 3 4 5 6; do
    maestro_run "memory-$i" maestro/flows/03-ask-ai.yaml >/dev/null || tests_status=1
    samples+=("$(scripts/memory.sh "$APP_ID")")
  done
  first=${samples[1]}; last=${samples[5]}
  growth=$(( (last - first) * 100 / first ))
  echo "{\"pssKb\": [$(IFS=,; echo "${samples[*]}")], \"growthPercentAfterWarmup\": $growth}" | tee "$reports/memory.json"
  # Repeating the same flow must not keep adding memory (warm-up excluded).
  if (( growth > 15 )); then echo "PSS grew ${growth}% over repeated AI sessions" >&2; tests_status=1; fi
  echo "::endgroup::"
fi

echo "::group::Crashes and ANRs (Android vitals)"
# The device log of the whole run is kept with the reports. The app must never crash
# (uncaught Java/Kotlin or native error) or freeze long enough for Android to report an ANR.
adb logcat -d -v time >"$reports/logcat.txt" 2>&1 || true
crashes=$(grep -cE "FATAL EXCEPTION|Fatal signal" "$reports/logcat.txt" | head -n1 || true)
app_crashes=$(grep -A3 -E "FATAL EXCEPTION|Fatal signal" "$reports/logcat.txt" | grep -c "$APP_ID" || true)
anrs=$(grep -cE "ANR in $APP_ID" "$reports/logcat.txt" || true)
echo "{\"appCrashes\": ${app_crashes:-0}, \"appAnrs\": ${anrs:-0}, \"deviceCrashLines\": ${crashes:-0}}" | tee "$reports/vitals.json"
if (( ${app_crashes:-0} > 0 || ${anrs:-0} > 0 )); then
  grep -B2 -A20 -E "FATAL EXCEPTION|ANR in $APP_ID" "$reports/logcat.txt" | head -n 80 >&2
  tests_status=1
fi
echo "::endgroup::"

echo "::group::Authentication evidence (API gateway log)"
# What the app did against the real auth server during the flows. Each must have happened.
auth_log=$(docker logs supabase_kong_studexa 2>&1 | grep -E '"(POST|GET) /auth/v1/' | grep 'okhttp' || true)
echo "$auth_log" | awk '{print $6, $7, $9}' | sort | uniq -c
check_auth() { # label, pattern
  if echo "$auth_log" | grep -qE "$2"; then echo "ok: $1"; else echo "missing: $1" >&2; tests_status=1; fi
}
if [[ $tests_status -eq 0 ]]; then
  check_auth "email sign-up (200)" '"POST /auth/v1/signup[^"]*" 200'
  check_auth "refresh token (200)" '"POST /auth/v1/token\?grant_type=refresh_token[^"]*" 200'
  check_auth "sign-out (204)" '"POST /auth/v1/logout[^"]*" 204'
  # Email verification: the code entered in the app marked the account verified on the server.
  verified=$(docker exec supabase_db_studexa psql -U postgres -At -c \
    "select count(*) from auth.users where email like 'e2e-%' and (raw_app_meta_data->>'email_verified')::boolean" || echo 0)
  if [[ "$verified" -ge 1 ]]; then echo "ok: email verification ($verified account)"; else echo "missing: email verification" >&2; tests_status=1; fi
fi
echo "::endgroup::"

echo "::group::Battery"
scripts/battery.sh "$APP_ID" "$reports/battery.json" || tests_status=1
echo "::endgroup::"

echo "::group::Visual regression"
collect_screenshots
pnpm --silent compare "$shots" "$DEVICE" "$reports/visual.json" || tests_status=1
echo "::endgroup::"

exit $tests_status
