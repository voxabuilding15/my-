import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { NotesRepository } from './domain/note';

export const [NotesRepositoryProvider, useNotesRepository] =
  createRepositoryContext<NotesRepository>('Notes');
