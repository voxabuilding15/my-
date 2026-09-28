import type { AppLocale } from '@studexa/shared';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';

type Localized = Partial<Record<AppLocale, string>> & { en: string };

export type Announcement = {
  id: string;
  title: Localized;
  body: Localized;
  cta_label: Localized | null;
  cta_url: string | null;
  dismissible: boolean;
  priority: number;
};

export type ClientConfig = {
  flags: Record<string, boolean>;
  config: Record<string, unknown>;
  announcements: Announcement[];
};

/** Used offline and in demo mode: everything on, nothing announced. */
export const DEFAULT_CLIENT_CONFIG: ClientConfig = { flags: {}, config: {}, announcements: [] };

export async function fetchClientConfig(): Promise<ClientConfig> {
  if (env.useMocks) return DEFAULT_CLIENT_CONFIG;
  const { data, error } = await getSupabase().rpc('get_client_config', {
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_app_version: Constants.expoConfig?.version ?? '0.0.0',
  });
  if (error) throw error;
  return data as ClientConfig;
}

/** Flags, public config and announcements: one request, refreshed every 15 minutes. */
export function useClientConfig() {
  return useQuery({
    queryKey: ['client-config'],
    queryFn: fetchClientConfig,
    staleTime: 15 * 60_000,
    placeholderData: DEFAULT_CLIENT_CONFIG,
  });
}

/**
 * Remote kill switch / gradual rollout. Unknown flags and failed loads fall back to
 * `fallback` (on by default), so a config outage never removes features.
 */
export function useFeatureFlag(key: string, fallback = true): boolean {
  const { data } = useClientConfig();
  return data?.flags[key] ?? fallback;
}

export const localize = (text: Localized, locale: string): string =>
  text[locale as AppLocale] ?? text.en;
