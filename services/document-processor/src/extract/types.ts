import type { Page } from '../text/chunk.ts';

export type Extraction = { pages: Page[] };

export type Extractor = (
  file: Uint8Array,
  options: { maxPages: number | null },
) => Promise<Extraction>;
