import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

import type { Env } from './env.ts';
import { HttpError } from './errors.ts';

export function createAdminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** Validates the caller's access token with Supabase Auth (signature, expiry, revocation). */
/**
 * The signed-in user, or null when the token is missing, invalid or expired. A failure of the
 * auth server itself (overload, network) is retried once and then reported as a temporary
 * error: answering 401 would make the app treat a healthy session as signed out.
 */
export async function getUser(
  admin: SupabaseClient,
  req: Request,
): Promise<{ user: User; token: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error) return data.user ? { user: data.user, token } : null;
    if (!isTransientAuthError(error)) return null;
    if (attempt >= 2) throw new HttpError('service_unavailable', 'Authentication is busy');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function isTransientAuthError(error: { status?: number | undefined; name?: string }): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = error.status ?? 0;
  return status === 0 || status === 429 || status >= 500;
}

/** Throws on RPC errors so failures surface as 500s instead of silently passing. */
export async function rpc<T>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} failed: ${error.message}`);
  return data as T;
}

export function rateLimit(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  return rpc<boolean>(admin, 'check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
}

/** A client acting as the caller: RLS and role checks apply exactly as for the user. */
export function createUserClient(env: Env, token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
