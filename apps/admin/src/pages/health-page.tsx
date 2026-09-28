import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatCard,
  Table,
  Td,
} from '@/components/ui';
import { formatAgo, formatBytes, formatNumber, formatUsd } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type Health = {
  checked_at: string;
  jobs: { kind: string; status: string; n: number; oldest_queued_seconds: number | null }[];
  services: {
    service: string;
    instance: string;
    version: string | null;
    last_seen: string;
    healthy: boolean;
    details: Record<string, unknown>;
  }[];
  errors_last_hour: number;
  fatal_last_hour: number;
  ai_enabled: boolean | null;
  ai_spend_today_usd: number;
  ai_budget_usd: number | null;
  last_maintenance: string | null;
  database_bytes: number;
};

export function HealthPage() {
  const health = useRpc<Health>('admin_system_health', {}, { refetchInterval: 30_000 });
  if (health.isPending) return <Spinner />;
  if (health.isError)
    return <ErrorState error={health.error} onRetry={() => void health.refetch()} />;
  const h = health.data;
  const backlog = h.jobs
    .filter((j) => j.status === 'queued')
    .reduce((max, j) => Math.max(max, j.oldest_queued_seconds ?? 0), 0);
  const budgetUsed = h.ai_budget_usd ? h.ai_spend_today_usd / Number(h.ai_budget_usd) : 0;

  return (
    <>
      <PageHeader
        title="System health"
        description={`Checked ${formatAgo(h.checked_at)} · refreshes every 30 seconds`}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="AI"
          value={h.ai_enabled === false ? 'Disabled' : 'Enabled'}
          tone={h.ai_enabled === false ? 'bad' : 'ok'}
        />
        <StatCard
          label="AI budget today"
          value={`${Math.round(budgetUsed * 100)}%`}
          hint={`${formatUsd(h.ai_spend_today_usd)} of ${formatUsd(Number(h.ai_budget_usd ?? 0))}`}
          tone={budgetUsed > 0.9 ? 'bad' : budgetUsed > 0.7 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Errors (1h)"
          value={formatNumber(h.errors_last_hour)}
          hint={`${h.fatal_last_hour} fatal`}
          tone={h.fatal_last_hour > 0 ? 'bad' : undefined}
        />
        <StatCard
          label="Oldest queued job"
          value={backlog ? `${Math.round(backlog / 60)} min` : '—'}
          tone={backlog > 600 ? 'bad' : backlog > 120 ? 'warn' : 'ok'}
        />
        <StatCard label="Database" value={formatBytes(h.database_bytes)} />
        <StatCard
          label="Maintenance"
          value={formatAgo(typeof h.last_maintenance === 'string' ? h.last_maintenance : null)}
          tone={!h.last_maintenance ? 'warn' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Services">
          {h.services.length === 0 ? (
            <EmptyState>No worker has reported in the last day.</EmptyState>
          ) : (
            <Table head={['Service', 'Instance', 'Version', 'Last seen', 'Status']}>
              {h.services.map((s) => (
                <tr key={`${s.service}:${s.instance}`}>
                  <Td>{s.service}</Td>
                  <Td className="font-mono text-xs">{s.instance}</Td>
                  <Td>{s.version ?? '—'}</Td>
                  <Td>{formatAgo(s.last_seen)}</Td>
                  <Td>
                    {s.healthy ? (
                      <Badge tone="ok">healthy</Badge>
                    ) : (
                      <Badge tone="warn">stale</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Job queues">
          {h.jobs.length === 0 ? (
            <EmptyState>Queues are empty.</EmptyState>
          ) : (
            <Table head={['Queue', 'State', 'Jobs', 'Oldest waiting']}>
              {h.jobs.map((j) => (
                <tr key={`${j.kind}:${j.status}`}>
                  <Td>{j.kind}</Td>
                  <Td>
                    <Badge
                      tone={
                        j.status === 'dead' ? 'bad' : j.status === 'running' ? 'brand' : 'neutral'
                      }
                    >
                      {j.status}
                    </Badge>
                  </Td>
                  <Td className="tabular-nums">{formatNumber(j.n)}</Td>
                  <Td>
                    {j.oldest_queued_seconds
                      ? `${Math.round(j.oldest_queued_seconds / 60)} min`
                      : '—'}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
