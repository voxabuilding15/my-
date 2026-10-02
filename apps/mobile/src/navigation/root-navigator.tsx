import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';

import { usePreferencesStore } from '@/core/storage/preferences-store';
import { useTheme } from '@/core/theme';
import { useAuth } from '@/features/auth';

/** Top-level navigation: first-launch onboarding, then routes guarded by auth state. */
export function RootNavigator() {
  const { scheme } = useTheme();
  const { status } = useAuth();
  const onboarded = usePreferencesStore((state) => state.onboardingCompleted);
  const signedIn = status === 'signed_in';
  const hydrated = usePreferencesHydrated();
  const ready = status !== 'loading' && hydrated;

  // Keep the splash screen until the stored session and preferences have been restored (no
  // onboarding or auth screen flash).
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Protected guard={!onboarded && !signedIn}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded && !signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/**
 * Preferences are restored synchronously on Android (native SQLite), so this is true from the
 * first render there; the web build restores them asynchronously (see core/storage/kv.web.ts).
 */
function usePreferencesHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => usePreferencesStore.persist.onFinishHydration(onChange),
    () => usePreferencesStore.persist.hasHydrated(),
  );
}
