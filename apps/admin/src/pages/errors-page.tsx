import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
} from '@/components/ui';
import { rpc, useSupabase } from '@/lib/api';
import { formatAgo, formatDate, formatNumber } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type ErrorGroup = {
  code: string;
  source: string;
  occurrences: number;
  users: number;
  last_seen: string;
  sample_message: string;
};
type ErrorRow = {
  id: number;
  user_id: string | null;
  source: string;
  severity: string;
  code: string | null;
  message: string;
  context: Record<string, unknown>;
  app_version: string | null;
  platform: string | null;
  created_at: string;
};

const SEVERITY_TONE: Record<string, 'neutral' | 'warn' | 'bad'> = {
  info: 'neutral',
  warning: 'warn',
  error: 'bad',
  fatal: 'bad',
};

export function ErrorsPage() {
  const client = useSupabase();
  const [hours, setHours] = useState(24);
  const [source, setSource] = useState('');
  const [severity, setSeverity] = useState('');
  const [code, setCode] = useState('');
  const groups = useRpc<ErrorGroup[]>('admin_error_groups', { p_hours: hours });
  const filters = {
    p_source: source || null,
    p_severity: severity || null,
    p_code: code.trim() || null,
  };
  const list = useInfiniteQuery({
    queryKey: ['admin_list_errors', filters],
    queryFn: ({ pageParam }) =>
      rpc<ErrorRow[]>(client, 'admin_list_errors', {
        ...filters,
        p_before_id: pageParam,
        p_limit: 50,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === 50 ? (last.at(-1)?.id ?? null) : null),
  });
  const rows = list.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Errors"
        description="Internal error log from the app, Edge Functions and workers. Crash details with stack traces are in Sentry."
      />
      <Card
        title="Top errors"
        actions={
          <Select
            aria-label="Window"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="h-8 w-28"
          >
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
          </Select>
        }
      >
        {groups.isPending ? (
          <Spinner />
        ) : groups.isError ? (
          <ErrorState error={groups.error} />
        ) : groups.data.length === 0 ? (
          <EmptyState>No errors in this window.</EmptyState>
        ) : (
          <Table head={['Code', 'Source', 'Occurrences', 'Users', 'Last seen', 'Latest message']}>
            {groups.data.map((g) => (
              <tr
                key={`${g.code}:${g.source}`}
                className="cursor-pointer hover:bg-canvas"
                onClick={() => setCode(g.code === '(none)' ? '' : g.code)}
              >
                <Td className="font-mono text-xs">{g.code}</Td>
                <Td>{g.source}</Td>
                <Td className="tabular-nums">{formatNumber(g.occurrences)}</Td>
                <Td className="tabular-nums">{formatNumber(g.users)}</Td>
                <Td>{formatAgo(g.last_seen)}</Td>
                <Td className="max-w-md truncate text-muted">{g.sample_message}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Error log" className="mt-4">
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="mobile">App</option>
            <option value="edge_function">Edge Functions</option>
            <option value="worker">Workers</option>
            <option value="admin">Admin</option>
          </Select>
          <Select
            aria-label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            <option value="fatal">Fatal</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>
          <Input
            aria-label="Code"
            placeholder="Error code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} />
        ) : rows.length === 0 ? (
          <EmptyState>No matching errors.</EmptyState>
        ) : (
          <>
            <Table head={['Time', 'Severity', 'Source', 'Code', 'Message', 'User', 'App']}>
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDate(e.created_at)}</Td>
                  <Td>
                    <Badge tone={SEVERITY_TONE[e.severity] ?? 'neutral'}>{e.severity}</Badge>
                  </Td>
                  <Td>{e.source}</Td>
                  <Td className="font-mono text-xs">{e.code ?? '—'}</Td>
                  <Td className="max-w-lg break-words">{e.message}</Td>
                  <Td>
                    {e.user_id ? (
                      <Link className="text-brand hover:underline" to={`/users/${e.user_id}`}>
                        view
                      </Link>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {[e.platform, e.app_version].filter(Boolean).join(' ') || '—'}
                  </Td>
                </tr>
              ))}
            </Table>
            {list.hasNextPage ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="secondary"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
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
