import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get forbidden() {
    return this.code === '42501';
  }
}

const toApiError = (error: PostgrestError | Error) =>
  new ApiError(error.message, 'code' in error ? error.code : undefined);

export function unwrap<T>({ data, error }: { data: unknown; error: PostgrestError | null }): T {
  if (error) throw toApiError(error);
  return data as T;
}

export const SupabaseContext = createContext<SupabaseClient | null>(null);

export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error('SupabaseContext missing');
  return client;
}

/** Typed RPC call that throws ApiError. */
export async function rpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return unwrap<T>(await client.rpc(fn, args));
}

/** Calls an Edge Function with the staff session and surfaces its error message. */
export async function invoke<T>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(name, { body });
  if (!error) return data as T;
  const context = (error as { context?: Response }).context;
  const payload = context ? await context.json().catch(() => null) : null;
  throw new ApiError(payload?.error?.message ?? error.message, payload?.error?.code);
}
