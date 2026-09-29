import { scrubText } from '@studexa/shared';

type Level = 'info' | 'warn' | 'error';

/** Logs never carry personal data (emails, tokens, quoted rows): see packages/shared/src/privacy.ts. */
export function redact(value: string): string {
  return scrubText(value, 20_000);
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = redact(JSON.stringify({ level, event, time: new Date().toISOString(), ...fields }));
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
