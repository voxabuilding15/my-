import type { AppLocale } from '@studexa/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistentStorage } from './kv';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ReminderSettings = {
  enabled: boolean;
  /** Local time, 24h. */
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
};

type PreferencesState = {
  theme: ThemePreference;
  /** `null` follows the device language. */
  locale: AppLocale | null;
  onboardingCompleted: boolean;
  dailyGoalMinutes: number;
  reminder: ReminderSettings;
  /** Language of AI answers; `null` follows the app language. */
  answerLanguage: AppLocale | null;
  /** Announcement ids the user closed (bounded; oldest dropped). */
  dismissedAnnouncements: string[];
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: AppLocale | null) => void;
  completeOnboarding: () => void;
  setDailyGoal: (minutes: number) => void;
  setReminder: (reminder: ReminderSettings) => void;
  dismissAnnouncement: (id: string) => void;
  setAnswerLanguage: (language: AppLocale | null) => void;
};

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 19,
  minute: 0,
  days: [0, 1, 2, 3, 4, 5, 6],
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: null,
      onboardingCompleted: false,
      dailyGoalMinutes: 20,
      reminder: DEFAULT_REMINDER,
      dismissedAnnouncements: [],
      answerLanguage: null,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      setDailyGoal: (dailyGoalMinutes) => set({ dailyGoalMinutes }),
      setReminder: (reminder) => set({ reminder }),
      setAnswerLanguage: (answerLanguage) => set({ answerLanguage }),
      dismissAnnouncement: (id) =>
        set((state) => ({
          dismissedAnnouncements: [
            ...state.dismissedAnnouncements.filter((d) => d !== id),
            id,
          ].slice(-50),
        })),
    }),
    {
      name: 'studexa.preferences',
      storage: persistentStorage,
      version: 4,
      // Older versions lack newer fields; those take their defaults.
      migrate: (persisted) =>
        ({
          dismissedAnnouncements: [],
          answerLanguage: null,
          ...(persisted as object),
        }) as unknown as PreferencesState,
    },
  ),
);
