import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { initI18n, syncLayoutDirection } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { FONT_ASSETS } from '@/core/theme';
import { AppRepositoriesProvider } from '@/composition/app-repositories';
import { AuthProvider } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';
import { SnackbarProvider } from '@/shared/ui';

void SplashScreen.preventAutoHideAsync();

// Preferences hydrate synchronously from SQLite, so the locale is known before first render.
syncLayoutDirection(initI18n(usePreferencesStore.getState().locale));

export default function RootLayout() {
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
