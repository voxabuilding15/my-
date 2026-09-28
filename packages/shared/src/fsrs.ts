/**
 * FSRS-5 spaced-repetition scheduler (Free Spaced Repetition Scheduler, default parameters).
 * Pure and deterministic: the app computes the next review, the database stores the result
 * (flashcards.state/due_at/stability/difficulty — see review_flashcard()).
 */

export const FLASHCARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type FlashcardState = (typeof FLASHCARD_STATES)[number];

/** 1 = Again ("don't know"), 2 = Hard, 3 = Good ("know"), 4 = Easy. */
export type Rating = 1 | 2 | 3 | 4;

export type CardSchedule = {
  state: FlashcardState;
  stability: number | null;
  difficulty: number | null;
  dueAt: Date;
  lastReviewedAt: Date | null;
};

export type ReviewResult = CardSchedule & { scheduledDays: number };

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;
const w = (i: number): number => W[i] ?? 0;

const DECAY = -0.5;
const FACTOR = 19 / 81;
export const DESIRED_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 36500;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Short re-show delays within a session before a card (re)graduates. */
const STEP_MINUTES = { again: 1, hard: 6, relearn: 10 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Probability of recall after `elapsedDays` for a memory of the given stability. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

export function intervalDays(stability: number, retention = DESIRED_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

const initialStability = (rating: Rating) => Math.max(w(rating - 1), 0.1);
const initialDifficulty = (rating: Rating) =>
  clamp(w(4) - Math.exp(w(5) * (rating - 1)) + 1, 1, 10);

function nextDifficulty(difficulty: number, rating: Rating): number {
  const delta = -w(6) * (rating - 3);
  const damped = difficulty + (delta * (10 - difficulty)) / 9;
  // Mean reversion toward the difficulty of an "Easy" first answer keeps cards from sticking at 10.
  return clamp(w(7) * initialDifficulty(4) + (1 - w(7)) * damped, 1, 10);
}

function recallStability(d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? w(15) : 1;
  const easyBonus = rating === 4 ? w(16) : 1;
  return (
    s *
    (Math.exp(w(8)) *
      (11 - d) *
      Math.pow(s, -w(9)) *
      (Math.exp(w(10) * (1 - r)) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
}

function forgetStability(d: number, s: number, r: number): number {
  const next =
    w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  return Math.min(next, s);
}

/** Same-day re-review (learning steps): FSRS-5 short-term stability update. */
const shortTermStability = (s: number, rating: Rating) =>
  s * Math.exp(w(17) * (rating - 3 + w(18)));

export function scheduleReview(card: CardSchedule, rating: Rating, now: Date): ReviewResult {
  const at = (ms: number) => new Date(now.getTime() + ms);

  if (card.state === 'new' || card.stability === null || card.difficulty === null) {
    const stability = initialStability(rating);
    const difficulty = initialDifficulty(rating);
    if (rating === 1)
      return {
        state: 'learning',
        stability,
        difficulty,
        dueAt: at(STEP_MINUTES.again * MINUTE_MS),
        lastReviewedAt: now,
        scheduledDays: 0,
      };
    if (rating === 2)
      return {
        state: 'learning',
        stability,
        difficulty,
        dueAt: at(STEP_MINUTES.hard * MINUTE_MS),
        lastReviewedAt: now,
        scheduledDays: 0,
      };
    const days = intervalDays(stability);
    return {
      state: 'review',
      stability,
      difficulty,
      dueAt: at(days * DAY_MS),
      lastReviewedAt: now,
      scheduledDays: days,
    };
  }

  const difficulty = nextDifficulty(card.difficulty, rating);
  const elapsedDays = card.lastReviewedAt
    ? Math.max(0, (now.getTime() - card.lastReviewedAt.getTime()) / DAY_MS)
    : 0;

  if (card.state === 'learning' || card.state === 'relearning' || elapsedDays < 1) {
    const stability = Math.max(0.1, shortTermStability(card.stability, rating));
    if (rating === 1) {
      return {
        state: card.state === 'review' ? 'relearning' : card.state,
        stability,
        difficulty,
        dueAt: at(STEP_MINUTES.again * MINUTE_MS),
        lastReviewedAt: now,
        scheduledDays: 0,
      };
    }
    if (rating === 2 && card.state !== 'review') {
      return {
        state: card.state,
        stability,
        difficulty,
        dueAt: at(STEP_MINUTES.hard * MINUTE_MS),
        lastReviewedAt: now,
        scheduledDays: 0,
      };
    }
    const days = intervalDays(stability);
    return {
      state: 'review',
      stability,
      difficulty,
      dueAt: at(days * DAY_MS),
      lastReviewedAt: now,
      scheduledDays: days,
    };
  }

  const r = retrievability(elapsedDays, card.stability);
  if (rating === 1) {
    const stability = Math.max(0.1, forgetStability(card.difficulty, card.stability, r));
    return {
      state: 'relearning',
      stability,
      difficulty,
      dueAt: at(STEP_MINUTES.relearn * MINUTE_MS),
      lastReviewedAt: now,
      scheduledDays: 0,
    };
  }
  const stability = recallStability(card.difficulty, card.stability, r, rating);
  const days = intervalDays(stability);
  return {
    state: 'review',
    stability,
    difficulty,
    dueAt: at(days * DAY_MS),
    lastReviewedAt: now,
    scheduledDays: days,
  };
}

/** What each answer would schedule — shown under the buttons ("<1 min", "3 d"). */
export function previewReview(card: CardSchedule, now: Date): Record<Rating, ReviewResult> {
  return {
    1: scheduleReview(card, 1, now),
    2: scheduleReview(card, 2, now),
    3: scheduleReview(card, 3, now),
    4: scheduleReview(card, 4, now),
  };
}

export const newCardSchedule = (now: Date): CardSchedule => ({
  state: 'new',
  stability: null,
  difficulty: null,
  dueAt: now,
  lastReviewedAt: null,
});
