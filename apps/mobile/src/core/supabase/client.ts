import 'react-native-url-polyfill/auto';

import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from '@/core/config/env';
import { secureSessionStorage } from '@/core/storage/secure-session-storage';

let client: SupabaseClient | null = null;

/** The Supabase client. Only valid outside mock mode. */
export function getSupabase(): SupabaseClient {
  if (env.useMocks || !env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase is not configured (mock mode)');
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    });
    const supabase = client;
    // Refresh tokens only while in the foreground; resume immediately when the app returns.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
  }
  return client;
}
