import type { DocumentKind } from '@studexa/shared';

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export type DocumentSummary = {
  id: string;
  title: string;
  kind: DocumentKind;
  sizeBytes: number;
  pageCount: number;
  status: DocumentStatus;
  isFavorite: boolean;
  /** Last page read (1-based), null before first open. */
  lastPage: number | null;
  lastOpenedAt: string | null;
  createdAt: string;
};

export type DocumentPage = { number: number; text: string };

export type Bookmark = {
  id: string;
  documentId: string;
  documentTitle: string;
  page: number;
  label: string | null;
  createdAt: string;
};

export type UploadSource = 'file' | 'camera' | 'gallery';
export type UploadInput = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
  source: UploadSource;
};

export type DocumentSort = 'recent' | 'name' | 'size';
export type DocumentFilter = 'all' | 'favorites' | DocumentKind;

/** Progress through a document in [0, 1]. */
export const readingProgress = (doc: DocumentSummary): number =>
  doc.lastPage && doc.pageCount > 0 ? Math.min(1, doc.lastPage / doc.pageCount) : 0;

export function filterDocuments(
  documents: readonly DocumentSummary[],
  { query, filter, sort }: { query: string; filter: DocumentFilter; sort: DocumentSort },
): DocumentSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  const matches = documents.filter(
    (doc) =>
      (!needle || doc.title.toLocaleLowerCase().includes(needle)) &&
      (filter === 'all' || (filter === 'favorites' ? doc.isFavorite : doc.kind === filter)),
  );
  const byRecent = (doc: DocumentSummary) => doc.lastOpenedAt ?? doc.createdAt;
  return [...matches].sort((a, b) =>
    sort === 'name'
      ? a.title.localeCompare(b.title)
      : sort === 'size'
        ? b.sizeBytes - a.sizeBytes
        : byRecent(b).localeCompare(byRecent(a)),
  );
}
