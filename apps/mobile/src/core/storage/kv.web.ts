import { Storage } from 'expo-sqlite/kv-store';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Web build (store screenshots, reviews): the async kv-store API. On web, expo-sqlite runs in a
 * Web Worker and its synchronous API blocks the main thread until the worker answers. A worker
 * cannot start while the main thread is blocked, so the first synchronous read at startup always
 * timed out and persisted state (onboarding, preferences) was never restored. Android keeps
 * the synchronous native API in kv.ts. Stores hydrate asynchronously here; RootNavigator waits
 * for the preferences store before routing.
 */
const sqliteStateStorage: StateStorage = {
  getItem: (name) => Storage.getItem(name),
  setItem: (name, value) => Storage.setItem(name, value),
  removeItem: (name) => Storage.removeItem(name),
};

/** Non-sensitive persisted state only. Tokens and secrets belong in expo-secure-store. */
export const persistentStorage = createJSONStorage(() => sqliteStateStorage);
