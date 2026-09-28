import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NoteDraft } from '../../domain/note';
import { useNotesRepository } from '../../repository';

export const noteKeys = { all: ['notes'] as const, detail: (id: string) => ['notes', id] as const };

export function useNotes() {
  const repository = useNotesRepository();
  return useQuery({ queryKey: noteKeys.all, queryFn: () => repository.list() });
}

export function useNote(id: string | null) {
  const repository = useNotesRepository();
  return useQuery({
    queryKey: noteKeys.detail(id ?? 'new'),
    queryFn: () => repository.get(id ?? ''),
    enabled: id !== null,
  });
}

export function useNoteMutations() {
  const repository = useNotesRepository();
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: noteKeys.all });
  const save = useMutation({
    mutationFn: (draft: NoteDraft) => repository.save(draft),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => repository.remove(id),
    onSettled: invalidate,
  });
  return { save, remove };
}

/** Save a note from anywhere (e.g. "Save as note" on an AI result). */
export function useSaveNote() {
  return useNoteMutations().save;
}
