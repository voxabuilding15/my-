import type { Bookmark, DocumentPage, DocumentSummary, UploadInput } from './document';

export interface DocumentsRepository {
  list(): Promise<DocumentSummary[]>;
  get(id: string): Promise<DocumentSummary>;
  pages(id: string): Promise<DocumentPage[]>;
  upload(input: UploadInput): Promise<DocumentSummary>;
  rename(id: string, title: string): Promise<void>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  recordProgress(id: string, page: number): Promise<void>;
  bookmarks(documentId?: string): Promise<Bookmark[]>;
  /** Returns whether the page is bookmarked afterwards. */
  toggleBookmark(documentId: string, page: number): Promise<boolean>;
}
