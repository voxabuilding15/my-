import { useState } from 'react';

import { pivotSeries, sumSeries, useSeries } from '@/lib/queries';

import { TimeChart } from './chart';
import { Card, ErrorState, Select, Spinner } from './ui';

type Props = {
  title: string;
  metric: string;
  byDimension?: boolean;
  scale?: number;
  format?: (value: number) => string;
  kind?: 'area' | 'bar';
};

/** A chart card for one metric with a period selector and the period total. */
export function MetricChartCard({ title, metric, byDimension, scale = 1, format, kind }: Props) {
  const [days, setDays] = useState(30);
  const series = useSeries(metric, days);
  const { points, keys } = pivotSeries(series.data, days, {
    byDimension: byDimension ?? false,
    scale,
  });
  const total = sumSeries(series.data, scale);

  return (
    <Card
      title={title}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">
            {format ? format(total) : total.toLocaleString()}
          </span>
          <Select
            aria-label={`${title} period`}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 w-24"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </Select>
        </div>
      }
    >
      {series.isPending ? (
        <Spinner />
      ) : series.isError ? (
        <ErrorState error={series.error} onRetry={() => void series.refetch()} />
      ) : (
        <TimeChart
          points={points}
          keys={keys}
          {...(format ? { format } : {})}
          {...(kind ? { kind } : {})}
        />
      )}
    </Card>
  );
}
