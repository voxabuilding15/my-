import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, title: '', headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="delete-account" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="change-password-code" />
    </Stack>
  );
}
