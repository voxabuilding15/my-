import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { AdminEnv } from '@/env';

/**
 * Staff sessions live in sessionStorage: closing the tab signs out, and nothing persists on
 * shared machines. The anon key is public; every action is authorised by the database.
 */
export function createAdminSupabase(env: AdminEnv): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
  });
}
