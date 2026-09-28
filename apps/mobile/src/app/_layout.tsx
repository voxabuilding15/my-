import * as SplashScreen from 'expo-splash-screen';

import { initI18n, syncLayoutDirection } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { AuthProvider } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';

void SplashScreen.preventAutoHideAsync();

// Preferences hydrate synchronously from SQLite, so the locale is known before first render.
syncLayoutDirection(initI18n(usePreferencesStore.getState().locale));

export default function RootLayout() {
  return (
    <AppProviders>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppProviders>
  );
}
