import type { Page } from '@studexa/shared';

export type Extraction = { pages: Page[] };

export type ExtractOptions = {
  maxPages: number | null;
  mimeType: string;
  /** Photo OCR; null when not configured. */
  readImage: ((image: Uint8Array, mimeType: string) => Promise<string>) | null;
};

export type Extractor = (file: Uint8Array, options: ExtractOptions) => Promise<Extraction>;
