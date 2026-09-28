import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ChartPoint } from '@/lib/queries';

const PALETTE: readonly string[] = [
  '#0066ff',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

const color = (i: number) => PALETTE[i % PALETTE.length] ?? '#0066ff';

type Props = {
  points: ChartPoint[];
  keys: string[];
  kind?: 'area' | 'bar';
  format?: (value: number) => string;
  height?: number;
};

/** Daily chart; stacked when there are several dimensions. */
export function TimeChart({
  points,
  keys,
  kind = 'area',
  format = (v) => String(v),
  height = 240,
}: Props) {
  const axis = { stroke: 'var(--color-muted)', fontSize: 11, tickLine: false, axisLine: false };
  const tooltip = (
    <Tooltip
      formatter={(value) => format(Number(value))}
      contentStyle={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        borderRadius: 8,
        fontSize: 12,
      }}
    />
  );
  const common = { data: points, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const xAxis = (
    <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} minTickGap={24} {...axis} />
  );
  const yAxis = <YAxis width={56} tickFormatter={(v: number) => format(v)} {...axis} />;
  const grid = <CartesianGrid vertical={false} stroke="var(--color-line)" />;
  const legend = keys.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null;

  return (
    <div style={{ height }} role="img" aria-label={`Chart of ${keys.join(', ')}`}>
      <ResponsiveContainer>
        {kind === 'bar' ? (
          <BarChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {keys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={color(i)}
                radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0}
              />
            ))}
          </BarChart>
        ) : (
          <AreaChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {keys.map((key, i) => (
              <Area
                key={key}
                dataKey={key}
                stackId="a"
                type="monotone"
                stroke={color(i)}
                fill={color(i)}
                fillOpacity={0.15}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
