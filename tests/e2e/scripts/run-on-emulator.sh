#!/usr/bin/env bash
# Runs on a booted emulator (GitHub Actions: reactivecircus/android-emulator-runner), with the
# local backend already started by tests/integration/start-backend.sh.
#
#   1. installs the E2E build and the upload fixture, freezes the status bar for screenshots
#   2. startup time (cold starts)
#   3. Maestro flows: sign-up, upload, AI, offline, themes, crash recovery
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

echo "::group::Backend reachable from the emulator"
# The app talks to 10.0.2.2 (the host). Fail early with a clear message if it cannot.
# nc is on the image (curl and wget are not): a raw HTTP request to the gateway.
adb shell "printf 'GET /auth/v1/health HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n' | nc -w 5 10.0.2.2 54321" | head -n 12 || echo "emulator cannot reach 10.0.2.2:54321"
echo "::endgroup::"

adb logcat -c || true
# TEMPORARY diagnostics (flow 04): which app is in the foreground, once a second, while the
# flows run, to see exactly when the app leaves the screen.
foreground_log="$reports/foreground.log"
( while true; do
    echo "$(date -u +%H:%M:%S) $(adb shell dumpsys activity activities 2>/dev/null | grep -m1 -E 'topResumedActivity|mResumedActivity' | tr -s ' ')"
    sleep 1
  done ) >"$foreground_log" 2>&1 &
foreground_pid=$!
echo "::group::Maestro flows"
# A directory: Maestro reads maestro/config.yaml (flow order) from it.
maestro_run flows maestro || tests_status=1
echo "::endgroup::"
kill "$foreground_pid" 2>/dev/null || true

if [[ $tests_status -ne 0 ]]; then
  echo "::group::Step-by-step: last failed flow (TEMPORARY)"
  # Maestro's debug output: every command of each flow with its status and start time.
  python3 - "$reports/maestro-flows" "$maestro_out/flows" "$HOME/.maestro/tests" <<'PY' || true
import glob, json, os, sys, datetime
files = sorted(
    (f for root in sys.argv[1:] for f in glob.glob(os.path.join(root, "**", "commands*.json"), recursive=True)),
    key=os.path.getmtime,
)
if not files:
    print("no commands*.json found; files under the Maestro folders:")
    for root in sys.argv[1:]:
        for dirpath, _, names in os.walk(root):
            for name in names[:20]:
                print(" ", os.path.join(dirpath, name))
for path in files[-1:]:
    print("file:", path)
    for entry in json.load(open(path)):
        command = entry.get("command", {})
        name = next(iter(command), "?")
        meta = entry.get("metadata", {})
        started = meta.get("timestamp")
        when = datetime.datetime.utcfromtimestamp(started / 1000).strftime("%H:%M:%S") if started else "--:--:--"
        detail = json.dumps(command.get(name, {}), ensure_ascii=False)[:160]
        error = (meta.get("error") or {}).get("message", "") if isinstance(meta.get("error"), dict) else ""
        print(f"{when} {meta.get('status', '?'):10} {name} {detail} {error}")
PY
  echo "--- Maestro's own log for that flow (commands and timings)"
  last_log=$(ls -t "$maestro_out"/flows/*/*/logs/maestro.log 2>/dev/null | head -n 1)
  [[ -n "$last_log" ]] && grep -E "Running|Completed|Failed|Command|back|irplane|launch" "$last_log" | tail -n 60 || true
  echo "--- foreground activity (last 90 s of samples)"
  tail -n 90 "$foreground_log" || true
  echo "--- window focus and activity changes (logcat)"
  adb logcat -d -v time -s ActivityTaskManager:I WindowManager:I ActivityManager:I 2>/dev/null \
    | grep -E "studexa|Focus|moveTaskToBack|finishActivity|START u0|Force stopping|Killing|launcher" | tail -n 60 || true
  echo "::endgroup::"
  echo "::group::Screen at the failure (visible texts)"
  maestro hierarchy 2>/dev/null | grep -oE '"(text|accessibilityText|resource-id)" *: *"[^"]+"' | head -n 80 || true
  echo "::endgroup::"
fi

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

echo "::group::App log (errors and network)"
adb logcat -d -v brief >"$reports/logcat.txt" 2>&1 || true
grep -E "e2e-|ReactNativeJS|OkHttp|Cleartext|cleartext|AndroidRuntime: FATAL" "$reports/logcat.txt" | grep -v "I/Maestro" | tail -n 80 || true
cp -r "$HOME/.maestro/tests" "$reports/maestro-home" 2>/dev/null || true
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
