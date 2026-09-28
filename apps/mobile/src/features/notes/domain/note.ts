export type Note = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  documentId: string | null;
  source: 'manual' | 'ai';
  updatedAt: string;
};

export type NoteDraft = Pick<Note, 'title' | 'content' | 'isPinned'> & {
  id?: string;
  documentId?: string | null;
};

/** Pinned first, then most recently edited; matches title or body. */
export function sortAndFilterNotes(notes: readonly Note[], query: string): Note[] {
  const needle = query.trim().toLocaleLowerCase();
  return notes
    .filter(
      (note) => !needle || `${note.title}\n${note.content}`.toLocaleLowerCase().includes(needle),
    )
    .sort(
      (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt),
    );
}

export interface NotesRepository {
  list(): Promise<Note[]>;
  get(id: string): Promise<Note>;
  save(draft: NoteDraft): Promise<Note>;
  remove(id: string): Promise<void>;
}
