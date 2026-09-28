import { describe, expect, it } from 'vitest';

import { chunkPages, detectLanguage, estimateTokens, normalizeText } from './index.ts';

describe('normalizeText', () => {
  it('collapses spaces, keeps paragraphs and strips control characters', () => {
    expect(normalizeText('﻿Hello \t world\r\n\r\n\r\n\r\nNext\u0007 line  ')).toBe(
      'Hello world\n\nNext line',
    );
  });
});

describe('estimateTokens', () => {
  it('counts about four Latin characters per token and denser Arabic', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('ب'.repeat(250))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('detectLanguage', () => {
  it('detects English, French and Arabic for stemming', () => {
    expect(
      detectLanguage('The cell is the basic unit of life and it is found in all organisms.')
        .tsConfig,
    ).toBe('english');
    expect(
      detectLanguage(
        'La cellule est l’unité de base du vivant et elle est dans tous les organismes pour nous.',
      ).tsConfig,
    ).toBe('french');
    expect(detectLanguage('الخلية هي الوحدة الأساسية للحياة في جميع الكائنات الحية').language).toBe(
      'ar',
    );
  });
  it('falls back to simple for unknown or empty text', () => {
    expect(detectLanguage('12345 67890').tsConfig).toBe('simple');
    expect(detectLanguage('Mitochondria ribosome').tsConfig).toBe('simple');
  });
});

describe('chunkPages', () => {
  const paragraph = (n: number) => `Paragraph ${n} ${'word '.repeat(60).trim()}.`; // ~80 tokens

  it('keeps small documents in one chunk spanning its pages', () => {
    const chunks = chunkPages(
      [
        { number: 1, text: 'Hello.' },
        { number: 2, text: 'World.' },
      ],
      800,
      120,
    );
    expect(chunks).toEqual([
      { index: 0, page_start: 1, page_end: 2, content: 'Hello.\n\nWorld.', tokens: 4 },
    ]);
  });

  it('splits at paragraph boundaries near the target with overlap', () => {
    const pages = [1, 2, 3].map((n) => ({
      number: n,
      text: [1, 2, 3, 4].map((p) => paragraph(n * 10 + p)).join('\n\n'),
    }));
    const chunks = chunkPages(pages, 250, 90);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.tokens).toBeLessThanOrEqual(250 + 10);
    // Each chunk after the first starts with the previous chunk's last paragraph.
    for (let i = 1; i < chunks.length; i++) {
      const previousLast = chunks[i - 1]!.content.split('\n\n').at(-1)!;
      expect(chunks[i]!.content.startsWith(previousLast)).toBe(true);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(chunks.at(-1)!.page_end).toBe(3);
  });

  it('splits a single huge paragraph so no chunk exceeds the target', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = chunkPages([{ number: 1, text }], 100, 20);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.tokens).toBeLessThanOrEqual(110);
  });

  it('returns nothing for empty pages', () => {
    expect(chunkPages([{ number: 1, text: '' }], 800, 120)).toEqual([]);
  });
});
