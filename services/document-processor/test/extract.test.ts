import { describe, expect, it } from 'vitest';

import { PermanentError } from '../src/errors.ts';
import { extractorFor } from '../src/extract/index.ts';
import { decodeText } from '../src/extract/txt.ts';
import { makeDocx, makePdf } from './fixtures/make-files.ts';

const noLimit = { maxPages: null };

describe('PDF', () => {
  it('extracts text page by page', async () => {
    const { pages } = await extractorFor('pdf')(
      makePdf(['Cells are small.', 'Mitochondria (power).']),
      noLimit,
    );
    expect(pages).toEqual([
      { number: 1, text: 'Cells are small.' },
      { number: 2, text: 'Mitochondria (power).' },
    ]);
  });

  it('enforces the plan page limit', async () => {
    await expect(
      extractorFor('pdf')(makePdf(['a', 'b', 'c']), { maxPages: 2 }),
    ).rejects.toMatchObject({ code: 'too_many_pages' });
  });

  it('reports corrupt files as permanent failures', async () => {
    await expect(
      extractorFor('pdf')(new TextEncoder().encode('not a pdf'), noLimit),
    ).rejects.toBeInstanceOf(PermanentError);
  });
});

describe('DOCX', () => {
  it('extracts paragraphs', async () => {
    const { pages } = await extractorFor('docx')(
      await makeDocx(['Chapter 1', 'Photosynthesis makes sugar.']),
      noLimit,
    );
    expect(pages).toEqual([{ number: 1, text: 'Chapter 1\n\nPhotosynthesis makes sugar.' }]);
  });

  it('splits long documents into pages', async () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'x'.repeat(290)}`);
    const { pages } = await extractorFor('docx')(await makeDocx(paragraphs), noLimit);
    // ~302 characters per paragraph: nine fit in a 3000-character page.
    expect(pages.length).toBe(4);
  });

  it('rejects files that are not Word documents', async () => {
    await expect(extractorFor('docx')(new Uint8Array([1, 2, 3]), noLimit)).rejects.toMatchObject({
      code: 'corrupt_file',
    });
  });
});

describe('TXT', () => {
  it('decodes UTF-8, UTF-16 and legacy Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('مرحبا café'))).toBe('مرحبا café');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]))).toBe('Hi');
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
  });

  it('rejects binary files renamed to .txt', async () => {
    await expect(
      extractorFor('txt')(new Uint8Array([0x4d, 0x5a, 0x00, 0x01]), noLimit),
    ).rejects.toMatchObject({ code: 'unsupported_file_type' });
  });
});

it('photos wait for OCR (added with the AI phase)', () => {
  expect(() => extractorFor('image')).toThrow(PermanentError);
});
