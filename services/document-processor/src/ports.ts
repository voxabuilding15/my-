import type { DocumentKind } from '@studexa/shared';

import type { Chunk, Page } from './text/chunk.ts';

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
