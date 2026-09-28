import { extractText, getDocumentProxy } from 'unpdf';

import { PermanentError } from '../errors.ts';
import { normalizeText } from '@studexa/shared';
import type { Extractor } from './types.ts';

export const extractPdf: Extractor = async (file, { maxPages }) => {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(file));
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'PasswordException') throw new PermanentError('password_protected');
    throw new PermanentError('corrupt_file', String(error));
  }
  try {
    if (maxPages !== null && pdf.numPages > maxPages) throw new PermanentError('too_many_pages');
    const { text } = await extractText(pdf, { mergePages: false });
    return { pages: text.map((page, i) => ({ number: i + 1, text: normalizeText(page) })) };
  } finally {
    await pdf.cleanup();
  }
};
