import { AppError } from '@studexa/shared';

import type { AiRepository } from '@/features/ai-tools/domain/ai-tools';

/** Real AI (Claude through an Edge Function) arrives with the AI phase; until then, say so honestly. */
export class UnavailableAiRepository implements AiRepository {
  run(): Promise<never> {
    return Promise.reject(new AppError('ai_unavailable'));
  }

  translate(): Promise<never> {
    return Promise.reject(new AppError('ai_unavailable'));
  }
}
