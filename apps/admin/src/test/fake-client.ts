import type { SupabaseClient } from '@supabase/supabase-js';

type Result = { data: unknown; error: { message: string; code?: string } | null };
export type Recorded = { target: string; chain: [string, unknown[]][] };

export type FakeOptions = {
  session?: { user: { id: string; email: string } } | null;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  tables?: Record<string, unknown[]>;
  aal?: 'aal1' | 'aal2';
  factors?: { id: string; status: 'verified' | 'unverified' }[];
};

/** Just enough of supabase-js for the dashboard: auth/MFA, RPCs and chained table queries. */
export function createFakeClient(options: FakeOptions = {}) {
  const calls: Recorded[] = [];
  const builder = (target: string, resolve: () => Result) => {
    const record: Recorded = { target, chain: [] };
    calls.push(record);
    const proxy: object = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (done: (r: Result) => void) => done(resolve());
          return (...args: unknown[]) => {
            record.chain.push([prop, args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.session ?? null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: options.aal ?? 'aal1', nextLevel: 'aal2' },
        }),
        listFactors: async () => ({
          data: { totp: options.factors ?? [], all: options.factors ?? [] },
        }),
        challengeAndVerify: async () => ({ error: null }),
        enroll: async () => ({
          data: { id: 'f1', totp: { qr_code: 'data:image/svg+xml,', secret: 'SECRET', uri: '' } },
          error: null,
        }),
        unenroll: async () => ({ error: null }),
      },
    },
    rpc: (fn: string, args: Record<string, unknown> = {}) =>
      builder(`rpc:${fn}`, () => {
        const handler = options.rpc?.[fn];
        return handler
          ? { data: handler(args), error: null }
          : { data: null, error: { message: `unexpected rpc ${fn}` } };
      }),
    from: (table: string) =>
      builder(table, () => ({ data: options.tables?.[table] ?? [], error: null })),
    functions: { invoke: async () => ({ data: {}, error: null }) },
  } as unknown as SupabaseClient;

  return { client, calls };
}
