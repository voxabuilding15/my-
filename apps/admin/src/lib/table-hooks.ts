import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { unwrap, useSupabase } from './api';

/** Reads a table the staff member may see (row level security decides). */
export function useTable<T>(
  table: string,
  columns = '*',
  order?: { column: string; ascending?: boolean },
) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['table', table, columns, order],
    queryFn: async () => {
      let query = client.from(table).select(columns).limit(500);
      if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
      return unwrap<T[]>(await query);
    },
  });
}

/** Insert / update / delete on a table, refreshing its queries afterwards. */
export function useTableMutation(table: string) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { kind: 'insert'; values: Record<string, unknown> }
        | { kind: 'update'; match: Record<string, unknown>; values: Record<string, unknown> }
        | { kind: 'delete'; match: Record<string, unknown> },
    ) => {
      if (op.kind === 'insert') return unwrap(await client.from(table).insert(op.values));
      if (op.kind === 'update') {
        // RLS turns an unauthorised update into "0 rows"; select the result to detect that.
        const rows = unwrap<unknown[]>(
          await client.from(table).update(op.values).match(op.match).select(),
        );
        if (rows.length === 0) throw new Error('Not saved: your role cannot change this.');
        return rows;
      }
      return unwrap(await client.from(table).delete().match(op.match));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['table', table] }),
  });
}
