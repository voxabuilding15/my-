import { AppError } from '@studexa/shared';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';

/** Expected outcomes the UI already explains; reporting them would only be noise. */
const EXPECTED = new Set([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'quota_exceeded',
  'rate_limited',
  'file_too_large',
  'storage_full',
  'unsupported_file_type',
  'network',
  'invalid_credentials',
  'email_in_use',
  'email_unverified',
  'invalid_code',
  'code_expired',
  'resend_too_soon',
  'weak_password',
  'reauthentication_required',
  'sign_in_cancelled',
  'ai_unavailable',
]);

const appVersion = Constants.expoConfig?.version ?? 'unknown';
let userId: string | null = null;

export function initTelemetry(): void {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
    release: `studexa@${appVersion}`,
    // No personal data: only the opaque user id is attached.
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
  });
}

export function setTelemetryUser(id: string | null): void {
  userId = id;
  if (env.sentryDsn) Sentry.setUser(id ? { id } : null);
}

export function shouldReport(error: unknown): boolean {
  return !(error instanceof AppError && EXPECTED.has(error.code));
}

/**
 * Reports an unexpected error to Sentry (when configured) and to the internal error log that
 * the admin dashboard reads. Never throws.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!shouldReport(error)) return;
  if (env.sentryDsn) Sentry.captureException(error, { extra: context });
  if (__DEV__) console.warn('[reportError]', error, context);
  // The internal log is per user (row level security), so anonymous errors go to Sentry only.
  if (env.useMocks || !userId) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  void Promise.resolve(
    getSupabase()
      .from('error_logs')
      .insert({
        user_id: userId,
        severity: 'error',
        code: error instanceof AppError ? error.code : null,
        message: message.slice(0, 2000),
        context,
        app_version: appVersion,
        platform: Platform.OS,
      }),
  ).catch(() => undefined);
}

export const wrapRoot = Sentry.wrap;
