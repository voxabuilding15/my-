import type { AppLocale } from '@studexa/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistentStorage } from './kv';

export type ThemePreference = 'system' | 'light' | 'dark';

type PreferencesState = {
  theme: ThemePreference;
  /** `null` follows the device language. */
  locale: AppLocale | null;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: AppLocale | null) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: null,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'studexa.preferences', storage: persistentStorage, version: 1 },
  ),
);
