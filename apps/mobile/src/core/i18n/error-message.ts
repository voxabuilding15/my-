import { AppError, type AppErrorCode } from '@studexa/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const errorCode = (error: unknown): AppErrorCode =>
  error instanceof AppError ? error.code : 'unknown';

/** Maps any thrown value to a localised, user-safe message. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string | null => (error ? t(`errors.codes.${errorCode(error)}`) : null),
    [t],
  );
}
