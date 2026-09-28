import { z } from 'zod';

export const DOCUMENT_KINDS = ['pdf', 'docx', 'txt', 'image'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const MIME_TO_KIND: Readonly<Record<string, DocumentKind>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
};

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const SUPPORTED_MIME_TYPES = Object.keys(MIME_TO_KIND);

export function extensionForMime(mime: string): string | null {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? null;
}

/** Hard ceiling (the storage bucket limit); plan limits are usually lower. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// document-upload Edge Function contract
export const createUploadRequestSchema = z.object({
  action: z.literal('create'),
  title: z.string().trim().min(1).max(200),
  mimeType: z
    .string()
    .refine((mime) => documentKindFromMime(mime) !== null, 'unsupported_file_type'),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export const completeUploadRequestSchema = z.object({
  action: z.literal('complete'),
  documentId: z.uuid(),
  /** Photos: text already read on the device (ML Kit). Saved directly — no server OCR, no quota. */
  ocrText: z.string().max(100_000).optional(),
});

/** Below this, on-device OCR is considered to have failed and the photo goes to server OCR. */
export const MIN_ON_DEVICE_OCR_CHARS = 20;
export const documentUploadRequestSchema = z.discriminatedUnion('action', [
  createUploadRequestSchema,
  completeUploadRequestSchema,
]);
export type DocumentUploadRequest = z.infer<typeof documentUploadRequestSchema>;

export type CreateUploadResponse = {
  documentId: string;
  /** Storage object path; upload with `uploadToSignedUrl(path, token, file)`. */
  path: string;
  token: string;
};
export type CompleteUploadResponse = {
  status: 'queued' | 'already_processing' | 'already_ready' | 'ready';
};

export function documentKindFromMime(mime: string): DocumentKind | null {
  return MIME_TO_KIND[mime.toLowerCase()] ?? null;
}

export const bytesToMb = (bytes: number): number => bytes / (1024 * 1024);
