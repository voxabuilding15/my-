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

export const SUPPORTED_MIME_TYPES = Object.keys(MIME_TO_KIND);

export function documentKindFromMime(mime: string): DocumentKind | null {
  return MIME_TO_KIND[mime.toLowerCase()] ?? null;
}

export const bytesToMb = (bytes: number): number => bytes / (1024 * 1024);
