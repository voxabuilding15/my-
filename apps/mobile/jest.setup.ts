jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => store.get(key) ?? null,
      setItemSync: (key: string, value: string) => void store.set(key, value),
      removeItemSync: (key: string) => store.delete(key),
    },
  };
});
