import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProgressRepository, StudyProgress } from '@/features/home/domain/progress';

import { check, unwrap } from './postgrest';

const DAY_MS = 86_400_000;
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export class SupabaseProgressRepository implements ProgressRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async progress(): Promise<StudyProgress> {
    const today = this.now();
    const days = Array.from({ length: 7 }, (_, i) =>
      localDate(new Date(today.getTime() - (6 - i) * DAY_MS)),
    );
    const [statsResult, activityResult] = await Promise.all([
      this.client.rpc('get_study_stats'),
      this.client
        .from('study_activity_days')
        .select('activity_date, study_seconds')
        .gte('activity_date', days[0]!),
    ]);
    const [stats] = unwrap(statsResult) as {
      current_streak: number;
      longest_streak: number;
      cards_reviewed_7d: number;
      quizzes_completed_7d: number;
    }[];
    const seconds = new Map(
      (unwrap(activityResult) as { activity_date: string; study_seconds: number }[]).map((row) => [
        row.activity_date,
        row.study_seconds,
      ]),
    );
    const weekMinutes = days.map((day) => Math.round((seconds.get(day) ?? 0) / 60));
    return {
      currentStreak: stats?.current_streak ?? 0,
      longestStreak: stats?.longest_streak ?? 0,
      // The goal is a device preference; Home overrides this default.
      dailyGoalMinutes: 20,
      todayMinutes: weekMinutes[6] ?? 0,
      weekMinutes,
      cardsReviewedThisWeek: Number(stats?.cards_reviewed_7d ?? 0),
      quizzesThisWeek: Number(stats?.quizzes_completed_7d ?? 0),
    };
  }

  async logStudyTime(seconds: number) {
    if (seconds < 5) return;
    check(await this.client.rpc('log_study_time', { p_seconds: Math.round(seconds) }));
  }
}
