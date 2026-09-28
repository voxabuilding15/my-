import type { AppLocale, QuizQuestionType } from '@studexa/shared';

export type QuizSummary = {
  id: string;
  title: string;
  documentId: string | null;
  questionCount: number;
  timeLimitSeconds: number | null;
  bestScore: number | null;
  lastAttemptAt: string | null;
};

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[] | null;
  correctAnswer: string;
  explanation: string | null;
  sourcePage: number | null;
};

export type Quiz = QuizSummary & { questions: QuizQuestion[] };

export type GradedAnswer = { questionId: string; answer: string; correct: boolean | null };
export type QuizResult = {
  score: number;
  maxScore: number;
  timedOut: boolean;
  answers: GradedAnswer[];
};

/** Mirrors the server's grading (submit_quiz_attempt): case, spacing and trailing punctuation are ignored. */
export const normalizeAnswer = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\p{P}]+$/u, '');

export function gradeAnswer(question: QuizQuestion, answer: string): boolean | null {
  if (normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer)) return true;
  return question.type === 'short_answer' ? null : false;
}

export type QuizOptions = { questionCount: number; timeLimitMinutes?: number; language: AppLocale };

export interface QuizzesRepository {
  /** Generates a quiz from a document with AI; resolves with the new quiz id. */
  generate(documentId: string, options: QuizOptions): Promise<string>;
  list(): Promise<QuizSummary[]>;
  get(id: string): Promise<Quiz>;
  submit(
    quizId: string,
    answers: Record<string, string>,
    elapsedSeconds: number,
  ): Promise<QuizResult>;
}
