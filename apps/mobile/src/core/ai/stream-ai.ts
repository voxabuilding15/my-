import {
  type AiRequest,
  type AiStreamEvent,
  type ApiErrorBody,
  AppError,
  type Citation,
  isAppErrorCode,
} from '@studexa/shared';
import { fetch } from 'expo/fetch';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';

import { createSseParser } from './sse';

export type AiStreamResult = Extract<AiStreamEvent, { type: 'done' }> & {
  text: string;
  model: string;
  cached: boolean;
};

export type AiStreamHandlers = {
  /** The full text so far (not the delta), ready to render. */
  onText?: (text: string) => void;
  onCitation?: (citation: Citation) => void;
};

/**
 * A dead connection must not leave a spinner forever. The server answers (headers) quickly and
 * then sends a text chunk or a heartbeat at least every 15 s, even on 2G.
 */
export const AI_STREAM_TIMEOUTS = { firstByteMs: 45_000, idleMs: 60_000 };

/**
 * Calls the `ai` Edge Function and consumes its event stream. expo/fetch streams the response
 * body natively, so tokens render as they arrive.
 */
export async function streamAi(
  request: AiRequest,
  handlers: AiStreamHandlers = {},
  signal?: AbortSignal,
  timeouts = AI_STREAM_TIMEOUTS,
): Promise<AiStreamResult> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('unauthenticated');

  // One controller for the caller's cancel and our timeouts; the timer restarts on every chunk.
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };
  const onCallerAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onCallerAbort);
  arm(timeouts.firstByteMs);
  try {
    return await consume(request, token, handlers, controller.signal, () => arm(timeouts.idleMs));
  } catch (error) {
    if (timedOut) throw new AppError('network', 'The connection timed out');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function consume(
  request: AiRequest,
  token: string,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  onActivity: () => void,
): Promise<AiStreamResult> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.supabaseAnonKey ?? '',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    throw new AppError('network', String(error));
  }

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const code = payload?.error.code;
    throw new AppError(
      isAppErrorCode(code) ? code : 'unknown',
      payload?.error.message,
      payload?.error.details,
    );
  }

  const parse = createSseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let text = '';
  let start: Extract<AiStreamEvent, { type: 'start' }> | null = null;
  onActivity();
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new AppError('network', 'The answer was interrupted');
    }
    const { value, done } = chunk;
    if (done) break;
    onActivity();
    for (const event of parse(decoder.decode(value, { stream: true }))) {
      switch (event.type) {
        case 'start':
          start = event;
          break;
        case 'text':
          text += event.text;
          handlers.onText?.(text);
          break;
        case 'citation':
          handlers.onCitation?.(event.citation);
          break;
        case 'error':
          throw new AppError(event.code, event.message);
        case 'done':
          return { ...event, text, model: start?.model ?? '', cached: start?.cached ?? false };
      }
    }
  }
  // The stream ended without a result (connection dropped mid-answer).
  throw new AppError('network', 'The answer was interrupted');
}
