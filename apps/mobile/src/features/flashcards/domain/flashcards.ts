import type { CardSchedule, Rating, ReviewResult } from '@studexa/shared';

export type Deck = {
  id: string;
  title: string;
  documentId: string | null;
  cardCount: number;
  dueCount: number;
  newCount: number;
};

export type Flashcard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  schedule: CardSchedule;
};

export type ReviewInput = {
  cardId: string;
  rating: Rating;
  result: ReviewResult;
  durationMs: number;
};

export interface FlashcardsRepository {
  decks(): Promise<Deck[]>;
  /** Cards due now (including new), in review order; all decks when deckId is omitted. */
  dueCards(deckId?: string): Promise<Flashcard[]>;
  review(input: ReviewInput): Promise<void>;
}
