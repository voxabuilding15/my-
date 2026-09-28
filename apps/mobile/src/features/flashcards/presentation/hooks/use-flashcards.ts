import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DeckOptions, ReviewInput } from '../../domain/flashcards';
import { useFlashcardsRepository } from '../../repository';

export const flashcardKeys = {
  decks: ['decks'] as const,
  due: (deckId?: string) => ['decks', deckId ?? 'all', 'due'] as const,
};

export function useDecks() {
  const repository = useFlashcardsRepository();
  return useQuery({ queryKey: flashcardKeys.decks, queryFn: () => repository.decks() });
}

/** A review session's queue: loaded once, so answering doesn't reshuffle the session. */
export function useDueCards(deckId?: string) {
  const repository = useFlashcardsRepository();
  return useQuery({
    queryKey: flashcardKeys.due(deckId),
    queryFn: () => repository.dueCards(deckId),
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useReviewCard() {
  const repository = useFlashcardsRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => repository.review(input),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: flashcardKeys.decks, exact: true }),
        client.invalidateQueries({ queryKey: ['progress'] }),
      ]),
  });
}

/** Generates a flashcard deck from a document with AI. */
export function useGenerateDeck() {
  const repository = useFlashcardsRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, ...options }: { documentId: string } & DeckOptions) =>
      repository.generate(documentId, options),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: flashcardKeys.decks }),
        client.invalidateQueries({ queryKey: ['subscription'] }),
      ]),
  });
}
