import { MetricChartCard } from '@/components/metric-chart-card';
import { Card, ErrorState, PageHeader, Spinner, StatCard, Table, Td } from '@/components/ui';
import { formatNumber, formatUsd } from '@/lib/format';
import { sumSeries, useRpc, useSeries } from '@/lib/queries';

const usd = (value: number) => formatUsd(value);

type SubscriptionsSummary = {
  by_status: Record<string, number>;
  by_product: Record<string, number>;
  started_30d: number;
  trials_30d: number;
  cancelled_30d: number;
  expired_30d: number;
  revenue_30d_usd: number;
};

export function SubscriptionsPage() {
  const summary = useRpc<SubscriptionsSummary>('admin_subscriptions_summary');
  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Premium subscribers from Google Play via RevenueCat, plus manual grants."
      />
      {summary.isPending ? (
        <Spinner />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Active"
              value={formatNumber(
                Object.values(summary.data.by_product).reduce((a, b) => a + b, 0),
              )}
            />
            <StatCard label="Started (30d)" value={formatNumber(summary.data.started_30d)} />
            <StatCard label="Trials (30d)" value={formatNumber(summary.data.trials_30d)} />
            <StatCard
              label="Cancelled (30d)"
              value={formatNumber(summary.data.cancelled_30d)}
              tone={summary.data.cancelled_30d > summary.data.started_30d ? 'warn' : undefined}
            />
            <StatCard label="Expired (30d)" value={formatNumber(summary.data.expired_30d)} />
            <StatCard label="Revenue (30d)" value={formatUsd(summary.data.revenue_30d_usd)} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Active by product">
              <Table head={['Product', 'Subscribers']}>
                {Object.entries(summary.data.by_product).map(([product, n]) => (
                  <tr key={product}>
                    <Td>{product}</Td>
                    <Td className="tabular-nums">{formatNumber(n)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Premium by status">
              <Table head={['Status', 'Accounts']}>
                {Object.entries(summary.data.by_status).map(([status, n]) => (
                  <tr key={status}>
                    <Td>{status}</Td>
                    <Td className="tabular-nums">{formatNumber(n)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <MetricChartCard
          title="New subscriptions"
          metric="subscriptions_started"
          byDimension
          kind="bar"
        />
        <MetricChartCard title="Trials started" metric="trials_started" byDimension kind="bar" />
        <MetricChartCard
          title="Cancellations by reason"
          metric="subscriptions_cancelled"
          byDimension
          kind="bar"
        />
        <MetricChartCard title="Renewals" metric="subscriptions_renewed" byDimension kind="bar" />
      </div>
    </>
  );
}

export function RevenuePage() {
  const revenue = useSeries('revenue_usd_micros', 365);
  const byProduct = new Map<string, number>();
  for (const row of revenue.data ?? [])
    byProduct.set(row.dimension, (byProduct.get(row.dimension) ?? 0) + Number(row.value) / 1e6);
  return (
    <>
      <PageHeader
        title="Revenue"
        description="Gross revenue reported by the store (USD, before store fees and taxes; refunds are negative)."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Last 12 months" value={formatUsd(sumSeries(revenue.data, 1e6))} />
        <StatCard label="Products" value={formatNumber(byProduct.size)} />
        <StatCard label="Monthly average" value={formatUsd(sumSeries(revenue.data, 1e6) / 12)} />
      </div>
      <div className="mt-4 grid gap-4">
        <MetricChartCard
          title="Revenue by product"
          metric="revenue_usd_micros"
          byDimension
          scale={1e6}
          format={usd}
          kind="bar"
        />
        <Card title="By product (12 months)">
          <Table head={['Product', 'Revenue']}>
            {[...byProduct.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([product, value]) => (
                <tr key={product}>
                  <Td>{product}</Td>
                  <Td className="tabular-nums">{formatUsd(value)}</Td>
                </tr>
              ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

export function AiUsagePage() {
  return (
    <>
      <PageHeader
        title="AI usage"
        description="Requests, tokens and estimated cost per model. The daily budget and kill switch are in Remote config."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <MetricChartCard title="Requests by feature" metric="ai_requests" byDimension kind="bar" />
        <MetricChartCard
          title="Estimated cost by model"
          metric="ai_cost_micros"
          byDimension
          scale={1e6}
          format={usd}
          kind="bar"
        />
        <MetricChartCard title="Requests by plan" metric="ai_requests_by_tier" byDimension />
        <MetricChartCard title="Failures by feature" metric="ai_failures" byDimension kind="bar" />
        <MetricChartCard title="Input tokens" metric="ai_input_tokens" byDimension />
        <MetricChartCard title="Cached input tokens" metric="ai_cached_input_tokens" byDimension />
      </div>
    </>
  );
}

export function EngagementPage() {
  return (
    <>
      <PageHeader
        title="Engagement"
        description="Anonymous daily aggregates: no individual user is identifiable here."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <MetricChartCard title="Active users" metric="active_users" />
        <MetricChartCard title="Sign-ups" metric="signups" kind="bar" />
        <MetricChartCard title="Flashcards reviewed" metric="cards_reviewed" kind="bar" />
        <MetricChartCard title="Quizzes completed" metric="quizzes_completed" kind="bar" />
        <MetricChartCard
          title="Documents uploaded"
          metric="documents_uploaded"
          byDimension
          kind="bar"
        />
        <MetricChartCard title="Accounts deleted" metric="accounts_deleted" kind="bar" />
      </div>
    </>
  );
}
