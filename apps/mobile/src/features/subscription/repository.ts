import { createRepositoryContext } from '@/core/di/create-repository-context';

import type { SubscriptionRepository } from './domain/subscription';

export const [SubscriptionRepositoryProvider, useSubscriptionRepository] =
  createRepositoryContext<SubscriptionRepository>('Subscription');
