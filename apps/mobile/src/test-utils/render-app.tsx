import { renderRouter } from 'expo-router/testing-library';

import { initI18n } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { AuthProvider, MockAuthRepository } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';

/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded like Expo Router does */
const ROUTES = {
  '(app)/_layout': require('@/app/(app)/_layout'),
  '(app)/(tabs)/_layout': require('@/app/(app)/(tabs)/_layout'),
  '(app)/(tabs)/index': require('@/app/(app)/(tabs)/index'),
  '(app)/(tabs)/documents': require('@/app/(app)/(tabs)/documents'),
  '(app)/(tabs)/chat': require('@/app/(app)/(tabs)/chat'),
  '(app)/(tabs)/study': require('@/app/(app)/(tabs)/study'),
  '(app)/(tabs)/profile': require('@/app/(app)/(tabs)/profile'),
  '(app)/verify-email': require('@/app/(app)/verify-email'),
  '(app)/edit-profile': require('@/app/(app)/edit-profile'),
  '(app)/delete-account': require('@/app/(app)/delete-account'),
  '(app)/change-password': require('@/app/(app)/change-password'),
  '(app)/change-password-code': require('@/app/(app)/change-password-code'),
  '(auth)/_layout': require('@/app/(auth)/_layout'),
  '(auth)/welcome': require('@/app/(auth)/welcome'),
  '(auth)/sign-in': require('@/app/(auth)/sign-in'),
  '(auth)/sign-up': require('@/app/(auth)/sign-up'),
  '(auth)/forgot-password': require('@/app/(auth)/forgot-password'),
  '(auth)/reset-password': require('@/app/(auth)/reset-password'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Mounts the real route tree and guards with an injectable, instant mock auth backend. */
export function renderApp(options: { repository?: MockAuthRepository; initialUrl?: string } = {}) {
  initI18n('en');
  const repository = options.repository ?? new MockAuthRepository(0);
  const result = renderRouter(
    {
      _layout: () => (
        <AppProviders>
          <AuthProvider repository={repository}>
            <RootNavigator />
          </AuthProvider>
        </AppProviders>
      ),
      ...ROUTES,
    },
    { initialUrl: options.initialUrl ?? '/' },
  );
  return { ...result, repository };
}

export const DEMO = { email: 'demo@studexa.app', password: 'Studexa2026' };
