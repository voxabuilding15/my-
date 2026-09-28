import { AppError } from '@studexa/shared';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

/** Converts a PostgREST/RPC error into an AppError the UI knows how to show. */
export function toAppError(error: PostgrestError | Error): AppError {
  const code = 'code' in error ? error.code : undefined;
  if (code === 'PGRST116' || code === 'P0002') return new AppError('not_found', error.message);
  if (code === '42501') return new AppError('forbidden', error.message);
  if (/network|fetch failed|timed? ?out/i.test(error.message)) {
    return new AppError('network', error.message);
  }
  return new AppError('unknown', error.message);
}

/** Unwraps a Supabase response, throwing an AppError on failure. */
export function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) throw toAppError(error);
  return data as T;
}

/** For writes: throws on error, ignores the (empty) payload. */
export function check({ error }: { error: PostgrestError | null }): void {
  if (error) throw toAppError(error);
}

/** The signed-in user's id from the local session (no network round trip). */
export async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('unauthenticated');
  return id;
}
