import { useMutation } from '@tanstack/react-query';
import type { TranslationLanguage } from '@studexa/shared';
import { useState } from 'react';

import type { AiRequest } from '../../domain/ai-tools';
import { useAiRepository } from '../../repository';

/** Runs an AI action and exposes the streamed text as it arrives. */
export function useAiTool() {
  const repository = useAiRepository();
  const [text, setText] = useState('');
  const mutation = useMutation({
    mutationFn: (request: AiRequest) => {
      setText('');
      return repository.run(request, setText);
    },
  });
  return {
    run: mutation.mutate,
    text,
    isRunning: mutation.isPending,
    isDone: mutation.isSuccess,
    error: mutation.error,
  };
}

export function useTranslate() {
  const repository = useAiRepository();
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
  });
}
