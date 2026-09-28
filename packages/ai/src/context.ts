import { estimateTokens } from '@studexa/shared';

import type { SourceDocument, SourceSection } from './types.ts';

export type PageText = { number: number; text: string };

/**
 * Pages in order up to a token budget. Whole-document tools on very large documents read the
 * beginning and report where they stopped, instead of silently dropping content.
 */
export function documentFromPages(
  title: string,
  pages: PageText[],
  budgetTokens: number,
): { document: SourceDocument; coveredUntilPage: number | undefined } {
  const sections: SourceSection[] = [];
  let used = 0;
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    const tokens = estimateTokens(text) + 8;
    if (used + tokens > budgetTokens && sections.length > 0) {
      return { document: { title, sections }, coveredUntilPage: sections.at(-1)?.pageEnd };
    }
    sections.push({ pageStart: page.number, pageEnd: page.number, text });
    used += tokens;
  }
  return { document: { title, sections }, coveredUntilPage: undefined };
}

export type RetrievedChunk = { pageStart: number; pageEnd: number; content: string };

/** Retrieved chunks in reading order, so the model sees them as the document flows. */
export function documentFromChunks(title: string, chunks: RetrievedChunk[]): SourceDocument {
  return {
    title,
    sections: [...chunks]
      .sort((a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd)
      .map((c) => ({ pageStart: c.pageStart, pageEnd: c.pageEnd, text: c.content.trim() })),
  };
}
