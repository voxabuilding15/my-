import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { QuizOptions } from '../../domain/quiz';
import { useQuizzesRepository } from '../../repository';

export const quizKeys = {
  all: ['quizzes'] as const,
  detail: (id: string) => ['quizzes', id] as const,
};

export function useQuizzes() {
  const repository = useQuizzesRepository();
  return useQuery({ queryKey: quizKeys.all, queryFn: () => repository.list() });
}

export function useQuiz(id: string) {
  const repository = useQuizzesRepository();
  return useQuery({ queryKey: quizKeys.detail(id), queryFn: () => repository.get(id) });
}

export function useSubmitQuiz(quizId: string) {
  const repository = useQuizzesRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      answers,
      elapsedSeconds,
    }: {
      answers: Record<string, string>;
      elapsedSeconds: number;
    }) => repository.submit(quizId, answers, elapsedSeconds),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: quizKeys.all }),
        client.invalidateQueries({ queryKey: ['progress'] }),
      ]),
  });
}

/** Generates a quiz from a document with AI. */
export function useGenerateQuiz() {
  const repository = useQuizzesRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, ...options }: { documentId: string } & QuizOptions) =>
      repository.generate(documentId, options),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: quizKeys.all }),
        client.invalidateQueries({ queryKey: ['subscription'] }),
      ]),
  });
}
