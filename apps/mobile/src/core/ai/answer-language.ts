import { APP_LOCALES, type AppLocale } from '@studexa/shared';
import { useTranslation } from 'react-i18next';

import { usePreferencesStore } from '@/core/storage/preferences-store';

/** The language AI answers are written in: the user's choice, else the app language. */
export function useAnswerLanguage(): [AppLocale, (language: AppLocale | null) => void] {
  const { i18n } = useTranslation();
  const chosen = usePreferencesStore((state) => state.answerLanguage);
  const setLanguage = usePreferencesStore((state) => state.setAnswerLanguage);
  const appLanguage = (APP_LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as AppLocale)
    : 'en';
  return [chosen ?? appLanguage, setLanguage];
}
