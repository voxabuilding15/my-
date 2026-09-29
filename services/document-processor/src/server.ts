import { errorText } from '@studexa/shared';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import type { RunStats } from './worker.ts';

export type ServerDeps = {
  secret: string;
  run(): Promise<RunStats>;
  log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void;
};

function authorized(req: IncomingMessage, secret: string): boolean {
  const provided = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * POST /work drains the queue (called by the upload function and by Cloud Scheduler every
 * minute as a safety net). One run per instance at a time; extra calls return immediately.
 */
export function createWorkerServer(deps: ServerDeps): Server {
  let running: Promise<RunStats> | null = null;

  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/work') return send(404, { error: 'not_found' });
    if (!authorized(req, deps.secret)) return send(401, { error: 'unauthenticated' });

    if (running) return send(202, { status: 'already_running' });
    running = deps.run();
    try {
      const stats = await running;
      deps.log('info', 'run.finished', stats);
      send(200, { status: 'done', ...stats });
    } catch (error) {
      deps.log('error', 'run.failed', { error: errorText(error) });
      send(500, { error: 'run_failed' });
    } finally {
      running = null;
    }
  });
}
