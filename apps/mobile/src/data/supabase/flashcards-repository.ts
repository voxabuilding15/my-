import type { FlashcardState } from '@studexa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Deck,
  Flashcard,
  FlashcardsRepository,
  ReviewInput,
} from '@/features/flashcards/domain/flashcards';

import { check, unwrap } from './postgrest';

/** Cards fetched per study session; more are loaded on the next session. */
const SESSION_LIMIT = 200;

type CardRow = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  state: FlashcardState;
  due_at: string;
  stability: number | null;
  difficulty: number | null;
  last_reviewed_at: string | null;
};

export class SupabaseFlashcardsRepository implements FlashcardsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async decks(): Promise<Deck[]> {
    const rows = unwrap(await this.client.rpc('list_my_decks')) as {
      id: string;
      title: string;
      document_id: string | null;
      card_count: number;
      due_count: number;
      new_count: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      documentId: row.document_id,
      cardCount: row.card_count,
      dueCount: row.due_count,
      newCount: row.new_count,
    }));
  }

  async dueCards(deckId?: string): Promise<Flashcard[]> {
    let query = this.client
      .from('flashcards')
      .select('id, deck_id, front, back, state, due_at, stability, difficulty, last_reviewed_at')
      .lte('due_at', new Date().toISOString())
      .order('due_at')
      .limit(SESSION_LIMIT);
    if (deckId) query = query.eq('deck_id', deckId);
    const rows = unwrap(await query) as CardRow[];
    const cards = rows.map((row): Flashcard => ({
      id: row.id,
      deckId: row.deck_id,
      front: row.front,
      back: row.back,
      schedule: {
        state: row.state,
        stability: row.stability,
        difficulty: row.difficulty,
        dueAt: new Date(row.due_at),
        lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
      },
    }));
    // Due reviews first (most overdue first), then new cards — same order as the demo backend.
    return cards.sort(
      (a, b) =>
        Number(a.schedule.state === 'new') - Number(b.schedule.state === 'new') ||
        a.schedule.dueAt.getTime() - b.schedule.dueAt.getTime(),
    );
  }

  async review({ cardId, rating, result, durationMs }: ReviewInput) {
    check(
      await this.client.rpc('review_flashcard', {
        p_card_id: cardId,
        p_rating: rating,
        p_next_state: result.state,
        p_due_at: result.dueAt.toISOString(),
        p_stability: result.stability,
        p_difficulty: result.difficulty,
        p_scheduled_days: result.scheduledDays,
        p_duration_ms: Math.round(durationMs),
      }),
    );
  }
}
