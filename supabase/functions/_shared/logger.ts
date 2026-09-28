type Level = 'info' | 'warn' | 'error';

const EMAIL = /[^\s@"]+@[^\s@"]+/g;

/** Emails are personal data: never write them to logs. */
export function redact(value: string): string {
  return value.replace(EMAIL, '[email]');
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = redact(JSON.stringify({ level, event, time: new Date().toISOString(), ...fields }));
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
