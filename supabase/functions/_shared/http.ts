import type { ApiErrorBody } from '@studexa/shared';
import type { z } from 'zod';

import { HttpError } from './errors.ts';
import { log } from './logger.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError('validation_failed', 'Body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const weak = parsed.error.issues.some((issue) => issue.message === 'weak_password');
    throw new HttpError(weak ? 'weak_password' : 'validation_failed', 'Invalid request', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** Wraps a handler with CORS, method check, error mapping and request logging. */
export function withHttp(name: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST')
      return json(errorBody(new HttpError('validation_failed', 'Use POST')), 405);

    const started = Date.now();
    try {
      const res = await handler(req);
      log('info', `${name}.ok`, { status: res.status, ms: Date.now() - started });
      return res;
    } catch (error) {
      if (error instanceof HttpError) {
        log('warn', `${name}.rejected`, { code: error.code, ms: Date.now() - started });
        return json(errorBody(error), error.status);
      }
      log('error', `${name}.failed`, { error: String(error), ms: Date.now() - started });
      return json(errorBody(new HttpError('unknown', 'Something went wrong')), 500);
    }
  };
}

function errorBody(error: HttpError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}
