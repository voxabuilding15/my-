export const APP_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'quota_exceeded',
  'rate_limited',
  'file_too_large',
  'storage_full',
  'unsupported_file_type',
  'ai_unavailable',
  'ai_declined',
  'document_not_ready',
  'network',
  'unknown',
  // Authentication
  'invalid_credentials',
  'email_in_use',
  'email_unverified',
  'invalid_code',
  'code_expired',
  'resend_too_soon',
  'weak_password',
  'reauthentication_required',
  'sign_in_cancelled',
  'play_services_unavailable',
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

/** Error body returned by every Edge Function. */
export type ApiErrorBody = {
  error: { code: AppErrorCode; message: string; details?: Record<string, unknown> };
};

export const isAppErrorCode = (value: unknown): value is AppErrorCode =>
  typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value);

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
