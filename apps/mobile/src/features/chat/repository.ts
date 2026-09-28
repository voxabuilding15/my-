import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { ChatRepository } from './domain/chat';

export const [ChatRepositoryProvider, useChatRepository] =
  createRepositoryContext<ChatRepository>('Chat');
