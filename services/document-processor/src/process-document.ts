import { createHash } from 'node:crypto';

import { extractorFor } from './extract/index.ts';
import type { DocumentStore } from './ports.ts';
import { chunkPages } from './text/chunk.ts';
import { detectLanguage } from './text/language.ts';
import { estimateTokens } from './text/tokens.ts';
import { PermanentError } from './errors.ts';

/** Bump when extraction output changes, so documents can be re-processed selectively. */
export const EXTRACTION_VERSION = 1;

export type ProcessOutcome = 'extracted' | 'reused' | 'skipped';

/**
 * Extract once: download, hash, reuse an identical earlier extraction when possible,
 * otherwise extract, chunk and save. Throws PermanentError for files that cannot succeed.
 */
export async function processDocument(
  store: DocumentStore,
  documentId: string,
): Promise<ProcessOutcome> {
  const doc = await store.get(documentId);
  // Deleted meanwhile, already done, or not uploaded: nothing to do.
  if (!doc || doc.status !== 'processing') return 'skipped';

  const file = await store.download(doc.storagePath);
  const sha256 = createHash('sha256').update(file).digest('hex');
  if (await store.reuse(documentId, sha256)) return 'reused';

  const { pages } = await extractorFor(doc.kind)(file, { maxPages: doc.maxPages });
  const fullText = pages.map((page) => page.text).join('\n\n');
  if (!fullText.trim()) throw new PermanentError('no_text');

  const tokenCount = estimateTokens(fullText);
  const retrievalMode = tokenCount > doc.fullContextMaxTokens ? 'hybrid' : 'full_context';
  const { language, tsConfig } = detectLanguage(fullText);
  const chunks = chunkPages(pages, doc.chunkTargetTokens, doc.chunkOverlapTokens);

  await store.save(documentId, {
    pages,
    chunks,
    tokenCount,
    language,
    tsConfig,
    retrievalMode,
    extractionVersion: EXTRACTION_VERSION,
  });
  return 'extracted';
}
