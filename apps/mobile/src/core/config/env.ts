import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
);

const envSchema = z.object({
  supabaseUrl: optionalString.pipe(z.url().optional()),
  supabaseAnonKey: optionalString,
  googleWebClientId: optionalString,
  googleIosClientId: optionalString,
  legalBaseUrl: optionalString.pipe(z.url().optional()),
  revenueCatAndroidKey: optionalString,
  forceMocks: optionalString.transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema> & { useMocks: boolean };

export function parseEnv(raw: Record<keyof z.input<typeof envSchema>, string | undefined>): Env {
  const parsed = envSchema.parse(raw);
  const hasBackend = Boolean(parsed.supabaseUrl && parsed.supabaseAnonKey);
  return { ...parsed, useMocks: parsed.forceMocks || !hasBackend };
}

// Expo inlines EXPO_PUBLIC_* only when accessed statically, so each key is spelled out.
export const env: Env = parseEnv({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  legalBaseUrl: process.env.EXPO_PUBLIC_LEGAL_BASE_URL,
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  forceMocks: process.env.EXPO_PUBLIC_USE_MOCKS,
});
