import { z } from 'zod';

import type { AiRouteKey, ModelRoute } from './types.ts';

export const HAIKU = 'claude-haiku-4-5';
export const SONNET = 'claude-sonnet-5-5';

const fast = (maxTokens: number): ModelRoute => ({
  provider: 'anthropic',
  model: HAIKU,
  maxTokens,
});
const strong = (maxTokens: number, effort: 'low' | 'medium' = 'low'): ModelRoute => ({
  provider: 'anthropic',
  model: SONNET,
  maxTokens,
  effort,
  fallback: true,
});

/**
 * Product owner's split: Haiku 4.5 for chat, explanations, translation, flashcards and light
 * tasks; Sonnet 5.5 for summaries, quizzes, study plans, mind maps and notes. Overridden at
 * runtime by app_config `ai.routes` (admin dashboard) without an app release.
 */
export const DEFAULT_ROUTES: Record<AiRouteKey, ModelRoute> = {
  chat: fast(2048),
  document_qa: fast(2048),
  explain: fast(2048),
  eli10: fast(1500),
  translate: fast(8192),
  flashcards: fast(6000),
  practice_questions: fast(3000),
  summarize: strong(4096),
  notes: strong(6000),
  mind_map: strong(3000),
  study_plan: strong(4096),
  quiz: strong(8192, 'medium'),
  // Photos in Arabic or handwriting, where on-device OCR is weak: accuracy first.
  ocr: strong(4096),
};

const routeSchema = z.object({
  provider: z.literal('anthropic'),
  model: z.string().min(3).max(100),
  maxTokens: z.number().int().min(256).max(64000),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  fallback: z.boolean().optional(),
});

/** Merges the config's valid overrides onto the defaults; an invalid entry never breaks AI. */
export function resolveRoutes(config: unknown): Record<AiRouteKey, ModelRoute> {
  const routes = { ...DEFAULT_ROUTES };
  if (!config || typeof config !== 'object') return routes;
  for (const [key, value] of Object.entries(config)) {
    if (!(key in routes)) continue;
    const parsed = routeSchema.safeParse({ ...routes[key as AiRouteKey], ...(value as object) });
    if (parsed.success) routes[key as AiRouteKey] = parsed.data;
  }
  return routes;
}
