import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
} from '@/components/ui';
import { unwrap, useSupabase } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useTable, useTableMutation } from '@/lib/table-hooks';

type Report = {
  id: string;
  content_snapshot: string | null;
  model: string | null;
  target_type: string;
  target_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export function ReportsPage() {
  const [status, setStatus] = useState('open');
  const reports = useTable<Report>(
    'content_reports',
    // The reporter is deliberately not selected: reviews are anonymous.
    'id, target_type, target_id, reason, details, content_snapshot, model, status, created_at, resolved_at',
    { column: 'created_at', ascending: false },
  );
  const mutation = useTableMutation('content_reports');
  const rows = (reports.data ?? []).filter((r) => !status || r.status === status);

  const resolve = (id: string, next: string) =>
    mutation.mutate({
      kind: 'update',
      match: { id },
      values: {
        status: next,
        resolved_at: next === 'resolved' || next === 'dismissed' ? new Date().toISOString() : null,
      },
    });

  return (
    <>
      <PageHeader
        title="Reports"
        description="AI answers users flagged as incorrect, harmful or offensive, with the reported text and model. Reporters are not shown."
      />
      <Card
        actions={
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 w-36"
          >
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="">All</option>
          </Select>
        }
      >
        {reports.isPending ? (
          <Spinner />
        ) : reports.isError ? (
          <ErrorState error={reports.error} />
        ) : rows.length === 0 ? (
          <EmptyState>Nothing to review.</EmptyState>
        ) : (
          <Table head={['Reported', 'Content', 'Reason', 'Details', 'Status', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(r.created_at)}</Td>
                <Td className="max-w-lg">
                  <div className="text-xs text-muted">
                    {r.target_type === 'message'
                      ? 'Chat answer'
                      : r.target_type === 'ai_output'
                        ? 'AI tool result'
                        : r.target_type}
                    {r.model ? ` · ${r.model}` : ''}
                  </div>
                  {r.content_snapshot ? (
                    <details>
                      <summary className="cursor-pointer line-clamp-2 break-words">
                        {r.content_snapshot.slice(0, 200)}
                      </summary>
                      <pre className="mt-2 max-h-80 overflow-auto rounded bg-canvas p-2 text-xs whitespace-pre-wrap">
                        {r.content_snapshot}
                      </pre>
                    </details>
                  ) : (
                    <span className="font-mono text-xs text-muted">
                      {r.target_id?.slice(0, 8) ?? '—'}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone={r.reason === 'harmful' || r.reason === 'offensive' ? 'bad' : 'warn'}>
                    {r.reason}
                  </Badge>
                </Td>
                <Td className="max-w-md break-words">{r.details ?? '—'}</Td>
                <Td>{r.status}</Td>
                <Td className="text-right whitespace-nowrap">
                  {r.status === 'open' ? (
                    <Button variant="ghost" onClick={() => resolve(r.id, 'reviewing')}>
                      Review
                    </Button>
                  ) : null}
                  {r.status === 'open' || r.status === 'reviewing' ? (
                    <>
                      <Button variant="ghost" onClick={() => resolve(r.id, 'resolved')}>
                        Resolve
                      </Button>
                      <Button variant="ghost" onClick={() => resolve(r.id, 'dismissed')}>
                        Dismiss
                      </Button>
                    </>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

type AuditRow = {
  id: number;
  admin_id: string | null;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  created_at: string;
};

export function AuditPage() {
  const client = useSupabase();
  const audit = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: async ({ pageParam }) => {
      let query = client
        .from('admin_audit_log')
        .select('*')
        .order('id', { ascending: false })
        .limit(50);
      if (pageParam) query = query.lt('id', pageParam);
      return unwrap<AuditRow[]>(await query);
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === 50 ? (last.at(-1)?.id ?? null) : null),
  });
  const rows = audit.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made by staff: plan limits, config, flags, announcements, roles, plans and account actions."
      />
      <Card>
        {audit.isPending ? (
          <Spinner />
        ) : audit.isError ? (
          <ErrorState error={audit.error} />
        ) : rows.length === 0 ? (
          <EmptyState>No staff actions yet.</EmptyState>
        ) : (
          <>
            <Table head={['Time', 'Staff', 'Action', 'Target', 'Change']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDate(r.created_at)}</Td>
                  <Td className="font-mono text-xs">{r.admin_id?.slice(0, 8) ?? 'deleted'}</Td>
                  <Td>
                    <Badge tone="brand">{r.action}</Badge>
                  </Td>
                  <Td className="font-mono text-xs">{r.target}</Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-xs text-muted">show</summary>
                      <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-canvas p-2 text-xs">
                        {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
                      </pre>
                    </details>
                  </Td>
                </tr>
              ))}
            </Table>
            {audit.hasNextPage ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="secondary"
                  loading={audit.isFetchingNextPage}
                  onClick={() => void audit.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
