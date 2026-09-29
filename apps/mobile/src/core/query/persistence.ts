import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Storage } from 'expo-sqlite/kv-store';

/**
 * Offline mode: the study material a student already opened stays readable without a
 * connection. Only these query families are kept on the device (in the app's private
 * storage, excluded from backups by `allowBackup: false`); everything else is refetched.
 */
const OFFLINE_QUERY_ROOTS = new Set([
  'documents', // list, details and extracted pages for reading
  'bookmarks',
  'notes',
  'decks', // flashcards, including due cards for offline review
  'quizzes',
  'conversations', // past chats (read-only offline)
  'progress',
  'subscription',
]);

export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The whole cache is serialised on the JS thread when it changes, so the text of very large
 * documents is not kept offline (≈ 3 KB a page: 150 pages ≈ 450 KB).
 */
export const MAX_OFFLINE_PAGES = 150;

export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  const [root, , part] = query.queryKey;
  if (query.state.status !== 'success' || typeof root !== 'string') return false;
  if (!OFFLINE_QUERY_ROOTS.has(root)) return false;
  if (root === 'documents' && part === 'pages') {
    const pages = query.state.data;
    return Array.isArray(pages) && pages.length <= MAX_OFFLINE_PAGES;
  }
  return true;
}

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
    removeItem: (key) => Storage.removeItem(key),
  },
  key: 'studexa.query-cache',
  // Writes are batched: at most one per second while data changes.
  throttleTime: 1000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  // A new app version may change data shapes: start from a fresh cache.
  buster: Constants.expoConfig?.version ?? 'dev',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};
