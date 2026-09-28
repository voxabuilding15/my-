import type { DocumentKind } from '@studexa/shared';

import { extractDocx } from './docx.ts';
import { extractImage } from './image.ts';
import { extractPdf } from './pdf.ts';
import { extractTxt } from './txt.ts';
import type { Extractor } from './types.ts';

const EXTRACTORS: Record<DocumentKind, Extractor> = {
  pdf: extractPdf,
  docx: extractDocx,
  txt: extractTxt,
  image: extractImage,
};

export const extractorFor = (kind: DocumentKind): Extractor => EXTRACTORS[kind];

export type { ExtractOptions, Extraction, Extractor } from './types.ts';
