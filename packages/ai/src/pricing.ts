import type { TokenUsage } from './types.ts';

/** USD per million tokens. Overridable via app_config `ai.pricing` when prices change. */
export type ModelPrice = { input: number; output: number; cacheWrite: number; cacheRead: number };

export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

/** Estimated cost in micro-dollars (integer), used for budgets and the dashboard. */
export function costMicros(
  usage: TokenUsage,
  prices: Record<string, ModelPrice> = DEFAULT_PRICES,
): number {
  // Fallback responses report the model that served them; unknown models use the most expensive known price.
  const price =
    prices[usage.model] ??
    Object.values(prices).reduce((max, p) => (p.output > max.output ? p : max), {
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
    });
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead,
  );
}
