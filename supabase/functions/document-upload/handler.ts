import {
  type AppErrorCode,
  type CompleteUploadResponse,
  type CreateUploadResponse,
  type DocumentKind,
  documentKindFromMime,
  documentUploadRequestSchema,
  extensionForMime,
  MIN_ON_DEVICE_OCR_CHARS,
} from '@studexa/shared';

import { HttpError } from '../_shared/errors.ts';
import { json, parseBody } from '../_shared/http.ts';

export type UploadSlot =
  { allowed: true; documentId: string; storagePath: string } | { allowed: false; reason: string };

export type UploadedDocument = {
  userId: string;
  kind: DocumentKind;
  status: 'pending_upload' | 'processing' | 'ready' | 'failed';
  storagePath: string;
  sizeBytes: number;
};

export interface DocumentUploadDeps {
  getCallerId(req: Request): Promise<string | null>;
  rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  createUpload(input: {
    userId: string;
    title: string;
    kind: DocumentKind;
    mimeType: string;
    sizeBytes: number;
    extension: string;
  }): Promise<UploadSlot>;
  createSignedUploadUrl(path: string): Promise<{ token: string }>;
  getDocument(documentId: string): Promise<UploadedDocument | null>;
  /** Size of the stored object, or null when nothing was uploaded. */
  objectSize(path: string): Promise<number | null>;
  rejectUpload(documentId: string, path: string, errorCode: string): Promise<void>;
  queueProcessing(documentId: string, userId: string): Promise<CompleteUploadResponse['status']>;
  /** Saves text read on the device as the document's single page. */
  saveDeviceText(documentId: string, text: string): Promise<void>;
  /** Best effort nudge; the scheduled worker run picks the job up otherwise. */
  wakeWorker(): void;
}

const REJECTIONS: Record<string, AppErrorCode> = {
  email_unverified: 'email_unverified',
  file_too_large: 'file_too_large',
  storage_full: 'storage_full',
  quota_exceeded: 'quota_exceeded',
};

export function createDocumentUploadHandler(deps: DocumentUploadDeps) {
  return async function handle(req: Request): Promise<Response> {
    const userId = await deps.getCallerId(req);
    if (!userId) throw new HttpError('unauthenticated', 'Sign in first');
    if (!(await deps.rateLimit(`document_upload:${userId}`, 30, 3600))) {
      throw new HttpError('rate_limited', 'Too many uploads, try again later');
    }

    const body = await parseBody(req, documentUploadRequestSchema);

    if (body.action === 'create') {
      const kind = documentKindFromMime(body.mimeType);
      const extension = extensionForMime(body.mimeType);
      if (!kind || !extension) throw new HttpError('unsupported_file_type');

      const slot = await deps.createUpload({
        userId,
        title: body.title,
        kind,
        mimeType: body.mimeType.toLowerCase(),
        sizeBytes: body.sizeBytes,
        extension,
      });
      if (!slot.allowed) {
        throw new HttpError(REJECTIONS[slot.reason] ?? 'forbidden', slot.reason);
      }
      const { token } = await deps.createSignedUploadUrl(slot.storagePath);
      const response: CreateUploadResponse = {
        documentId: slot.documentId,
        path: slot.storagePath,
        token,
      };
      return json(response, 201);
    }

    const document = await deps.getDocument(body.documentId);
    if (!document || document.userId !== userId) throw new HttpError('not_found');

    if (document.status === 'pending_upload' || document.status === 'failed') {
      const size = await deps.objectSize(document.storagePath);
      if (size === null) throw new HttpError('validation_failed', 'The file has not been uploaded');
      // Quotas were checked against the declared size: a larger file would bypass them.
      if (size > document.sizeBytes) {
        await deps.rejectUpload(body.documentId, document.storagePath, 'size_mismatch');
        throw new HttpError('file_too_large', 'The uploaded file is larger than declared');
      }
    }

    const deviceText = body.ocrText?.trim() ?? '';
    if (
      document.kind === 'image' &&
      document.status === 'pending_upload' &&
      deviceText.length >= MIN_ON_DEVICE_OCR_CHARS
    ) {
      await deps.saveDeviceText(body.documentId, deviceText);
      return json({ status: 'ready' } satisfies CompleteUploadResponse);
    }

    const status = await deps.queueProcessing(body.documentId, userId);
    if (status === 'queued') deps.wakeWorker();
    const response: CompleteUploadResponse = { status };
    return json(response);
  };
}
