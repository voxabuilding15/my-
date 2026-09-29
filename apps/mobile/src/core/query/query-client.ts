import { AppError } from '@studexa/shared';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { reportError } from '@/core/telemetry';

const NON_RETRYABLE = new Set([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'quota_exceeded',
]);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // Every failed request surfaces here once; expected errors are filtered by reportError.
    queryCache: new QueryCache({
      onError: (error, query) => reportError(error, { query: String(query.queryKey[0]) }),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportError(error, { mutation: String(mutation.options.mutationKey?.[0] ?? 'mutation') }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Kept long enough to be persisted for offline use (see persistence.ts).
        gcTime: 24 * 60 * 60_000,
        retry: (failureCount, error) =>
          !(error instanceof AppError && NON_RETRYABLE.has(error.code)) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}
