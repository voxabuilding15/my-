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
