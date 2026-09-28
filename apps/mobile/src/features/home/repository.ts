import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { ProgressRepository } from './domain/progress';

export const [ProgressRepositoryProvider, useProgressRepository] =
  createRepositoryContext<ProgressRepository>('Progress');
