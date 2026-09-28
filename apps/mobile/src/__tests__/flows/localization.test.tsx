import { screen } from 'expo-router/testing-library';

import { i18n } from '@/core/i18n';
import { signedInApp } from '@/test-utils/render-app';

jest.setTimeout(20_000);

afterEach(() => void i18n.changeLanguage('en'));

describe('localized dashboard', () => {
  it('renders Arabic with correct plural forms', async () => {
    await signedInApp({ locale: 'ar' });
    expect(await screen.findByText('مستعد للتعلّم؟')).toBeOnTheScreen();
    // Arabic "few" plural (3–10): أيام
    expect(await screen.findByText('سلسلة 6 أيام')).toBeOnTheScreen();
    expect(screen.getByText('المكتبة')).toBeOnTheScreen();
  });

  it('renders French', async () => {
    await signedInApp({ locale: 'fr' });
    expect(await screen.findByText('Prêt à apprendre ?')).toBeOnTheScreen();
    expect(await screen.findByText('9 cartes à revoir')).toBeOnTheScreen();
  });
});
