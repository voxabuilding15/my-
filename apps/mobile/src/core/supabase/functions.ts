import { type ApiErrorBody, AppError, isAppErrorCode } from '@studexa/shared';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { getSupabase } from './client';

/** Calls an Edge Function and converts its error body into an AppError. */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (!error) return data as T;

  if (error instanceof FunctionsHttpError) {
    const payload = (await (error.context as Response)
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    const code = payload?.error.code;
    throw new AppError(
      isAppErrorCode(code) ? code : 'unknown',
      payload?.error.message,
      payload?.error.details,
    );
  }
  if (error instanceof FunctionsFetchError) throw new AppError('network', error.message);
  throw new AppError('unknown', error.message);
}
