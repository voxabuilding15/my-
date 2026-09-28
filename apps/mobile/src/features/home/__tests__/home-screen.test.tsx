import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/core/i18n';
import { AppProviders } from '@/core/providers/app-providers';
import { AuthProvider, MockAuthRepository } from '@/features/auth';

import { HomeScreen } from '../index';

beforeAll(() => {
  initI18n('en');
});

describe('HomeScreen', () => {
  it('renders the greeting and the demo-mode banner without a backend', async () => {
    await render(
      <AppProviders>
        <AuthProvider repository={new MockAuthRepository(0)}>
          <HomeScreen />
        </AuthProvider>
      </AppProviders>,
    );
    expect(await screen.findByText('Ready to learn?')).toBeOnTheScreen();
    expect(screen.getByText('Demo mode — sample data')).toBeOnTheScreen();
  });
});
