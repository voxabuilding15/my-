import mammoth from 'mammoth';

import { PermanentError } from '../errors.ts';
import { normalizeText } from '../text/normalize.ts';
import type { Extractor } from './types.ts';

/** Word files have no fixed pages: text is split into pages of about this many characters. */
export const DOCX_PAGE_CHARS = 3000;

export function paginate(text: string, pageChars = DOCX_PAGE_CHARS): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const pages: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > pageChars) {
      pages.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) pages.push(current);
  return pages;
}

export const extractDocx: Extractor = async (file, { maxPages }) => {
  let raw: string;
  try {
    ({ value: raw } = await mammoth.extractRawText({ buffer: Buffer.from(file) }));
  } catch (error) {
    throw new PermanentError('corrupt_file', String(error));
  }
  const pages = paginate(normalizeText(raw));
  if (maxPages !== null && pages.length > maxPages) throw new PermanentError('too_many_pages');
  return { pages: pages.map((text, i) => ({ number: i + 1, text })) };
};
