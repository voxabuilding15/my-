import { log } from './logger.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/** Keeps the worker alive for `task` after the response is returned. */
export function runInBackground(task: Promise<unknown>): void {
  const guarded = task.catch((error) =>
    log('error', 'background.failed', { error: String(error) }),
  );
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(guarded);
}
