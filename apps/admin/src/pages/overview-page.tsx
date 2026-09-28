import { useStaff } from '@/auth/auth-context';
import { MetricChartCard } from '@/components/metric-chart-card';
import { ErrorState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { formatNumber, formatUsd } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type Overview = {
  users_total: number;
  signups_7d: number;
  active_users_today: number;
  active_users_7d_avg: number;
  premium_active: number;
  ai_requests_today: number;
  ai_cost_today_usd: number;
  ai_cost_30d_usd: number;
  revenue_30d_usd: number;
  errors_24h: number;
  documents_processing: number;
  documents_failed_7d: number;
  jobs_queued: number;
  jobs_dead: number;
};

export function OverviewPage() {
  const { role } = useStaff();
  const overview = useRpc<Overview>('admin_overview', {}, { refetchInterval: 60_000 });
  const analytics = role !== 'support';

  return (
    <>
      <PageHeader
        title="Overview"
        description="Key numbers across the product, refreshed every minute."
      />
      {overview.isPending ? (
        <Spinner />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <StatCard
            label="Users"
            value={formatNumber(overview.data.users_total)}
            hint={`+${formatNumber(overview.data.signups_7d)} in 7 days`}
          />
          <StatCard
            label="Active today"
            value={formatNumber(overview.data.active_users_today)}
            hint={`${formatNumber(overview.data.active_users_7d_avg)} daily average (7d)`}
          />
          <StatCard
            label="Premium"
            value={formatNumber(overview.data.premium_active)}
            hint={`${((overview.data.premium_active / Math.max(1, overview.data.users_total)) * 100).toFixed(1)}% of users`}
          />
          <StatCard label="Revenue (30d)" value={formatUsd(overview.data.revenue_30d_usd)} />
          <StatCard
            label="AI requests today"
            value={formatNumber(overview.data.ai_requests_today)}
          />
          <StatCard
            label="AI cost"
            value={formatUsd(overview.data.ai_cost_today_usd)}
            hint={`${formatUsd(overview.data.ai_cost_30d_usd)} in 30 days`}
          />
          <StatCard
            label="Errors (24h)"
            value={formatNumber(overview.data.errors_24h)}
            tone={overview.data.errors_24h > 100 ? 'warn' : undefined}
          />
          <StatCard
            label="Processing queue"
            value={formatNumber(overview.data.jobs_queued)}
            hint={`${formatNumber(overview.data.documents_processing)} documents · ${formatNumber(overview.data.jobs_dead)} dead jobs (7d)`}
            tone={overview.data.jobs_dead > 0 ? 'bad' : undefined}
          />
        </div>
      )}
      {analytics ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <MetricChartCard title="Sign-ups" metric="signups" kind="bar" />
          <MetricChartCard title="Active users" metric="active_users" />
        </div>
      ) : null}
    </>
  );
}
