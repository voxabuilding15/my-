#!/usr/bin/env node
/**
 * Verifies a production Android App Bundle before it goes anywhere near Google Play:
 * release manifest (not debuggable, no cleartext traffic, expected version and permissions),
 * R8 and resource shrinking, a Hermes bytecode bundle, and a JavaScript bundle without test
 * code, dev dependencies or console.log calls.
 *
 * Usage:
 *   node scripts/verify-release-bundle.mjs <android project dir> <bundletool.jar>
 *     a Gradle build (`./gradlew bundleRelease`): every check, including build settings and the
 *     JavaScript source map
 *   node scripts/verify-release-bundle.mjs --bundle <app.aab> <bundletool.jar>
 *     a finished bundle (e.g. the signed one from EAS): manifest, R8, Hermes and signing checks;
 *     prints the upload certificate fingerprints (needed for Google Sign-In)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const bundleOnly = args[0] === '--bundle';
const [target, bundletool] = bundleOnly ? args.slice(1) : args;
if (!target || !bundletool) {
  console.error(
    'usage: verify-release-bundle.mjs <android project dir> <bundletool.jar>\n' +
      '       verify-release-bundle.mjs --bundle <app.aab> <bundletool.jar>',
  );
  process.exit(2);
}

const projectDir = bundleOnly ? '' : target;
const app = join(projectDir, 'app');
const aab = bundleOnly ? target : join(app, 'build/outputs/bundle/release/app-release.aab');
const mapping = join(app, 'build/outputs/mapping/release/mapping.txt');
const sourcemap = join(app, 'build/generated/sourcemaps/react/release/index.android.bundle.map');
const mobileRoot = join(projectDir, '..');
const expected = JSON.parse(process.env.EXPECTED_APP ?? '{}');

/** Every permission the store build may request; anything new must be reviewed and added. */
const ALLOWED_PERMISSIONS = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CAMERA', // photographing a page (image picker)
  'android.permission.POST_NOTIFICATIONS', // study reminders
  'android.permission.RECEIVE_BOOT_COMPLETED', // reminders survive a reboot
  'android.permission.VIBRATE', // haptics
  'android.permission.WAKE_LOCK', // notifications and Play Billing
  'android.permission.READ_EXTERNAL_STORAGE', // Android 12 and older only (maxSdkVersion 32)
  'com.android.vending.BILLING', // subscriptions
  'com.google.android.c2dm.permission.RECEIVE', // push delivery (Firebase messaging)
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE', // Play Billing library
  // Unread-count badges on third-party launchers (ShortcutBadger, via expo-notifications).
  // Normal permissions: granted at install, no prompt, no access to user data.
  'android.permission.READ_APP_BADGE',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
]);
/** Declared nowhere in the app, but some libraries add them; each would change the Data safety form. */
const FORBIDDEN_PERMISSIONS = new Set([
  'com.google.android.gms.permission.AD_ID',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.USE_BIOMETRIC', // blocked in app.config (never used)
  'android.permission.USE_FINGERPRINT',
]);

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

check(existsSync(aab), 'app bundle built', aab);
if (!existsSync(aab)) process.exit(1);
check(true, 'bundle size', `${(statSync(aab).size / 1024 / 1024).toFixed(1)} MB`);

// Manifest ---------------------------------------------------------------------------------
const manifest = execFileSync('java', ['-jar', bundletool, 'dump', 'manifest', '--bundle', aab], {
  encoding: 'utf8',
});
const attr = (name) => manifest.match(new RegExp(`${name}="([^"]*)"`))?.[1];
check(!/android:debuggable="true"/.test(manifest), 'not debuggable');
check(!/android:usesCleartextTraffic="true"/.test(manifest), 'no cleartext (HTTP) traffic');
check(attr('android:allowBackup') === 'false', 'backups disabled', attr('android:allowBackup'));
if (expected.package) check(attr('package') === expected.package, 'package', attr('package'));
if (expected.versionName)
  check(
    attr('android:versionName') === expected.versionName,
    'versionName',
    attr('android:versionName'),
  );
check(Number(attr('android:versionCode')) >= 1, 'versionCode', attr('android:versionCode'));

const permissions = [
  ...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"[^>]*>/g),
].map((m) => ({ name: m[1], tag: m[0] }));
const forbidden = permissions.filter((p) => FORBIDDEN_PERMISSIONS.has(p.name));
const unreviewed = permissions.filter(
  (p) =>
    !ALLOWED_PERMISSIONS.has(p.name) &&
    !FORBIDDEN_PERMISSIONS.has(p.name) &&
    !p.name.endsWith('.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'),
);
check(forbidden.length === 0, 'no forbidden permissions', forbidden.map((p) => p.name).join(', '));
check(
  unreviewed.length === 0,
  'only reviewed permissions',
  unreviewed.map((p) => p.name).join(', '),
);
const storage = permissions.find((p) => p.name === 'android.permission.READ_EXTERNAL_STORAGE');
check(
  !storage || /maxSdkVersion="32"/.test(storage.tag),
  'storage read limited to Android 12 and older',
);
console.log(`     permissions: ${permissions.map((p) => p.name.split('.').pop()).join(', ')}`);

// Code shrinking ---------------------------------------------------------------------------
const entries = execFileSync('unzip', ['-Z1', aab], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
// The Android Gradle plugin stores R8's mapping in the bundle metadata when code is minified.
check(
  entries.includes('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'),
  'R8 ran (obfuscation mapping in the bundle metadata)',
);
if (!bundleOnly) {
  check(
    existsSync(mapping) && statSync(mapping).size > 0,
    'R8 mapping file written',
    existsSync(mapping) ? `${(statSync(mapping).size / 1024 / 1024).toFixed(1)} MB` : 'missing',
  );
  const gradleProperties = readFileSync(join(projectDir, 'gradle.properties'), 'utf8');
  check(
    /android\.enableMinifyInReleaseBuilds=true/.test(gradleProperties),
    'R8 enabled for release',
  );
  check(
    /android\.enableShrinkResourcesInReleaseBuilds=true/.test(gradleProperties),
    'resource shrinking enabled for release',
  );
  check(/hermesEnabled=true/.test(gradleProperties), 'Hermes enabled');
}

// Signing (finished bundles only: Gradle CI builds are debug-signed on purpose) -------------
if (bundleOnly) {
  const certificate = execFileSync('keytool', ['-printcert', '-jarfile', aab], {
    encoding: 'utf8',
  });
  check(!/CN=Android Debug/.test(certificate), 'signed with the upload key, not the debug key');
  const sha1 = certificate.match(/SHA1:\s*([0-9A-F:]+)/)?.[1];
  const sha256 = certificate.match(/SHA256:\s*([0-9A-F:]+)/)?.[1];
  check(Boolean(sha1 && sha256), 'upload certificate readable');
  console.log(`     upload certificate SHA-1:   ${sha1 ?? 'n/a'}`);
  console.log(`     upload certificate SHA-256: ${sha256 ?? 'n/a'}`);
}

// JavaScript -------------------------------------------------------------------------------
const jsBundle = execFileSync('unzip', ['-p', aab, 'base/assets/index.android.bundle'], {
  maxBuffer: 64 * 1024 * 1024,
});
// Hermes bytecode files start with the magic number 0x1F1903C103BC1FC6 (little endian).
check(
  jsBundle.subarray(0, 8).equals(Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f])),
  'JavaScript compiled to Hermes bytecode',
);

if (bundleOnly) {
  // The source map stays on the build server; the Gradle verification covers the JavaScript.
} else if (existsSync(sourcemap)) {
  const map = JSON.parse(readFileSync(sourcemap, 'utf8'));
  const devDependencies = Object.keys(
    JSON.parse(readFileSync(join(mobileRoot, 'package.json'), 'utf8')).devDependencies ?? {},
  );
  const packageOf = (source) => {
    const i = source.lastIndexOf('node_modules/');
    if (i < 0) return null;
    const parts = source.slice(i + 13).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  };
  const packages = new Set(map.sources.map(packageOf).filter(Boolean));
  const bundledDev = devDependencies.filter((d) => packages.has(d));
  check(bundledDev.length === 0, 'no dev dependencies in the bundle', bundledDev.join(', '));
  const testFiles = map.sources.filter(
    (s) => !s.includes('node_modules') && /__tests__|\.test\.|test-utils|__mocks__/.test(s),
  );
  check(testFiles.length === 0, 'no test files in the bundle', testFiles.join(', '));
  // Source contents are embedded: app code must not call console.log/info/debug after Babel.
  const appSources = (map.sourcesContent ?? []).filter(
    (_, i) => !map.sources[i].includes('node_modules'),
  );
  if (appSources.length > 0) {
    const logging = appSources.filter((s) => /\bconsole\.(log|info|debug)\(/.test(s ?? '')).length;
    check(logging === 0, 'app source has no console.log/info/debug', `${logging} files`);
  }
} else {
  check(false, 'JavaScript source map present', sourcemap);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed` : '\nrelease bundle verified');
process.exit(failed.length ? 1 : 0);
