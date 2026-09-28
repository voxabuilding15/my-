import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useStaff } from '@/auth/auth-context';
import { MetricChartCard } from '@/components/metric-chart-card';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatCard,
  Table,
  Td,
} from '@/components/ui';
import { rpc, useSupabase } from '@/lib/api';
import { formatAgo, formatBytes, formatNumber } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type DocumentsStatus = {
  by_status: Record<string, number>;
  by_kind: Record<string, number>;
  stuck: number;
  recent_failures: {
    id: string;
    user_id: string;
    kind: string;
    size_bytes: number;
    error_code: string | null;
    updated_at: string;
  }[];
  jobs: { kind: string; status: string; n: number }[];
};

export function DocumentsPage() {
  const { role } = useStaff();
  const client = useSupabase();
  const queryClient = useQueryClient();
  const status = useRpc<DocumentsStatus>('admin_documents_status', {}, { refetchInterval: 30_000 });
  const retry = useMutation({
    mutationFn: (id: string) => rpc<string>(client, 'admin_retry_document', { p_document_id: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin_documents_status'] }),
  });

  return (
    <>
      <PageHeader
        title="Document processing"
        description="Extraction pipeline: uploads → queue → Cloud Run worker. Identical files are served from the extraction cache."
      />
      {status.isPending ? (
        <Spinner />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Ready"
              value={formatNumber(status.data.by_status.ready ?? 0)}
              tone="ok"
            />
            <StatCard
              label="Processing"
              value={formatNumber(status.data.by_status.processing ?? 0)}
              hint={`${status.data.stuck} stuck > 30 min`}
              tone={status.data.stuck > 0 ? 'warn' : undefined}
            />
            <StatCard
              label="Failed"
              value={formatNumber(status.data.by_status.failed ?? 0)}
              tone={(status.data.by_status.failed ?? 0) > 0 ? 'bad' : undefined}
            />
            <StatCard
              label="Awaiting upload"
              value={formatNumber(status.data.by_status.pending_upload ?? 0)}
            />
          </div>
          <Card title="Recent failures" className="mt-4">
            {status.data.recent_failures.length === 0 ? (
              <EmptyState>No failed documents.</EmptyState>
            ) : (
              <Table head={['Document', 'Type', 'Size', 'Reason', 'When', '']}>
                {status.data.recent_failures.map((d) => (
                  <tr key={d.id}>
                    <Td className="font-mono text-xs">{d.id.slice(0, 8)}</Td>
                    <Td>{d.kind}</Td>
                    <Td>{formatBytes(d.size_bytes)}</Td>
                    <Td>
                      <Badge tone="bad">{d.error_code ?? 'unknown'}</Badge>
                    </Td>
                    <Td>{formatAgo(d.updated_at)}</Td>
                    <Td className="text-right">
                      {role !== 'analyst' ? (
                        <Button
                          variant="secondary"
                          loading={retry.isPending && retry.variables === d.id}
                          onClick={() => retry.mutate(d.id)}
                        >
                          Retry
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
      {role !== 'support' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <MetricChartCard
            title="Uploads by type"
            metric="documents_uploaded"
            byDimension
            kind="bar"
          />
          <MetricChartCard title="Extracted" metric="documents_processed" byDimension kind="bar" />
          <MetricChartCard
            title="Served from cache"
            metric="documents_extraction_cached"
            byDimension
            kind="bar"
          />
          <MetricChartCard
            title="Failures by reason"
            metric="documents_failed"
            byDimension
            kind="bar"
          />
        </div>
      ) : null}
    </>
  );
}
