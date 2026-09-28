import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { rpc, useSupabase } from './api';

/** Query hook for an admin RPC; the key includes the arguments. */
export function useRpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
  options: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {},
) {
  const client = useSupabase();
  return useQuery<T>({ queryKey: [fn, args], queryFn: () => rpc<T>(client, fn, args), ...options });
}

export type SeriesRow = { day: string; dimension: string; value: number };

/** Daily series from the anonymous aggregates. */
export const useSeries = (metric: string, days: number, enabled = true) =>
  useRpc<SeriesRow[]>('admin_timeseries', { p_metric: metric, p_days: days }, { enabled });

export type ChartPoint = { day: string } & Record<string, number | string>;

/**
 * Pivots rows into one point per day with a key per dimension (or a single `total`), filling
 * missing days with zero so lines don't jump.
 */
export function pivotSeries(
  rows: SeriesRow[] | undefined,
  days: number,
  {
    byDimension = false,
    scale = 1,
    today = new Date(),
  }: { byDimension?: boolean; scale?: number; today?: Date } = {},
): { points: ChartPoint[]; keys: string[] } {
  const keys = byDimension
    ? [...new Set((rows ?? []).map((r) => r.dimension || 'other'))].sort()
    : ['total'];
  const points: ChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    )
      .toISOString()
      .slice(0, 10);
    const point: ChartPoint = { day };
    for (const key of keys) point[key] = 0;
    points.push(point);
  }
  const index = new Map(points.map((p) => [p.day, p]));
  for (const row of rows ?? []) {
    const point = index.get(row.day);
    if (!point) continue;
    const key = byDimension ? row.dimension || 'other' : 'total';
    point[key] = (point[key] as number) + Number(row.value) / scale;
  }
  return { points, keys };
}

export const sumSeries = (rows: SeriesRow[] | undefined, scale = 1) =>
  (rows ?? []).reduce((sum, row) => sum + Number(row.value), 0) / scale;
