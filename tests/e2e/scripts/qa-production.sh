#!/usr/bin/env bash
# QA of the signed production build (EAS AAB → universal APK) on a booted emulator, against the
# production backend. Only screens reachable without an account are driven here; signed-in
# flows run in the E2E workflow (same code, release build, local backend).
#
# Env: APK, DEVICE (phone|tablet). Writes tests/e2e/reports/production-<device>/.
set -uo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
APP_ID=com.studexa.ai
reports="$here/reports/production-$DEVICE"
mkdir -p "$reports"
export PATH="$HOME/.maestro/bin:$PATH"
status=0

adb install -r -g "$APK"
adb shell settings put global hide_error_dialogs 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null || true
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0930 >/dev/null || true
adb logcat -c || true

flow() { # name, file, extra maestro args...
  local name="$1" file="$2"; shift 2
  maestro test -e "SUFFIX=$name" "$@" --format junit --output "$reports/$name.xml" \
    --test-output-dir "$reports/maestro-$name" "maestro/production/$file" || status=1
  # takeScreenshot writes to the working directory
  mv "$here"/*.png "$reports/" 2>/dev/null || true
  # Where the flow ended (screen and UI tree), for review when a step fails
  adb exec-out screencap -p >"$reports/$name-zz-end.png" || true
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$reports/$name-end-ui.xml" >/dev/null 2>&1 || true
}
fresh() { adb shell pm clear "$APP_ID" >/dev/null; }

echo "::group::Cold start (production build)"
fresh
times=()
for i in 1 2 3 4 5; do
  adb shell am force-stop "$APP_ID"
  t=$(adb shell am start -W -n "$APP_ID/.MainActivity" | awk -F': ' '/TotalTime/ {print $2}' | tr -d '\r')
  times+=("$t")
done
echo "{\"coldStartMs\": [$(IFS=,; echo "${times[*]}")]}" | tee "$reports/startup.json"
echo "::endgroup::"

echo "::group::Production backend reachable"
fresh
flow backend assert-backend.yaml
echo "::endgroup::"

echo "::group::Light, English"
adb shell cmd uimode night no
fresh
flow light-en screens.yaml -e "FORGOT=Forgot password?"
echo "::endgroup::"

echo "::group::Dark, English"
adb shell cmd uimode night yes
fresh
flow dark-en screens.yaml -e "FORGOT=Forgot password?"
adb shell cmd uimode night no
echo "::endgroup::"

echo "::group::Arabic (RTL)"
fresh
adb shell cmd locale set-app-locales "$APP_ID" --locales ar
# First launch on an Arabic device: the layout direction is applied after a restart.
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 12
adb exec-out screencap -p >"$reports/ar-00-first-launch.png"
adb shell am force-stop "$APP_ID"
flow ar screens.yaml -e "FORGOT=نسيت كلمة المرور؟"
adb shell cmd locale set-app-locales "$APP_ID" --locales en
echo "::endgroup::"

echo "::group::Crashes and ANRs"
adb logcat -d -v time >"$reports/logcat.txt" 2>&1 || true
app_crashes=$(grep -A3 -E "FATAL EXCEPTION|Fatal signal" "$reports/logcat.txt" | grep -c "$APP_ID" || true)
anrs=$(grep -cE "ANR in $APP_ID" "$reports/logcat.txt" || true)
js_errors=$(grep -cE "ReactNativeJS.*(Error|Exception)" "$reports/logcat.txt" || true)
echo "{\"appCrashes\": ${app_crashes:-0}, \"appAnrs\": ${anrs:-0}, \"jsErrorLines\": ${js_errors:-0}}" | tee "$reports/vitals.json"
grep -E "ReactNativeJS" "$reports/logcat.txt" | grep -iE "error|exception|warn" | head -40 || true
if (( ${app_crashes:-0} > 0 || ${anrs:-0} > 0 )); then status=1; fi
echo "::endgroup::"

# Screenshots in one folder (the publish job commits them for review).
mkdir -p "$reports/screens"
find "$reports" -name '*.png' -not -path "*/screens/*" -exec cp {} "$reports/screens/" \;
echo "screenshots: $(ls "$reports/screens" | wc -l)"
exit $status
