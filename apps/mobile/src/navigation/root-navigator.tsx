import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/core/theme';
import { useAuth } from '@/features/auth';

/** Top-level navigation: routes are guarded by auth state (composition root, may use features). */
export function RootNavigator() {
  const { scheme } = useTheme();
  const { status } = useAuth();
  const signedIn = status === 'signed_in';

  // Keep the splash screen until the stored session has been restored (no auth screen flash).
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
