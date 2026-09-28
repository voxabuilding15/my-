import { useQuery } from '@tanstack/react-query';
import { openBrowserAsync } from 'expo-web-browser';
import { z } from 'zod';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';

const DEFAULT_BASE_URL = 'https://voxabuilding15.github.io/my-';

const legalLinksSchema = z.object({
  privacy_url: z.url(),
  terms_url: z.url(),
  account_deletion_url: z.url(),
  support_email: z.email().nullable(),
});

export type LegalLinks = {
  privacyUrl: string;
  termsUrl: string;
  accountDeletionUrl: string;
  supportEmail: string | null;
};

export function fallbackLegalLinks(baseUrl = env.legalBaseUrl ?? DEFAULT_BASE_URL): LegalLinks {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    privacyUrl: `${base}/privacy/`,
    termsUrl: `${base}/terms/`,
    accountDeletionUrl: `${base}/delete-account/`,
    supportEmail: null,
  };
}

async function fetchLegalLinks(): Promise<LegalLinks> {
  if (env.useMocks) return fallbackLegalLinks();
  const { data, error } = await getSupabase()
    .from('app_config')
    .select('value')
    .eq('key', 'legal')
    .single();
  if (error) throw error;
  const links = legalLinksSchema.parse(data.value);
  return {
    privacyUrl: links.privacy_url,
    termsUrl: links.terms_url,
    accountDeletionUrl: links.account_deletion_url,
    supportEmail: links.support_email,
  };
}

/**
 * Legal links come from server config (`app_config.legal`), so moving to a custom domain needs
 * no app release. The bundled fallback is used offline or before the first fetch.
 */
export function useLegalLinks(): LegalLinks {
  const { data } = useQuery({
    queryKey: ['app-config', 'legal'],
    queryFn: fetchLegalLinks,
    staleTime: 24 * 60 * 60 * 1000,
  });
  return data ?? fallbackLegalLinks();
}

export function openLegalPage(url: string): Promise<unknown> {
  return openBrowserAsync(url);
}
