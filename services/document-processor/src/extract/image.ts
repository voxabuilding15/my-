import { normalizeText } from '@studexa/shared';

import { PermanentError } from '../errors.ts';
import type { Extractor } from './types.ts';

/** Claude's per-image limit. The app compresses photos well below it before upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Photos arrive here when on-device OCR could not read them (Arabic, handwriting); text the
 * device already read is saved at upload and never reaches the worker.
 */
export const extractImage: Extractor = async (file, { mimeType, readImage }) => {
  if (!readImage) throw new PermanentError('ocr_unavailable');
  if (!SUPPORTED.has(mimeType)) throw new PermanentError('unsupported_file_type');
  if (file.byteLength > MAX_IMAGE_BYTES) throw new PermanentError('file_too_large');
  const text = normalizeText(await readImage(file, mimeType));
  return { pages: [{ number: 1, text, ocr: true }] };
};
