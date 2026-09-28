import type { TranslationLanguage } from '@studexa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AiRequest, AnswerReport } from '../../domain/ai-tools';
import { useAiRepository } from '../../repository';

/** Remaining quotas change after every AI call. */
const USAGE_KEY = ['subscription'] as const;

/** Runs an AI action and exposes the streamed text as it arrives. */
export function useAiTool() {
  const repository = useAiRepository();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const mutation = useMutation({
    mutationFn: (request: AiRequest) => {
      setText('');
      return repository.run(request, setText);
    },
    onSettled: () => client.invalidateQueries({ queryKey: USAGE_KEY }),
  });
  return {
    run: mutation.mutate,
    text: mutation.data?.markdown ?? text,
    result: mutation.data,
    isRunning: mutation.isPending,
    isDone: mutation.isSuccess,
    error: mutation.error,
  };
}

export function useTranslate() {
  const repository = useAiRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      text,
      from,
      to,
    }: {
      text: string;
      from: TranslationLanguage | 'auto';
      to: TranslationLanguage;
    }) => repository.translate(text, from, to),
    onSettled: () => client.invalidateQueries({ queryKey: USAGE_KEY }),
  });
}

export function useReportAnswer() {
  const repository = useAiRepository();
  return useMutation({ mutationFn: (report: AnswerReport) => repository.report(report) });
}
