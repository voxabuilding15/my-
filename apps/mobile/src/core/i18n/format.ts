/** Locale-aware formatting helpers that degrade gracefully where Intl support is partial. */

export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value);
  return `${number} ${units[unit]}`;
}

/** Each unit is used while the magnitude stays below its limit, then converted to the next unit. */
const RELATIVE_STEPS: [unit: Intl.RelativeTimeFormatUnit, limit: number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 5],
];

/** "3 hours ago" / "il y a 3 heures" / "قبل ٣ ساعات"; falls back to a short date. */
export function formatRelative(iso: string, locale: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const seconds = (date.getTime() - now.getTime()) / 1000;
  if (typeof Intl.RelativeTimeFormat === 'function') {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    let value = seconds / 60;
    for (const [unit, next] of RELATIVE_STEPS) {
      if (Math.abs(value) < next) return rtf.format(Math.round(value), unit);
      value /= next;
    }
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
