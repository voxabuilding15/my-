import { z } from 'zod';

import type { AppErrorCode } from './errors.ts';
import { APP_LOCALES, TRANSLATION_LANGUAGES, type TranslationLanguage } from './locales.ts';
import type { CountedLimitKey } from './plans.ts';

export const AI_ACTIONS = [
  'explain',
  'summarize',
  'translate',
  'quiz',
  'flashcards',
  'eli10',
  'notes',
  'mind_map',
  'study_plan',
  'practice_questions',
  'document_qa',
  'ocr',
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Which quota bucket an action draws from, in addition to the global AI quota. */
export const AI_ACTION_QUOTA: Partial<Record<AiAction, CountedLimitKey>> = {
  quiz: 'quizzesPerDay',
  flashcards: 'flashcardDecksPerDay',
  document_qa: 'chatMessagesPerDay',
  ocr: 'ocrScansPerDay',
};

export const QUIZ_QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

/** Tools that stream a Markdown result for a document (or one page of it). */
export const DOCUMENT_TOOL_ACTIONS = [
  'summarize',
  'explain',
  'eli10',
  'notes',
  'mind_map',
  'study_plan',
  'practice_questions',
  'translate',
] as const satisfies readonly AiAction[];
export type DocumentToolAction = (typeof DOCUMENT_TOOL_ACTIONS)[number];

const translationLanguage = z.enum(
  Object.keys(TRANSLATION_LANGUAGES) as [TranslationLanguage, ...TranslationLanguage[]],
);
/** The language answers are written in: the app language by default, switchable per request. */
const answerLanguage = z.enum(APP_LOCALES);

// `ai` Edge Function request contract
export const aiRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(DOCUMENT_TOOL_ACTIONS),
    documentId: z.uuid(),
    page: z.number().int().min(1).optional(),
    targetLanguage: translationLanguage.optional(),
    language: answerLanguage,
    /** Skip the stored result and generate a new one. */
    regenerate: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('chat'),
    conversationId: z.uuid(),
    message: z.string().trim().min(1).max(4000),
    language: answerLanguage,
  }),
  z.object({
    action: z.literal('translate_text'),
    text: z.string().trim().min(1).max(5000),
    from: z.union([translationLanguage, z.literal('auto')]),
    to: translationLanguage,
  }),
  z.object({
    action: z.literal('quiz'),
    documentId: z.uuid(),
    language: answerLanguage,
    questionCount: z.number().int().min(3).max(20).default(10),
    timeLimitMinutes: z.number().int().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal('flashcards'),
    documentId: z.uuid(),
    language: answerLanguage,
    cardCount: z.number().int().min(5).max(40).default(15),
  }),
]);
export type AiRequest = z.input<typeof aiRequestSchema>;

/** A page range the answer is grounded in, with the supporting passage. */
export type Citation = { pageStart: number; pageEnd: number; quote: string };

/** Server-sent events streamed by the `ai` function (one JSON object per `data:` line). */
export type AiStreamEvent =
  | { type: 'start'; model: string; cached: boolean; remaining: number | null }
  | { type: 'text'; text: string }
  | { type: 'citation'; citation: Citation }
  | {
      type: 'done';
      citations: Citation[];
      outputId?: string;
      messageId?: string;
      quizId?: string;
      deckId?: string;
      /** Large documents: whole-document tools read only up to this page. */
      coveredUntilPage?: number;
      remaining: number | null;
    }
  | { type: 'error'; code: AppErrorCode; message: string };
