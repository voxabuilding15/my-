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
 * Calls the `ai` Edge Function and consumes its event stream. expo/fetch streams the response
 * body natively, so tokens render as they arrive.
 */
export async function streamAi(
  request: AiRequest,
  handlers: AiStreamHandlers = {},
  signal?: AbortSignal,
): Promise<AiStreamResult> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('unauthenticated');

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
      ...(signal ? { signal } : {}),
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
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
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
