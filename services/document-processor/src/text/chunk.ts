import { estimateTokens } from './tokens.ts';

export type Page = { number: number; text: string; ocr?: boolean };
export type Chunk = {
  index: number;
  page_start: number;
  page_end: number;
  content: string;
  tokens: number;
};

type Segment = { page: number; text: string; tokens: number };

/** Splits text that is longer than the target by sentences, then by words. */
function splitLong(text: string, page: number, target: number): Segment[] {
  const pieces = text.split(/(?<=[.!?؟。])\s+/u);
  const out: Segment[] = [];
  let current = '';
  const push = () => {
    if (current) out.push({ page, text: current, tokens: estimateTokens(current) });
    current = '';
  };
  for (const piece of pieces) {
    if (estimateTokens(piece) > target) {
      push();
      const words = piece.split(/\s+/);
      for (const word of words) {
        if (estimateTokens(`${current} ${word}`) > target) push();
        current = current ? `${current} ${word}` : word;
      }
      push();
      continue;
    }
    if (estimateTokens(`${current} ${piece}`) > target) push();
    current = current ? `${current} ${piece}` : piece;
  }
  push();
  return out;
}

/**
 * Paragraph-aware chunking for retrieval: chunks of about `target` tokens that never split a
 * paragraph unless it is itself too long, with `overlap` tokens of trailing context repeated at
 * the start of the next chunk so answers spanning a boundary are still found.
 */
export function chunkPages(pages: Page[], target: number, overlap: number): Chunk[] {
  const segments: Segment[] = [];
  for (const page of pages) {
    for (const paragraph of page.text.split(/\n{2,}/)) {
      const text = paragraph.trim();
      if (!text) continue;
      const tokens = estimateTokens(text);
      if (tokens > target) segments.push(...splitLong(text, page.number, target));
      else segments.push({ page: page.number, text, tokens });
    }
  }

  const chunks: Chunk[] = [];
  let current: Segment[] = [];
  let currentTokens = 0;
  let fresh = 0;

  const emit = () => {
    if (fresh === 0) return;
    const content = current.map((s) => s.text).join('\n\n');
    chunks.push({
      index: chunks.length,
      page_start: current[0]!.page,
      page_end: current[current.length - 1]!.page,
      content,
      tokens: estimateTokens(content),
    });
    // Carry the tail forward as overlap.
    const tail: Segment[] = [];
    let tailTokens = 0;
    for (let i = current.length - 1; i >= 0 && tailTokens < overlap; i--) {
      const segment = current[i]!;
      if (tailTokens + segment.tokens > overlap && tail.length > 0) break;
      if (segment.tokens > overlap) break;
      tail.unshift(segment);
      tailTokens += segment.tokens;
    }
    current = tail;
    currentTokens = tailTokens;
    fresh = 0;
  };

  for (const segment of segments) {
    if (currentTokens + segment.tokens > target && fresh > 0) emit();
    current.push(segment);
    currentTokens += segment.tokens;
    fresh++;
  }
  emit();
  return chunks;
}
