import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DocumentSummary, UploadInput } from '../../domain/document';
import { useDocumentsRepository } from '../../repository';

export const documentKeys = {
  all: ['documents'] as const,
  detail: (id: string) => ['documents', id] as const,
  pages: (id: string) => ['documents', id, 'pages'] as const,
  bookmarks: (documentId?: string) => ['bookmarks', documentId ?? 'all'] as const,
};

export function useDocuments() {
  const repository = useDocumentsRepository();
  return useQuery({ queryKey: documentKeys.all, queryFn: () => repository.list() });
}

export function useDocument(id: string) {
  const repository = useDocumentsRepository();
  const client = useQueryClient();
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => repository.get(id),
    // Instant render from the list cache while the detail loads.
    placeholderData: () =>
      client.getQueryData<DocumentSummary[]>(documentKeys.all)?.find((d) => d.id === id),
  });
}

export function useDocumentPages(id: string) {
  const repository = useDocumentsRepository();
  return useQuery({
    queryKey: documentKeys.pages(id),
    queryFn: () => repository.pages(id),
    staleTime: Infinity,
  });
}

export function useBookmarks(documentId?: string) {
  const repository = useDocumentsRepository();
  return useQuery({
    queryKey: documentKeys.bookmarks(documentId),
    queryFn: () => repository.bookmarks(documentId),
  });
}

export function useDocumentMutations() {
  const repository = useDocumentsRepository();
  const client = useQueryClient();
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: documentKeys.all }),
      client.invalidateQueries({ queryKey: ['bookmarks'] }),
    ]);

  const setFavorite = useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      repository.setFavorite(id, favorite),
    // Optimistic: the star flips immediately and rolls back on failure.
    onMutate: async ({ id, favorite }) => {
      await client.cancelQueries({ queryKey: documentKeys.all });
      const previous = client.getQueryData<DocumentSummary[]>(documentKeys.all);
      client.setQueryData<DocumentSummary[]>(documentKeys.all, (docs) =>
        docs?.map((d) => (d.id === id ? { ...d, isFavorite: favorite } : d)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => client.setQueryData(documentKeys.all, context?.previous),
    onSettled: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => repository.rename(id, title),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => repository.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['conversations'] }),
    onSettled: invalidate,
  });

  const upload = useMutation({
    mutationFn: (input: UploadInput) => repository.upload(input),
    onSettled: invalidate,
  });

  const toggleBookmark = useMutation({
    mutationFn: ({ id, page }: { id: string; page: number }) => repository.toggleBookmark(id, page),
    onSettled: () => client.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  const recordProgress = useMutation({
    mutationFn: ({ id, page }: { id: string; page: number }) => repository.recordProgress(id, page),
    onSettled: () => client.invalidateQueries({ queryKey: documentKeys.all }),
  });

  return { setFavorite, rename, remove, upload, toggleBookmark, recordProgress };
}
