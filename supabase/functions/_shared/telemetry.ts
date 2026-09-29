import { errorText } from '@studexa/shared';
import type { Scope } from '@sentry/deno';
import type { SupabaseClient } from '@supabase/supabase-js';

import { runInBackground } from './background.ts';
import type { Env } from './env.ts';
import { log, redact } from './logger.ts';

export type ErrorReport = {
  fn: string;
  error: unknown;
  userId?: string;
  context?: Record<string, unknown>;
};

type Reporter = (report: ErrorReport) => Promise<void>;

let reporters: Reporter[] = [];

/**
 * Unexpected errors go to the internal `error_logs` table (admin dashboard) and, when
 * SENTRY_DSN is set, to Sentry. Sentry is loaded lazily so it costs nothing when unused.
 */
export function configureTelemetry(env: Env, admin: SupabaseClient): void {
  reporters = [internalReporter(admin)];
  if (env.SENTRY_DSN) reporters.push(sentryReporter(env, env.SENTRY_DSN));
}

/** For tests. */
export function setReporters(next: Reporter[]): void {
  reporters = next;
}

export function reportError(report: ErrorReport): void {
  for (const reporter of reporters) runInBackground(reporter(report));
}

function message(error: unknown): string {
  return redact(errorText(error)).slice(0, 2000);
}

function internalReporter(admin: SupabaseClient): Reporter {
  return async ({ fn, error, userId, context }) => {
    const { error: insertError } = await admin.from('error_logs').insert({
      user_id: userId ?? null,
      source: 'edge_function',
      severity: 'error',
      code: fn.slice(0, 100),
      message: message(error),
      context: context ?? {},
      platform: 'edge',
    });
    if (insertError) log('warn', 'telemetry.internal_failed', { error: insertError.message });
  };
}

function sentryReporter(env: Env, dsn: string): Reporter {
  let ready: Promise<typeof import('@sentry/deno')> | undefined;
  const load = () =>
    (ready ??= import('@sentry/deno').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: env.ENVIRONMENT,
        ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
        // Edge runtime: no global handlers; errors are captured explicitly.
        defaultIntegrations: false,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      return Sentry;
    }));

  return async ({ fn, error, userId, context }) => {
    const Sentry = await load();
    Sentry.withScope((scope: Scope) => {
      scope.setTag('function', fn);
      if (userId) scope.setUser({ id: userId });
      if (context) scope.setContext('details', context);
      Sentry.captureException(error);
    });
    await Sentry.flush(2000);
  };
}
