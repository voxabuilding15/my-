import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSubscriptionRepository } from '../../repository';

const keys = { status: ['subscription'] as const, packages: ['subscription', 'packages'] as const };

export function usePlanStatus() {
  const repository = useSubscriptionRepository();
  return useQuery({ queryKey: keys.status, queryFn: () => repository.status() });
}

export function usePremiumPackages() {
  const repository = useSubscriptionRepository();
  return useQuery({
    queryKey: keys.packages,
    queryFn: () => repository.packages(),
    staleTime: 60 * 60 * 1000,
  });
}

export function usePurchase() {
  const repository = useSubscriptionRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) => repository.purchase(packageId),
    onSuccess: (status) => client.setQueryData(keys.status, status),
  });
}

export function useRestorePurchases() {
  const repository = useSubscriptionRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repository.restore(),
    onSuccess: (status) => client.setQueryData(keys.status, status),
  });
}
