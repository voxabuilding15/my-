import { describe, expect, it } from 'vitest';

import {
  intervalDays,
  newCardSchedule,
  previewReview,
  retrievability,
  scheduleReview,
  type CardSchedule,
} from './fsrs.ts';

const NOW = new Date('2026-09-28T10:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function reviewChain(ratings: (1 | 2 | 3 | 4)[], gapFactor = 1) {
  let card: CardSchedule = newCardSchedule(NOW);
  let clock = NOW;
  const intervals: number[] = [];
  for (const rating of ratings) {
    const result = scheduleReview(card, rating, clock);
    intervals.push(result.scheduledDays);
    card = result;
    clock = new Date(result.dueAt.getTime() * gapFactor + clock.getTime() * (1 - gapFactor));
  }
  return { card, intervals };
}

describe('FSRS', () => {
  it('retention is 90% exactly one interval after review', () => {
    expect(retrievability(intervalDays(10), 10)).toBeCloseTo(0.9, 2);
    expect(retrievability(0, 5)).toBe(1);
  });

  it('a new card answered "know" graduates to review in a few days', () => {
    const result = scheduleReview(newCardSchedule(NOW), 3, NOW);
    expect(result.state).toBe('review');
    expect(result.scheduledDays).toBe(3);
    expect(result.dueAt).toEqual(days(3));
  });

  it('a new card answered "don\'t know" comes back within minutes', () => {
    const result = scheduleReview(newCardSchedule(NOW), 1, NOW);
    expect(result.state).toBe('learning');
    expect(result.scheduledDays).toBe(0);
    expect(result.dueAt.getTime() - NOW.getTime()).toBe(60_000);
  });

  it('intervals grow with consecutive successful reviews', () => {
    const { intervals } = reviewChain([3, 3, 3, 3, 3]);
    for (let i = 1; i < intervals.length; i++)
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1] ?? 0);
  });

  it('easy grows faster than good, which grows faster than hard', () => {
    const base = reviewChain([3, 3]).card;
    const due = base.dueAt;
    const preview = previewReview(base, due);
    expect(preview[4].scheduledDays).toBeGreaterThan(preview[3].scheduledDays);
    expect(preview[3].scheduledDays).toBeGreaterThan(preview[2].scheduledDays);
  });

  it('forgetting a mature card lowers stability and sends it to relearning', () => {
    const mature = reviewChain([3, 3, 3, 3]).card;
    const lapse = scheduleReview(mature, 1, mature.dueAt);
    expect(lapse.state).toBe('relearning');
    expect(lapse.stability ?? Infinity).toBeLessThan(mature.stability ?? 0);
    expect(scheduleReview(lapse, 3, lapse.dueAt).state).toBe('review');
  });

  it('keeps difficulty within 1..10 under extreme answers', () => {
    const hard = reviewChain(Array(20).fill(1)).card;
    const easy = reviewChain(Array(20).fill(4)).card;
    expect(hard.difficulty).toBeLessThanOrEqual(10);
    expect(easy.difficulty).toBeGreaterThanOrEqual(1);
  });

  it('never schedules beyond 100 years', () => {
    expect(intervalDays(1e9)).toBe(36500);
  });
});
