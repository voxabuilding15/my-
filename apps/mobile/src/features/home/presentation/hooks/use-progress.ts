import { useQuery } from '@tanstack/react-query';

import { useProgressRepository } from '../../repository';

export function useProgress() {
  const repository = useProgressRepository();
  return useQuery({ queryKey: ['progress'], queryFn: () => repository.progress() });
}
