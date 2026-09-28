import { AppError, type QuizQuestionType } from '@studexa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  gradeAnswer,
  type Quiz,
  type QuizResult,
  type QuizOptions,
  type QuizSummary,
  type QuizzesRepository,
} from '@/features/quizzes/domain/quiz';

import type { StreamAi } from './ai-repository';
import { unwrap } from './postgrest';

type SummaryRow = {
  id: string;
  title: string;
  document_id: string | null;
  question_count: number;
  time_limit_seconds: number | null;
  best_score: number | null;
  last_attempt_at: string | null;
};

const toSummary = (row: SummaryRow): QuizSummary => ({
  id: row.id,
  title: row.title,
  documentId: row.document_id,
  questionCount: row.question_count,
  timeLimitSeconds: row.time_limit_seconds,
  bestScore: row.best_score,
  lastAttemptAt: row.last_attempt_at,
});

export class SupabaseQuizzesRepository implements QuizzesRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly stream: StreamAi,
  ) {}

  async generate(documentId: string, { questionCount, timeLimitMinutes, language }: QuizOptions) {
    const result = await this.stream({
      action: 'quiz',
      documentId,
      language,
      questionCount,
      ...(timeLimitMinutes ? { timeLimitMinutes } : {}),
    });
    if (!result.quizId) throw new AppError('ai_unavailable');
    return result.quizId;
  }

  async list() {
    return (unwrap(await this.client.rpc('list_my_quizzes')) as SummaryRow[]).map(toSummary);
  }

  async get(id: string): Promise<Quiz> {
    const summaries = (unwrap(await this.client.rpc('list_my_quizzes')) as SummaryRow[]).filter(
      (row) => row.id === id,
    );
    const questions = unwrap(
      await this.client
        .from('quiz_questions')
        .select('id, type, prompt, choices, correct_answer, explanation, source_page')
        .eq('quiz_id', id)
        .order('position'),
    ) as {
      id: string;
      type: QuizQuestionType;
      prompt: string;
      choices: string[] | null;
      correct_answer: string;
      explanation: string | null;
      source_page: number | null;
    }[];
    const summary = summaries[0];
    if (!summary) throw new AppError('not_found');
    return {
      ...toSummary(summary),
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        choices: q.choices,
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
        sourcePage: q.source_page,
      })),
    };
  }

  /** The server grades and records the attempt (streaks, stats); the review is graded locally with the same rules. */
  async submit(
    quizId: string,
    answers: Record<string, string>,
    elapsedSeconds: number,
  ): Promise<QuizResult> {
    const attemptId = unwrap(
      await this.client.rpc('start_quiz_attempt', { p_quiz_id: quizId }),
    ) as string;
    const [scored] = unwrap(
      await this.client.rpc('submit_quiz_attempt', { p_attempt_id: attemptId, p_answers: answers }),
    ) as { score: number; max_score: number }[];
    const quiz = await this.get(quizId);
    return {
      score: scored?.score ?? 0,
      maxScore: scored?.max_score ?? quiz.questions.length,
      timedOut: quiz.timeLimitSeconds !== null && elapsedSeconds > quiz.timeLimitSeconds + 15,
      answers: quiz.questions.map((question) => {
        const answer = answers[question.id] ?? '';
        return {
          questionId: question.id,
          answer,
          correct: answer ? gradeAnswer(question, answer) : false,
        };
      }),
    };
  }
}
