import { createContext, useContext, type PropsWithChildren } from 'react';

/**
 * A typed context for one repository. Each feature owns its context, so features never import
 * each other's implementations; the composition root decides which implementation to provide.
 */
export function createRepositoryContext<T>(name: string) {
  const Context = createContext<T | null>(null);

  function Provider({ value, children }: PropsWithChildren<{ value: T }>) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useRepository(): T {
    const repository = useContext(Context);
    if (!repository) throw new Error(`${name} repository is not provided`);
    return repository;
  }

  return [Provider, useRepository] as const;
}
