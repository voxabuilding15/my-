import { renderRouter } from 'expo-router/testing-library';

import { AppRepositoriesProvider } from '@/composition/app-repositories';
import { i18n, initI18n } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { createDemoRepositories } from '@/data/demo/demo-repositories';
import { AuthProvider, MockAuthRepository } from '@/features/auth';
import { RootNavigator } from '@/navigation/root-navigator';
import { SnackbarProvider } from '@/shared/ui';

/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded like Expo Router does */
const ROUTES = {
  '(onboarding)/_layout': require('@/app/(onboarding)/_layout'),
  '(onboarding)/onboarding': require('@/app/(onboarding)/onboarding'),
  '(app)/_layout': require('@/app/(app)/_layout'),
  '(app)/(tabs)/_layout': require('@/app/(app)/(tabs)/_layout'),
  '(app)/(tabs)/index': require('@/app/(app)/(tabs)/index'),
  '(app)/(tabs)/documents': require('@/app/(app)/(tabs)/documents'),
  '(app)/(tabs)/chat': require('@/app/(app)/(tabs)/chat'),
  '(app)/(tabs)/study': require('@/app/(app)/(tabs)/study'),
  '(app)/(tabs)/profile': require('@/app/(app)/(tabs)/profile'),
  '(app)/documents/[id]/index': require('@/app/(app)/documents/[id]/index'),
  '(app)/documents/[id]/read': require('@/app/(app)/documents/[id]/read'),
  '(app)/chat/[id]': require('@/app/(app)/chat/[id]'),
  '(app)/ai/[tool]': require('@/app/(app)/ai/[tool]'),
  '(app)/flashcards/review': require('@/app/(app)/flashcards/review'),
  '(app)/quizzes/[id]': require('@/app/(app)/quizzes/[id]'),
  '(app)/notes/[id]': require('@/app/(app)/notes/[id]'),
  '(app)/bookmarks': require('@/app/(app)/bookmarks'),
  '(app)/translator': require('@/app/(app)/translator'),
  '(app)/settings': require('@/app/(app)/settings'),
  '(app)/paywall': require('@/app/(app)/paywall'),
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

type Options = {
  repository?: MockAuthRepository;
  initialUrl?: string;
  /** First-launch onboarding already completed (default true). */
  onboarded?: boolean;
  demo?: ReturnType<typeof createDemoRepositories>;
  locale?: 'en' | 'ar' | 'fr';
};

/** Mounts the real route tree and guards with instant mock auth and demo content backends. */
export function renderApp(options: Options = {}) {
  initI18n('en');
  void i18n.changeLanguage(options.locale ?? 'en');
  usePreferencesStore.setState({ onboardingCompleted: options.onboarded ?? true });
  const repository = options.repository ?? new MockAuthRepository(0);
  const demo = options.demo ?? createDemoRepositories({ latencyMs: 0, tokenDelayMs: 0 });
  const result = renderRouter(
    {
      _layout: () => (
        <AppProviders>
          <AuthProvider repository={repository}>
            <AppRepositoriesProvider repositories={demo}>
              <SnackbarProvider>
                <RootNavigator />
              </SnackbarProvider>
            </AppRepositoriesProvider>
          </AuthProvider>
        </AppProviders>
      ),
      ...ROUTES,
    },
    { initialUrl: options.initialUrl ?? '/' },
  );
  return { ...result, repository, demo };
}

export async function signedInApp(options: Omit<Options, 'repository'> = {}) {
  const repository = new MockAuthRepository(0);
  await repository.signInWithPassword(DEMO.email, DEMO.password);
  return renderApp({ ...options, repository });
}

export const DEMO = { email: 'demo@studexa.app', password: 'Studexa2026' };
