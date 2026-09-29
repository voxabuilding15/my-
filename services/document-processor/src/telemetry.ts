import { errorText } from '@studexa/shared';
import * as Sentry from '@sentry/node';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Config } from './config.ts';
import type { Reporter } from './ports.ts';

const EMAIL = /[^\s@"]+@[^\s@"]+/g;

export function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  // Cloud Logging parses JSON lines; `severity` sets the log level.
  const line = JSON.stringify({ severity: level.toUpperCase(), event, ...fields }).replace(
    EMAIL,
    '[email]',
  );
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Unexpected errors go to the internal error log (admin dashboard) and to Sentry when configured. */
export function createReporter(config: Config, client: SupabaseClient): Reporter {
  if (config.SENTRY_DSN) {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.ENVIRONMENT,
      release: config.K_REVISION,
      tracesSampleRate: 0,
    });
  }
  return (error, context) => {
    const message = errorText(error).replace(EMAIL, '[email]');
    log('error', 'job.failed', { error: message, ...context });
    if (config.SENTRY_DSN) Sentry.captureException(error, { extra: context });
    void client
      .from('error_logs')
      .insert({
        source: 'worker',
        severity: 'error',
        code: 'document_processor',
        message: message.slice(0, 2000),
        context,
        platform: 'cloud_run',
      })
      .then(
        ({ error: insertError }) =>
          insertError && log('warn', 'telemetry.internal_failed', { error: insertError.message }),
      );
  };
}

export const flushTelemetry = (): Promise<boolean> => Sentry.flush(2000);
