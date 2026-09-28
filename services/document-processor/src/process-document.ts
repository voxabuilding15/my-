import { chunkPages, detectLanguage, estimateTokens } from '@studexa/shared';
import { createHash } from 'node:crypto';

import { extractorFor } from './extract/index.ts';
import type { AiServices, DocumentStore } from './ports.ts';
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
  services: AiServices = { ocr: null, embeddings: null },
): Promise<ProcessOutcome> {
  const doc = await store.get(documentId);
  // Deleted meanwhile, already done, or not uploaded: nothing to do.
  if (!doc || doc.status !== 'processing') return 'skipped';

  const file = await store.download(doc.storagePath);
  const sha256 = createHash('sha256').update(file).digest('hex');
  if (await store.reuse(documentId, sha256)) return 'reused';

  const { ocr } = services;
  const { pages } = await extractorFor(doc.kind)(file, {
    maxPages: doc.maxPages,
    mimeType: doc.mimeType,
    readImage: ocr ? (image, mimeType) => ocr({ userId: doc.userId, image, mimeType }) : null,
  });
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

/** Batch size per embeddings call and per save. */
const EMBED_BATCH = 128;

/**
 * Vectors for a large document's chunks (hybrid retrieval). Resumable: only chunks without a
 * vector for the active model are embedded, so a retry continues where it stopped.
 */
export async function embedDocument(
  store: DocumentStore,
  documentId: string,
  services: AiServices,
): Promise<number> {
  const embeddings = services.embeddings;
  // Without an embeddings key, large documents are searched by full text only.
  if (!embeddings) return 0;
  const model = await store.activeEmbeddingModel();
  if (!model || model.model !== embeddings.model || model.dimensions !== embeddings.dimensions) {
    throw new PermanentError('embedding_model_mismatch');
  }
  let saved = 0;
  for (;;) {
    const chunks = await store.chunksToEmbed(documentId, model.id, EMBED_BATCH);
    if (chunks.length === 0) return saved;
    const vectors = await embeddings.embed(
      chunks.map((c) => c.content),
      'document',
    );
    saved += await store.saveEmbeddings(
      documentId,
      model.id,
      chunks.map((c, i) => ({ chunkId: c.chunkId, embedding: vectors[i] ?? [] })),
    );
  }
}
