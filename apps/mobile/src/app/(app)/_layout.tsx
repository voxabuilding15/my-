import { Stack } from 'expo-router';

import { useTheme } from '@/core/theme';
import { useResumePendingUploads } from '@/features/documents';

export default function AppLayout() {
  const { colors, typography } = useTheme();
  // Signed-in area only: interrupted uploads continue here.
  useResumePendingUploads();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: typography.heading.fontFamily, fontSize: 18 },
        headerTintColor: colors.text,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="flashcards/review" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen
        name="paywall"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="notes/[id]" />
    </Stack>
  );
}
