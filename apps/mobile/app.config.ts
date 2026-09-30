/// <reference types="node" />

import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'development') as Variant;

const VARIANTS: Record<Variant, { name: string; packageSuffix: string }> = {
  development: { name: 'Studexa (Dev)', packageSuffix: '.dev' },
  preview: { name: 'Studexa (Preview)', packageSuffix: '.preview' },
  production: { name: 'Studexa', packageSuffix: '' },
};

const BRAND_BACKGROUND = '#0A0A0C';
const BUNDLE_ID = 'com.studexa.ai';
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
// EAS project (created with `eas init`); an environment variable so forks don't build into it.
const easProjectId = process.env.EAS_PROJECT_ID;

/**
 * A store build must never fall back to demo data or run without crash reporting: without
 * these values the app would silently use the in-memory mock backend. Checked only on EAS
 * production builds (EAS_BUILD_PROFILE), so local development and CI exports are unaffected.
 */
const REQUIRED_FOR_STORE = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_LEGAL_BASE_URL',
] as const;
if (process.env.EAS_BUILD_PROFILE === 'production') {
  const missing: string[] = REQUIRED_FOR_STORE.filter((key) => !process.env[key]?.trim());
  if (variant !== 'production') missing.push('APP_VARIANT=production');
  if (process.env.EXPO_PUBLIC_USE_MOCKS === 'true') missing.push('EXPO_PUBLIC_USE_MOCKS unset');
  if (missing.length > 0) {
    throw new Error(`Production build is missing: ${missing.join(', ')}`);
  }
}
// Build-time only (source map upload); the DSN itself is EXPO_PUBLIC_SENTRY_DSN.
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

// Embedded at build time (no runtime font loading or text flash on release builds).
const FONT_FILES = [
  '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
  '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
  '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
  '@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf',
  '@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf',
  '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf',
  '@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf',
].map((file) => require.resolve(file));

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANTS[variant].name,
  slug: 'studexa',
  scheme: 'studexa',
  // Store version shown to users. The Android versionCode is kept by EAS (remote, auto-incremented
  // on every production build), so it never has to be edited here.
  version: '1.0.0',
  // Over-the-air updates (EAS Update). An update reaches only builds with the same native
  // fingerprint, so a JavaScript fix can never land on a binary it doesn't match. Updates
  // download in the background and apply on the next launch (no wait on the splash screen).
  runtimeVersion: { policy: 'fingerprint' },
  ...(easProjectId
    ? {
        updates: {
          url: `https://u.expo.dev/${easProjectId}`,
          checkAutomatically: 'ON_LOAD' as const,
          fallbackToCacheTimeout: 0,
        },
      }
    : {}),
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: `${BUNDLE_ID}${VARIANTS[variant].packageSuffix}`,
    supportsTablet: true,
  },
  android: {
    package: `${BUNDLE_ID}${VARIANTS[variant].packageSuffix}`,
    // Keeps session data out of Android cloud/adb backups.
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: BRAND_BACKGROUND,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
    // Least privilege: permissions are added per feature (camera, notifications) by their plugins.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      // Added by the expo-file-system and expo-image-picker plugins for Android 12 and older.
      // The app never writes to shared storage (files arrive through the system pickers).
      'android.permission.WRITE_EXTERNAL_STORAGE',
      // Merged in from the biometric library behind expo-secure-store. The app never asks for
      // biometric unlock, so the store listing should not show "use biometric hardware".
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    // No-op unless E2E_BUILD=1 (emulator tests against a local backend).
    './plugins/with-e2e-network.js',
    ['expo-localization', { supportsRTL: true }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-web-browser',
    ['expo-font', { fonts: FONT_FILES }],
    // Android needs no plugin options; iOS requires the reversed client id as a URL scheme.
    ...(googleIosUrlScheme
      ? [
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [
            string,
            unknown,
          ],
        ]
      : []),
    ...(sentryOrg && sentryProject
      ? [
          ['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }] as [
            string,
            unknown,
          ],
        ]
      : []),
    // Release builds: R8 removes unused Java/Kotlin code and resources. No mapping file is
    // uploaded to Sentry, so native (Java/Kotlin) stack traces there are obfuscated; JS
    // stack traces are unaffected (source maps).
    [
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          enablePngCrunchInReleaseBuilds: true,
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/images/splash-icon.png', backgroundColor: BRAND_BACKGROUND },
      },
    ],
  ],
  extra: {
    supportsRTL: true,
    variant,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
