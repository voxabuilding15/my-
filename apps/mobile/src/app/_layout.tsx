import { useFonts } from 'expo-font';
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { env } from '@/core/config/env';
import { initI18n, syncLayoutDirection } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { initTelemetry, reportError, wrapRoot } from '@/core/telemetry';
import { FONT_ASSETS } from '@/core/theme';
import { AppRepositoriesProvider } from '@/composition/app-repositories';
import { AuthProvider } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';
import { SnackbarProvider } from '@/shared/ui';

initTelemetry();
void SplashScreen.preventAutoHideAsync();

// Preferences hydrate synchronously from SQLite, so the locale is known before first render.
syncLayoutDirection(initI18n(usePreferencesStore.getState().locale));

function RootLayout() {
  // Instant on release builds (fonts are embedded); needed for Expo Go and web.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  // On a load error, render with system fonts rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProviders>
      <AuthProvider>
        <AppRepositoriesProvider>
          <SnackbarProvider>
            <RootNavigator />
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
