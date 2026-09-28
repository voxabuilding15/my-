import type { EmbeddingProvider } from '@studexa/ai';
import type { Chunk, DocumentKind, Page } from '@studexa/shared';

export type Job = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export type ProcessingDocument = {
  documentId: string;
  userId: string;
  kind: DocumentKind;
  mimeType: string;
  storagePath: string;
  status: 'pending_upload' | 'processing' | 'ready' | 'failed';
  maxPages: number | null;
  fullContextMaxTokens: number;
  chunkTargetTokens: number;
  chunkOverlapTokens: number;
};

export type SavedExtraction = {
  pages: Page[];
  chunks: Chunk[];
  tokenCount: number;
  language: string | null;
  tsConfig: string;
  retrievalMode: 'full_context' | 'hybrid';
  extractionVersion: number;
};

/** Everything the processor needs from the outside world (Supabase in production, fakes in tests). */
export interface DocumentStore {
  get(documentId: string): Promise<ProcessingDocument | null>;
  download(storagePath: string): Promise<Uint8Array>;
  /** Copies this user's earlier extraction of identical content; true when reused. */
  reuse(documentId: string, sha256: string): Promise<boolean>;
  save(documentId: string, extraction: SavedExtraction): Promise<void>;
  markFailed(documentId: string, errorCode: string): Promise<void>;
  activeEmbeddingModel(): Promise<{
    id: number;
    provider: string;
    model: string;
    dimensions: number;
  } | null>;
  chunksToEmbed(
    documentId: string,
    modelId: number,
    limit: number,
  ): Promise<{ chunkId: string; content: string }[]>;
  saveEmbeddings(
    documentId: string,
    modelId: number,
    items: { chunkId: string; embedding: number[] }[],
  ): Promise<number>;
}

export interface JobQueue {
  claim(kind: string, worker: string, limit: number, leaseSeconds: number): Promise<Job[]>;
  complete(jobId: number, worker: string): Promise<void>;
  /** Returns the job's new state: 'queued' (will retry) or 'dead'. */
  fail(
    jobId: number,
    worker: string,
    error: string,
    retryable: boolean,
  ): Promise<'queued' | 'dead' | null>;
  heartbeat(details: Record<string, unknown>): Promise<void>;
}

export type Reporter = (error: unknown, context: Record<string, unknown>) => void;

/** Reads the text in a photo (Claude vision), charging the user's OCR quota. */
export type OcrFn = (input: {
  userId: string;
  image: Uint8Array;
  mimeType: string;
}) => Promise<string>;

/** Optional AI services; each is null when its API key is not configured. */
export type AiServices = { ocr: OcrFn | null; embeddings: EmbeddingProvider | null };
