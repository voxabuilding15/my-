const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/**
 * Fast token estimate for routing (full context vs retrieval) and chunk sizing. Claude's
 * tokenizer averages ~4 characters per token for Latin text and ~2.5 for Arabic.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const arabic = text.match(ARABIC)?.length ?? 0;
  return Math.ceil((text.length - arabic) / 4 + arabic / 2.5);
}
