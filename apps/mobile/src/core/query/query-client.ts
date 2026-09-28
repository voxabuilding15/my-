import { AppError } from '@studexa/shared';
import { QueryClient } from '@tanstack/react-query';

const NON_RETRYABLE = new Set([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'quota_exceeded',
]);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) =>
          !(error instanceof AppError && NON_RETRYABLE.has(error.code)) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}
