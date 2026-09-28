import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { rpc, useSupabase } from '@/lib/api';

export type StaffRole = 'admin' | 'support' | 'analyst';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  /** Password accepted; a TOTP factor must be set up (first sign-in). */
  | { status: 'needs_enrollment'; user: User }
  /** Password accepted; the authenticator code is required. */
  | { status: 'needs_challenge'; user: User; factorId: string }
  | { status: 'no_access'; user: User }
  | { status: 'ready'; user: User; role: StaffRole };

type AuthContextValue = AuthState & { refresh: () => Promise<void>; signOut: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Staff access = staff role + a two-factor (aal2) session. The database enforces the same rule
 * on every admin function, so this is only the user-facing half.
 */
export async function resolveAuthState(client: SupabaseClient): Promise<AuthState> {
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { status: 'signed_out' };

  const role = await rpc<StaffRole | null>(client, 'staff_role');
  if (role) return { status: 'ready', user, role };

  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') return { status: 'no_access', user };

  const { data: factors } = await client.auth.mfa.listFactors();
  const verified = factors?.totp.find((factor) => factor.status === 'verified');
  return verified
    ? { status: 'needs_challenge', user, factorId: verified.id }
    : { status: 'needs_enrollment', user };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const client = useSupabase();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(
    () =>
      resolveAuthState(client)
        .then(setState)
        .catch(() => setState({ status: 'signed_out' })),
    [client],
  );

  useEffect(() => {
    resolveAuthState(client)
      .then(setState)
      .catch(() => setState({ status: 'signed_out' }));
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'MFA_CHALLENGE_VERIFIED') {
        // Defer: calling Supabase inside the callback can deadlock its auth lock.
        setTimeout(() => void refresh(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client, refresh]);

  const signOut = useCallback(async () => {
    await client.auth.signOut();
    setState({ status: 'signed_out' });
  }, [client]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** For pages behind the staff gate. */
export function useStaff(): { user: User; role: StaffRole } {
  const auth = useAuth();
  if (auth.status !== 'ready') throw new Error('useStaff requires a signed-in staff member');
  return { user: auth.user, role: auth.role };
}
