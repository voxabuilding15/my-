import type { DocumentKind } from '@studexa/shared';

import { PermanentError } from '../errors.ts';
import { extractDocx } from './docx.ts';
import { extractPdf } from './pdf.ts';
import { extractTxt } from './txt.ts';
import type { Extractor } from './types.ts';

const EXTRACTORS: Partial<Record<DocumentKind, Extractor>> = {
  pdf: extractPdf,
  docx: extractDocx,
  txt: extractTxt,
};

export function extractorFor(kind: DocumentKind): Extractor {
  const extractor = EXTRACTORS[kind];
  // Photos are read with OCR (on-device ML Kit / Claude vision), added with the AI phase.
  if (!extractor) throw new PermanentError('ocr_unavailable');
  return extractor;
}

export type { Extraction, Extractor } from './types.ts';
