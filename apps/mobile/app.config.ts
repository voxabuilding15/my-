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
  version: '0.1.0',
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
    versionCode: 1,
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
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
