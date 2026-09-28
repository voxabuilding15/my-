import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { QuizzesRepository } from './domain/quiz';

export const [QuizzesRepositoryProvider, useQuizzesRepository] =
  createRepositoryContext<QuizzesRepository>('Quizzes');
