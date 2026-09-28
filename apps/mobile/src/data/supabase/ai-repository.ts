import type { SupabaseClient } from '@supabase/supabase-js';

import type { streamAi } from '@/core/ai';
import type {
  AiRepository,
  AiRequest,
  AiResult,
  AnswerReport,
} from '@/features/ai-tools/domain/ai-tools';

import { check, currentUserId } from './postgrest';

export type StreamAi = typeof streamAi;

export class SupabaseAiRepository implements AiRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly stream: StreamAi,
  ) {}

  async run(request: AiRequest, onToken: (partial: string) => void): Promise<AiResult> {
    const result = await this.stream(
      {
        action: request.action,
        documentId: request.documentId,
        language: request.language,
        ...(request.page ? { page: request.page } : {}),
        ...(request.targetLanguage ? { targetLanguage: request.targetLanguage } : {}),
        ...(request.regenerate ? { regenerate: true } : {}),
      },
      { onText: onToken },
    );
    return {
      markdown: result.text,
      model: result.model,
      cached: result.cached,
      citations: result.citations,
      outputId: result.outputId ?? null,
      coveredUntilPage: result.coveredUntilPage ?? null,
    };
  }

  async translate(
    text: string,
    from: Parameters<AiRepository['translate']>[1],
    to: Parameters<AiRepository['translate']>[2],
  ) {
    return (await this.stream({ action: 'translate_text', text, from, to })).text;
  }

  async report({ targetType, targetId, reason, details }: AnswerReport) {
    const result = await this.client.from('content_reports').insert({
      reporter_id: await currentUserId(this.client),
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details?.trim() || null,
    });
    // Reporting the same answer twice is not an error for the user.
    if (result.error?.code === '23505') return;
    check(result);
  }
}
