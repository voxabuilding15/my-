import { localize } from '../remote-config';

describe('localize', () => {
  it('uses the current language and falls back to English', () => {
    const text = { en: 'Welcome', ar: 'أهلاً' };
    expect(localize(text, 'ar')).toBe('أهلاً');
    expect(localize(text, 'fr')).toBe('Welcome');
  });
});
