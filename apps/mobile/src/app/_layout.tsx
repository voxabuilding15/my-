import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initI18n, syncLayoutDirection } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { useTheme } from '@/core/theme';

void SplashScreen.preventAutoHideAsync();

// Preferences hydrate synchronously from SQLite, so the locale is known before first render.
syncLayoutDirection(initI18n(usePreferencesStore.getState().locale));

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
