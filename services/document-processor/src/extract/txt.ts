import { PermanentError } from '../errors.ts';
import { normalizeText } from '../text/normalize.ts';
import { paginate } from './docx.ts';
import type { Extractor } from './types.ts';

/** Decodes UTF-8 (default), UTF-16 with BOM, and falls back to Windows-1252 for legacy files. */
export function decodeText(file: Uint8Array): string {
  if (file[0] === 0xff && file[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(file.subarray(2));
  if (file[0] === 0xfe && file[1] === 0xff)
    return new TextDecoder('utf-16be').decode(file.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file);
  } catch {
    return new TextDecoder('windows-1252').decode(file);
  }
}

export const extractTxt: Extractor = async (file, { maxPages }) => {
  if (file.subarray(0, 8192).includes(0) && !(file[0] === 0xff || file[0] === 0xfe)) {
    throw new PermanentError('unsupported_file_type', 'binary content');
  }
  const pages = paginate(normalizeText(decodeText(file)));
  if (maxPages !== null && pages.length > maxPages) throw new PermanentError('too_many_pages');
  return { pages: pages.map((text, i) => ({ number: i + 1, text })) };
};
