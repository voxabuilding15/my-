import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from './config.ts';
import type { DocumentStore, JobQueue, ProcessingDocument } from './ports.ts';

const BUCKET = 'documents';

async function rpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} failed: ${error.message}`);
  return data as T;
}

export function createServiceClient(config: Config): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type DocumentRow = {
  document_id: string;
  user_id: string;
  kind: ProcessingDocument['kind'];
  storage_path: string;
  status: ProcessingDocument['status'];
  max_pages: number | null;
  full_context_max_tokens: number;
  chunk_target_tokens: number;
  chunk_overlap_tokens: number;
};

export function createDocumentStore(client: SupabaseClient): DocumentStore {
  return {
    async get(documentId) {
      const rows = await rpc<DocumentRow[]>(client, 'get_document_for_processing', {
        p_document_id: documentId,
      });
      const row = rows[0];
      if (!row) return null;
      return {
        documentId: row.document_id,
        userId: row.user_id,
        kind: row.kind,
        storagePath: row.storage_path,
        status: row.status,
        maxPages: row.max_pages,
        fullContextMaxTokens: row.full_context_max_tokens,
        chunkTargetTokens: row.chunk_target_tokens,
        chunkOverlapTokens: row.chunk_overlap_tokens,
      };
    },
    async download(path) {
      const { data, error } = await client.storage.from(BUCKET).download(path);
      if (error) throw new Error(`download failed: ${error.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    reuse: (documentId, sha256) =>
      rpc<boolean>(client, 'reuse_document_extraction', {
        p_document_id: documentId,
        p_content_sha256: sha256,
      }),
    async save(documentId, extraction) {
      await rpc(client, 'save_document_extraction', {
        p_document_id: documentId,
        p_pages: extraction.pages,
        p_chunks: extraction.chunks,
        p_token_count: extraction.tokenCount,
        p_language: extraction.language ?? '',
        p_ts_config: extraction.tsConfig,
        p_retrieval_mode: extraction.retrievalMode,
        p_extraction_version: extraction.extractionVersion,
      });
    },
    async markFailed(documentId, errorCode) {
      await rpc(client, 'mark_document_failed', {
        p_document_id: documentId,
        p_error_code: errorCode,
      });
    },
  };
}

export function createJobQueue(
  client: SupabaseClient,
  service: string,
  instance: string,
  version: string,
): JobQueue {
  return {
    claim: (kind, worker, limit, leaseSeconds) =>
      rpc(client, 'claim_jobs', {
        p_kind: kind,
        p_worker: worker,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      }),
    async complete(jobId, worker) {
      await rpc(client, 'complete_job', { p_job_id: jobId, p_worker: worker });
    },
    fail: (jobId, worker, error, retryable) =>
      rpc(client, 'fail_job', {
        p_job_id: jobId,
        p_worker: worker,
        p_error: error.slice(0, 2000),
        p_retryable: retryable,
      }),
    async heartbeat(details) {
      await rpc(client, 'record_heartbeat', {
        p_service: service,
        p_instance: instance,
        p_version: version,
        p_details: details,
      });
    },
  };
}
