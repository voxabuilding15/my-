import { QUIZ_QUESTION_TYPES } from '@studexa/shared';
import { z } from 'zod';

/** Structured-output schemas (JSON Schema for the model) plus zod for domain checks the schema can't express. */
export const QUIZ_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'questions'],
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'choices', 'correct_answer', 'explanation', 'source_page'],
        properties: {
          type: { type: 'string', enum: [...QUIZ_QUESTION_TYPES] },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correct_answer: { type: 'string' },
          explanation: { type: 'string' },
          source_page: { type: 'integer' },
        },
      },
    },
  },
} as const;

const question = z
  .object({
    type: z.enum(QUIZ_QUESTION_TYPES),
    prompt: z.string().trim().min(1).max(2000),
    choices: z.array(z.string().trim().min(1).max(500)),
    correct_answer: z.string().trim().min(1).max(2000),
    explanation: z.string().trim().max(4000),
    source_page: z.number().int(),
  })
  .transform((q) => ({
    ...q,
    correct_answer: q.type === 'true_false' ? q.correct_answer.toLowerCase() : q.correct_answer,
    choices: q.type === 'multiple_choice' ? [...new Set(q.choices)] : null,
  }))
  .refine(
    (q) =>
      q.type === 'multiple_choice'
        ? q.choices !== null &&
          q.choices.length >= 2 &&
          q.choices.length <= 6 &&
          q.choices.includes(q.correct_answer)
        : q.type === 'true_false'
          ? q.correct_answer === 'true' || q.correct_answer === 'false'
          : true,
    'inconsistent question',
  );

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Individual malformed questions are dropped rather than failing the whole quiz.
  questions: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const parsed = question.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});
export type GeneratedQuiz = z.infer<typeof quizSchema>;

export const FLASHCARDS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'cards'],
  properties: {
    title: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['front', 'back', 'source_page'],
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          source_page: { type: 'integer' },
        },
      },
    },
  },
} as const;

export const flashcardsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(2000),
        back: z.string().trim().min(1).max(4000),
        source_page: z.number().int(),
      }),
    )
    .transform((cards) => {
      const seen = new Set<string>();
      return cards.filter((c) => {
        const key = c.front.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
});
export type GeneratedFlashcards = z.infer<typeof flashcardsSchema>;
