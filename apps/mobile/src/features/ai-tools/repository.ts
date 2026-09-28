import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { AiRepository } from './domain/ai-tools';

export const [AiRepositoryProvider, useAiRepository] = createRepositoryContext<AiRepository>('Ai');
