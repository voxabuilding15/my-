export type StudyProgress = {
  currentStreak: number;
  longestStreak: number;
  dailyGoalMinutes: number;
  todayMinutes: number;
  /** Minutes studied on each of the last 7 days, oldest first (today last). */
  weekMinutes: number[];
  cardsReviewedThisWeek: number;
  quizzesThisWeek: number;
};

export interface ProgressRepository {
  progress(): Promise<StudyProgress>;
  logStudyTime(seconds: number): Promise<void>;
}
