import type { AppErrorCode } from '@studexa/shared';

const STATUS: Partial<Record<AppErrorCode, number>> = {
  unauthenticated: 401,
  reauthentication_required: 401,
  forbidden: 403,
  email_unverified: 403,
  not_found: 404,
  validation_failed: 400,
  weak_password: 400,
  invalid_code: 400,
  code_expired: 400,
  quota_exceeded: 402,
  storage_full: 402,
  file_too_large: 413,
  unsupported_file_type: 415,
  rate_limited: 429,
  resend_too_soon: 429,
};

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class HttpError extends Error {
  readonly status: number;

  constructor(
    readonly code: AppErrorCode,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code] ?? 500;
  }
}
