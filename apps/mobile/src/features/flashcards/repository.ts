import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { FlashcardsRepository } from './domain/flashcards';

export const [FlashcardsRepositoryProvider, useFlashcardsRepository] =
  createRepositoryContext<FlashcardsRepository>('Flashcards');
