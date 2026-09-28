const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatNumber = (value: number | null | undefined) =>
  value == null ? '—' : number.format(value);
export const formatCompact = (value: number | null | undefined) =>
  value == null ? '—' : compact.format(value);
export const formatUsd = (value: number | null | undefined) =>
  value == null ? '—' : usd.format(value);

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  });
}

export function formatAgo(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '—';
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}
