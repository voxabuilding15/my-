import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { DocumentsRepository } from './domain/documents-repository';

export const [DocumentsRepositoryProvider, useDocumentsRepository] =
  createRepositoryContext<DocumentsRepository>('Documents');
