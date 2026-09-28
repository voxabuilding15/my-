import { chunkPages, detectLanguage, estimateTokens, normalizeText } from '@studexa/shared';

import { runInBackground } from '../_shared/background.ts';
import { getDocumentsEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { createAdminClient, getUser, rateLimit, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { createDocumentUploadHandler, type UploadedDocument } from './handler.ts';

const env = getDocumentsEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);
const BUCKET = 'documents';

type SlotRow = {
  allowed: boolean;
  reason: string | null;
  document_id: string;
  storage_path: string;
};

const handler = createDocumentUploadHandler({
  async getCallerId(req) {
    return (await getUser(admin, req))?.user.id ?? null;
  },
  rateLimit: (key, max, windowSeconds) => rateLimit(admin, key, max, windowSeconds),
  async createUpload(input) {
    const rows = await rpc<SlotRow[]>(admin, 'create_document_upload', {
      p_user_id: input.userId,
      p_title: input.title,
      p_kind: input.kind,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_extension: input.extension,
    });
    const row = rows[0];
    if (!row?.allowed) return { allowed: false, reason: row?.reason ?? 'forbidden' };
    return { allowed: true, documentId: row.document_id, storagePath: row.storage_path };
  },
  async createSignedUploadUrl(path) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return { token: data.token };
  },
  async getDocument(documentId) {
    const { data, error } = await admin
      .from('documents')
      .select('user_id, kind, status, storage_path, size_bytes')
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      kind: data.kind,
      status: data.status,
      storagePath: data.storage_path,
      sizeBytes: data.size_bytes,
    } satisfies UploadedDocument;
  },
  async objectSize(path) {
    const slash = path.lastIndexOf('/');
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
    if (error) throw error;
    const size = data[0]?.metadata?.size;
    return typeof size === 'number' ? size : null;
  },
  async rejectUpload(documentId, path, errorCode) {
    await admin.storage.from(BUCKET).remove([path]);
    await rpc(admin, 'mark_document_failed', {
      p_document_id: documentId,
      p_error_code: errorCode,
    });
  },
  async saveDeviceText(documentId, text) {
    const clean = normalizeText(text);
    const { tsConfig, language } = detectLanguage(clean);
    const pages = [{ number: 1, text: clean, ocr: true }];
    await rpc(admin, 'save_document_extraction', {
      p_document_id: documentId,
      p_pages: pages,
      p_chunks: chunkPages(pages, 800, 120),
      p_token_count: estimateTokens(clean),
      p_language: language ?? '',
      p_ts_config: tsConfig,
      p_retrieval_mode: 'full_context',
      p_extraction_version: 1,
    });
  },
  queueProcessing: (documentId, userId) =>
    rpc(admin, 'queue_document_processing', { p_document_id: documentId, p_user_id: userId }),
  wakeWorker() {
    if (!env.DOCUMENT_PROCESSOR_URL || !env.WORKER_SECRET) return;
    runInBackground(
      fetch(new URL('/work', env.DOCUMENT_PROCESSOR_URL), {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WORKER_SECRET}` },
        signal: AbortSignal.timeout(5000),
      }).then((res) => res.body?.cancel()),
    );
  },
});

Deno.serve(withHttp('document-upload', handler));
