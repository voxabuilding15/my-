import { isRtlLocale, resolveAppLocale, type AppLocale } from '@studexa/shared';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import { ar } from './locales/ar';
import { en } from './locales/en';
import { fr } from './locales/fr';

export const i18n = createInstance();

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
  fr: { translation: fr },
} as const satisfies Record<AppLocale, unknown>;

export function deviceLocale(): AppLocale {
  return resolveAppLocale(getLocales().map((locale) => locale.languageTag));
}

export function initI18n(preferred: AppLocale | null): AppLocale {
  const locale = preferred ?? deviceLocale();
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
      // Resources are bundled, so initialise synchronously and render translated text on the first frame.
      initAsync: false,
    });
  }
  return locale;
}

/**
 * Aligns the native layout direction with the locale. React Native only applies a
 * direction change after the app restarts, so callers must reload when this returns true.
 */
export function syncLayoutDirection(locale: AppLocale): boolean {
  const shouldBeRtl = isRtlLocale(locale);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === shouldBeRtl) return false;
  I18nManager.forceRTL(shouldBeRtl);
  return true;
}

export async function changeLocale(locale: AppLocale): Promise<{ restartRequired: boolean }> {
  await i18n.changeLanguage(locale);
  return { restartRequired: syncLayoutDirection(locale) };
}
