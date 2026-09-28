export const APP_LOCALES = ['en', 'ar', 'fr'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(['ar']);

export function isRtlLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.has(locale);
}

export function resolveAppLocale(candidates: readonly string[]): AppLocale {
  for (const tag of candidates) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    const match = APP_LOCALES.find((locale) => locale === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Languages the AI translator accepts (ISO 639-1). Independent of the UI locales. */
export const TRANSLATION_LANGUAGES = {
  ar: 'Arabic',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  tr: 'Turkish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  hi: 'Hindi',
  ur: 'Urdu',
  fa: 'Persian',
  id: 'Indonesian',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
} as const;
export type TranslationLanguage = keyof typeof TRANSLATION_LANGUAGES;
