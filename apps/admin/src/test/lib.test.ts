import { describe, expect, it } from 'vitest';

import { navFor } from '@/components/nav';
import { formatAgo, formatBytes, formatUsd } from '@/lib/format';
import { pivotSeries, sumSeries } from '@/lib/queries';
import { routesFor } from '@/app';

describe('format', () => {
  it('formats bytes, money and relative times', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatAgo(new Date(Date.now() - 90_000).toISOString())).toBe('2m ago');
    expect(formatAgo(null)).toBe('—');
  });
});

describe('pivotSeries', () => {
  const today = new Date('2026-09-28T12:00:00Z');
  const rows = [
    { day: '2026-09-28', dimension: 'summarize', value: 3 },
    { day: '2026-09-28', dimension: 'explain', value: 2 },
    { day: '2026-09-26', dimension: 'summarize', value: 1 },
  ];

  it('fills every day and totals by default', () => {
    const { points, keys } = pivotSeries(rows, 3, { today });
    expect(keys).toEqual(['total']);
    expect(points).toEqual([
      { day: '2026-09-26', total: 1 },
      { day: '2026-09-27', total: 0 },
      { day: '2026-09-28', total: 5 },
    ]);
  });

  it('splits by dimension and scales micros', () => {
    const { points, keys } = pivotSeries(rows, 1, { today, byDimension: true, scale: 1e6 });
    expect(keys).toEqual(['explain', 'summarize']);
    expect(points[0]).toEqual({ day: '2026-09-28', explain: 2e-6, summarize: 3e-6 });
    expect(sumSeries(rows)).toBe(6);
  });
});

describe('role-based navigation', () => {
  const labels = (role: 'admin' | 'support' | 'analyst') =>
    navFor(role).flatMap((g) => g.items.map((i) => i.label));

  it('analysts see analytics but no personal data or configuration', () => {
    expect(labels('analyst')).toEqual(
      expect.arrayContaining(['Revenue', 'AI usage', 'Engagement']),
    );
    expect(labels('analyst')).not.toContain('Users');
    expect(labels('analyst')).not.toContain('Errors');
    expect(labels('analyst')).not.toContain('Remote config');
  });

  it('support sees users and errors but not revenue or configuration', () => {
    expect(labels('support')).toEqual(expect.arrayContaining(['Users', 'Errors']));
    expect(labels('support')).not.toContain('Revenue');
    expect(labels('support')).not.toContain('Audit log');
  });

  it('only the allowed routes exist for a role', () => {
    const paths = (routesFor('support')[0]?.children ?? []).map(
      (r) => r.path ?? (r.index ? '/' : ''),
    );
    expect(paths).toContain('users/:id');
    expect(paths).not.toContain('revenue');
    const analyst = (routesFor('analyst')[0]?.children ?? []).map((r) => r.path);
    expect(analyst).not.toContain('users/:id');
  });
});
