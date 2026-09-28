import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useProgressRepository } from '../../repository';

/** Records study time (seconds) toward the daily goal and streak; ignores very short visits. */
export function useLogStudyTime() {
  const repository = useProgressRepository();
  const client = useQueryClient();
  return useCallback(
    (seconds: number) => {
      if (seconds < 10) return;
      void repository
        .logStudyTime(seconds)
        .then(() => client.invalidateQueries({ queryKey: ['progress'] }));
    },
    [repository, client],
  );
}
