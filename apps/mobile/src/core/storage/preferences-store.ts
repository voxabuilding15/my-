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
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: AppLocale | null) => void;
  completeOnboarding: () => void;
  setDailyGoal: (minutes: number) => void;
  setReminder: (reminder: ReminderSettings) => void;
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
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      setDailyGoal: (dailyGoalMinutes) => set({ dailyGoalMinutes }),
      setReminder: (reminder) => set({ reminder }),
    }),
    {
      name: 'studexa.preferences',
      storage: persistentStorage,
      version: 2,
      // v1 had only theme and locale; new fields take their defaults.
      migrate: (persisted) => persisted as PreferencesState,
    },
  ),
);
