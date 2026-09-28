export const APP_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'quota_exceeded',
  'rate_limited',
  'file_too_large',
  'unsupported_file_type',
  'ai_unavailable',
  'network',
  'unknown',
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

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
