import type { SupabaseClient } from '@supabase/supabase-js';

type Response = { data: unknown; error: { message: string; code?: string } | null };
export type Call = { target: string; chain: [string, unknown[]][] };

/**
 * A minimal stand-in for the Supabase client: every query builder chain records its calls and
 * resolves to the next response queued for that table or RPC.
 */
export function createFakeSupabase(responses: Record<string, Response[]>, userId = 'user-1') {
  const calls: Call[] = [];
  const next = (target: string): Response =>
    responses[target]?.shift() ?? { data: null, error: { message: `no response for ${target}` } };

  const builder = (target: string, initial: [string, unknown[]][]) => {
    const call: Call = { target, chain: initial };
    calls.push(call);
    const proxy: object = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = next(target);
            return (resolve: (value: Response) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.chain.push([prop, args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const client = {
    from: (table: string) => builder(table, []),
    rpc: (fn: string, args?: unknown) => builder(`rpc:${fn}`, [['rpc', [args]]]),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userId } } } }),
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}
