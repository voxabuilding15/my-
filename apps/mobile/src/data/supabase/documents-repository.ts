import {
  AppError,
  type CompleteUploadResponse,
  type CreateUploadResponse,
  type DocumentKind,
  documentKindFromMime,
} from '@studexa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Bookmark,
  DocumentPage,
  DocumentStatus,
  DocumentSummary,
  UploadInput,
} from '@/features/documents/domain/document';
import type { DocumentsRepository } from '@/features/documents/domain/documents-repository';
import {
  type PendingUpload,
  type PendingUploads,
  pendingUploads,
} from '@/core/upload/pending-uploads';

import { check, currentUserId, unwrap } from './postgrest';

type DocumentRow = {
  id: string;
  title: string;
  kind: DocumentKind;
  size_bytes: number;
  page_count: number | null;
  status: 'pending_upload' | DocumentStatus;
  is_favorite: boolean;
  last_page: number | null;
  last_opened_at: string | null;
  created_at: string;
};

const DOCUMENT_COLUMNS =
  'id, title, kind, size_bytes, page_count, status, is_favorite, last_page, last_opened_at, created_at';

const toSummary = (row: DocumentRow): DocumentSummary => ({
  id: row.id,
  title: row.title,
  kind: row.kind,
  sizeBytes: row.size_bytes,
  pageCount: row.page_count ?? 0,
  // An upload that is still being confirmed is shown as processing.
  status: row.status === 'pending_upload' ? 'processing' : row.status,
  isFavorite: row.is_favorite,
  lastPage: row.last_page,
  lastOpenedAt: row.last_opened_at,
  createdAt: row.created_at,
});

export type PutFileInput = {
  path: string;
  token: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
  /** Continue an interrupted upload. */
  uploadUrl?: string | null;
  onState?: (state: { uploadUrl: string; offset: number }) => void;
  signal?: AbortSignal;
};

export type DocumentUploadTransport = {
  invoke<T>(body: Record<string, unknown>): Promise<T>;
  /** Resumable upload to the signed slot, read from disk chunk by chunk. */
  putFile(input: PutFileInput): Promise<void>;
  /** On-device OCR for photos ('' when the device can't read it). */
  readImageText(uri: string): Promise<string>;
};

export class SupabaseDocumentsRepository implements DocumentsRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly transport: DocumentUploadTransport,
    private readonly pending: PendingUploads = pendingUploads,
  ) {}

  async list() {
    const rows = unwrap(
      await this.client
        .from('documents')
        .select(DOCUMENT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(500),
    ) as DocumentRow[];
    return rows.map(toSummary);
  }

  async get(id: string) {
    const row = unwrap(
      await this.client.from('documents').select(DOCUMENT_COLUMNS).eq('id', id).single(),
    ) as DocumentRow;
    return toSummary(row);
  }

  async pages(id: string): Promise<DocumentPage[]> {
    const rows = unwrap(
      await this.client
        .from('document_pages')
        .select('page_number, content')
        .eq('document_id', id)
        .order('page_number'),
    ) as { page_number: number; content: string }[];
    return rows.map((row) => ({ number: row.page_number, text: row.content }));
  }

  async upload(input: UploadInput) {
    const title = input.name.replace(/\.[a-z0-9]+$/i, '').trim() || 'Untitled';
    const slot = await this.transport.invoke<CreateUploadResponse>({
      action: 'create',
      title,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    const upload: PendingUpload = {
      userId: await currentUserId(this.client),
      documentId: slot.documentId,
      path: slot.path,
      token: slot.token,
      uri: input.uri,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadUrl: null,
      offset: 0,
      createdAt: Date.now(),
    };
    // Saved before the transfer starts, so a crash at any point can be resumed.
    this.pending.save(upload);
    await this.finish(upload);
    return this.get(slot.documentId);
  }

  /**
   * Continues uploads interrupted by a lost connection or a closed app. Called at start-up and
   * when the connection comes back. Returns how many documents were completed.
   */
  async resumePendingUploads(): Promise<number> {
    const userId = await currentUserId(this.client).catch(() => null);
    if (!userId) return 0;
    let completed = 0;
    for (const upload of this.pending.list(userId)) {
      try {
        await this.finish(upload);
        completed++;
      } catch (error) {
        // Still offline: keep it for next time. Anything else was dropped by finish().
        if (error instanceof AppError && error.code === 'network') break;
      }
    }
    return completed;
  }

  private async finish(upload: PendingUpload): Promise<void> {
    try {
      await this.transport.putFile({
        path: upload.path,
        token: upload.token,
        uri: upload.uri,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        uploadUrl: upload.uploadUrl,
        onState: ({ uploadUrl, offset }) =>
          this.pending.progress(upload.documentId, uploadUrl, offset),
      });
      const ocrText =
        documentKindFromMime(upload.mimeType) === 'image'
          ? await this.transport.readImageText(upload.uri)
          : '';
      await this.complete(upload.documentId, ocrText);
      this.pending.remove(upload.documentId);
    } catch (error) {
      // Only a lost connection is worth resuming; an expired slot or a rejected file is final.
      if (!(error instanceof AppError && error.code === 'network')) {
        this.pending.remove(upload.documentId);
      }
      throw error;
    }
  }

  /** Confirming is idempotent, so transient failures are retried. */
  private async complete(documentId: string, ocrText: string, attempts = 3): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.transport.invoke<CompleteUploadResponse>({
          action: 'complete',
          documentId,
          ...(ocrText ? { ocrText } : {}),
        });
        return;
      } catch (error) {
        const retryable = error instanceof AppError && error.code === 'network';
        if (!retryable || attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }

  async rename(id: string, title: string) {
    check(await this.client.from('documents').update({ title: title.trim() }).eq('id', id));
  }

  async setFavorite(id: string, favorite: boolean) {
    check(await this.client.from('documents').update({ is_favorite: favorite }).eq('id', id));
  }

  async remove(id: string) {
    // Pages, chunks, chats and bookmarks cascade; the file is queued for deletion.
    check(await this.client.from('documents').delete().eq('id', id));
  }

  async recordProgress(id: string, page: number) {
    check(
      await this.client
        .from('documents')
        .update({ last_page: page, last_opened_at: new Date().toISOString() })
        .eq('id', id),
    );
  }

  async bookmarks(documentId?: string): Promise<Bookmark[]> {
    let query = this.client
      .from('bookmarks')
      .select('id, document_id, page_number, label, created_at, documents(title)')
      .order('created_at', { ascending: false });
    if (documentId) query = query.eq('document_id', documentId);
    const rows = unwrap(await query) as unknown as {
      id: string;
      document_id: string;
      page_number: number;
      label: string | null;
      created_at: string;
      documents: { title: string } | null;
    }[];
    return rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentTitle: row.documents?.title ?? '',
      page: row.page_number,
      label: row.label,
      createdAt: row.created_at,
    }));
  }

  async toggleBookmark(documentId: string, page: number) {
    const userId = await currentUserId(this.client);
    const removed = unwrap(
      await this.client
        .from('bookmarks')
        .delete()
        .eq('document_id', documentId)
        .eq('page_number', page)
        .select('id'),
    ) as { id: string }[];
    if (removed.length > 0) return false;
    check(
      await this.client
        .from('bookmarks')
        .insert({ user_id: userId, document_id: documentId, page_number: page }),
    );
    return true;
  }
}
