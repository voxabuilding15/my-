import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';

import type { AuthRepository } from '../domain/auth-repository';
import type { AuthUser } from '../domain/auth-user';
import { MockAuthRepository } from '../data/mock-auth-repository';
import { SupabaseAuthRepository } from '../data/supabase-auth-repository';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signed_out'; user: null }
  | { status: 'signed_in'; user: AuthUser };

type AuthContextValue = AuthState & {
  repository: AuthRepository;
  /** Most recent signed-in user; survives the render in which sign-out happens. */
  lastUser: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function createAuthRepository(): AuthRepository {
  return env.useMocks ? new MockAuthRepository() : new SupabaseAuthRepository(getSupabase());
}

const toState = (user: AuthUser | null): AuthState =>
  user ? { status: 'signed_in', user } : { status: 'signed_out', user: null };

/** Restores the persisted session on launch and tracks auth changes for the whole app. */
export function AuthProvider({
  repository: injected,
  children,
}: PropsWithChildren<{ repository?: AuthRepository }>) {
  const [repository] = useState(() => injected ?? createAuthRepository());
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [lastUser, setLastUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    const apply = (user: AuthUser | null) => {
      if (!active) return;
      setState(toState(user));
      if (user) setLastUser(user);
    };
    const unsubscribe = repository.onAuthStateChange(apply);
    repository
      .getCurrentUser()
      .then(apply)
      .catch(() => apply(null));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return (
    <AuthContext.Provider value={{ ...state, repository, lastUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/**
 * The signed-in user, for screens behind the signed-in guard. During sign-out those screens
 * render once more before the guard unmounts them, so the last known user is returned then.
 */
export function useCurrentUser(): AuthUser {
  const { user, lastUser } = useAuth();
  const current = user ?? lastUser;
  if (!current) throw new Error('useCurrentUser requires a signed-in user');
  return current;
}
