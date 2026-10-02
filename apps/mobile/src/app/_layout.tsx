import { useFonts } from 'expo-font';
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { restartApp } from '@/core/app/restart';
import { env } from '@/core/config/env';
import { initI18n, syncLayoutDirection } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { initTelemetry, reportError, wrapRoot } from '@/core/telemetry';
import { FONT_ASSETS } from '@/core/theme';
import { AppRepositoriesProvider } from '@/composition/app-repositories';
import { AuthProvider } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';
import { OfflineBanner, SnackbarProvider } from '@/shared/ui';

initTelemetry();
void SplashScreen.preventAutoHideAsync();

// Preferences hydrate synchronously from SQLite, so the locale is known before first render.
// React Native applies a layout direction change only after a restart: when the language needs
// the other direction (first launch on an Arabic device, or the device language changed), restart
// once while the splash screen still covers the app. forceRTL is stored natively, so the restarted
// app already has the right direction (no loop). Not on web (no native direction) or in tests.
if (
  syncLayoutDirection(initI18n(usePreferencesStore.getState().locale)) &&
  Platform.OS !== 'web' &&
  process.env.NODE_ENV !== 'test'
) {
  void restartApp();
}

function RootLayout() {
  // Native builds embed the fonts (nothing to load); the web build loads them here.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  // On a load error, render with system fonts rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProviders>
      <AuthProvider>
        <AppRepositoriesProvider>
          <SnackbarProvider>
            <RootNavigator />
            <OfflineBanner />
          </SnackbarProvider>
        </AppRepositoriesProvider>
      </AuthProvider>
    </AppProviders>
  );
}

export default env.sentryDsn ? wrapRoot(RootLayout) : RootLayout;

/** Render crashes: reported, then expo-router's recovery screen (with retry). */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => reportError(props.error, { boundary: 'root' }), [props.error]);
  return <RouterErrorBoundary {...props} />;
}
