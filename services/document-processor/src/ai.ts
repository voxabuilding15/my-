import {
  AiError,
  costMicros,
  DEFAULT_PRICES,
  OCR_PROMPT,
  resolveRoutes,
  type AiProvider,
  type ModelPrice,
} from '@studexa/ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PermanentError } from './errors.ts';
import type { OcrFn } from './ports.ts';

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

async function rpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} failed: ${error.message}`);
  return data as T;
}

/**
 * Claude-vision OCR for photos on-device OCR couldn't read. Charges the OCR quota up front and
 * refunds it on failure, like every other AI call; the model comes from remote config.
 */
export function createOcr(client: SupabaseClient, provider: AiProvider): OcrFn {
  return async ({ userId, image, mimeType }) => {
    const { data } = await client
      .from('app_config')
      .select('key, value')
      .in('key', ['ai.routes', 'ai.pricing']);
    const config = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
    const route = resolveRoutes(config['ai.routes']).ocr;
    const prices = {
      ...DEFAULT_PRICES,
      ...((config['ai.pricing'] ?? {}) as Record<string, ModelPrice>),
    };

    const [admission] = await rpc<{ allowed: boolean; reason: string | null }[]>(
      client,
      'begin_ai_request',
      {
        p_user_id: userId,
        p_metrics: ['ocr_scans'],
      },
    );
    if (!admission?.allowed) {
      if (admission?.reason === 'quota_exceeded') throw new PermanentError('ocr_quota_exceeded');
      if (admission?.reason === 'email_unverified') throw new PermanentError('email_unverified');
      // Kill switch, budget or a burst: try again later.
      throw new Error(`ocr not admitted: ${admission?.reason}`);
    }

    const started = Date.now();
    const finish = (
      succeeded: boolean,
      usage?: Awaited<ReturnType<AiProvider['imageToText']>>['usage'],
    ) =>
      rpc(client, 'finish_ai_request', {
        p_user_id: userId,
        p_action: 'ocr',
        p_metrics: ['ocr_scans'],
        p_succeeded: succeeded,
        p_model: usage?.model ?? null,
        p_input_tokens: usage ? usage.inputTokens + usage.cacheWriteTokens : 0,
        p_output_tokens: usage?.outputTokens ?? 0,
        p_cached_input_tokens: usage?.cacheReadTokens ?? 0,
        p_cost_micros: usage ? costMicros(usage, prices) : 0,
        p_latency_ms: Date.now() - started,
      });

    try {
      const result = await provider.imageToText({
        route,
        prompt: OCR_PROMPT,
        image: { mediaType: mimeType as ImageType, base64: Buffer.from(image).toString('base64') },
      });
      if (result.stopReason === 'refusal') throw new AiError('refused', 'declined');
      await finish(true, result.usage);
      return result.text;
    } catch (error) {
      await finish(false).catch(() => undefined);
      if (error instanceof AiError && !error.retryable)
        throw new PermanentError(error.kind === 'refused' ? 'ocr_declined' : 'ocr_failed');
      throw error;
    }
  };
}
