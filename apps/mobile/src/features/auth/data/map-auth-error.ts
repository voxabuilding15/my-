import { AppError } from '@studexa/shared';
import { AuthApiError, isAuthError } from '@supabase/supabase-js';

/**
 * End-to-end test builds only (EXPO_PUBLIC_E2E_DIAGNOSTICS=1): prints the raw error so a
 * failing emulator run shows exactly what Supabase returned. Never enabled in store builds.
 */
function logForE2e(error: unknown): void {
  if (process.env.EXPO_PUBLIC_E2E_DIAGNOSTICS !== '1') return;
  const e = error as {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
    stack?: string;
  };
  console.error(
    `[e2e-auth-error] name=${e?.name} status=${e?.status} code=${e?.code} message=${e?.message}\n${e?.stack ?? String(error)}`,
  );
}

/** Translates Supabase Auth errors (by their stable `code`) into app error codes. */
export function mapAuthError(error: unknown): AppError {
  logForE2e(error);
  if (error instanceof AppError) return error;
  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return new AppError('invalid_credentials');
      case 'user_already_exists':
      case 'email_exists':
      case 'identity_already_exists':
        return new AppError('email_in_use');
      case 'weak_password':
        return new AppError('weak_password');
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return new AppError('rate_limited');
      case 'session_not_found':
      case 'refresh_token_not_found':
        return new AppError('unauthenticated');
    }
    if (error instanceof AuthApiError && error.status === 429) return new AppError('rate_limited');
    if (error.name === 'AuthRetryableFetchError') return new AppError('network');
    return new AppError('unknown', error.message);
  }
  return new AppError('unknown', String(error));
}
