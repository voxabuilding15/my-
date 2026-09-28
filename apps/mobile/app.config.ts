import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'development') as Variant;

const VARIANTS: Record<Variant, { name: string; packageSuffix: string }> = {
  development: { name: 'Studexa (Dev)', packageSuffix: '.dev' },
  preview: { name: 'Studexa (Preview)', packageSuffix: '.preview' },
  production: { name: 'Studexa', packageSuffix: '' },
};

const BRAND_BACKGROUND = '#0A0A0C';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANTS[variant].name,
  slug: 'studexa',
  scheme: 'studexa',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: `com.studexa.ai${VARIANTS[variant].packageSuffix}`,
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
    ['expo-localization', { supportsRTL: true }],
    'expo-sqlite',
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
