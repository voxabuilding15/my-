import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistentStorage } from '@/core/storage/kv';

/**
 * Uploads that started but have not been confirmed yet. Persisted so an upload cut off by a
 * lost connection, a killed app or a reboot continues on the next launch instead of starting
 * over. Holds no file contents: only where the file is on the device and how far it got.
 */
export type PendingUpload = {
  userId: string;
  documentId: string;
  /** Storage path and signed token from the document-upload function (valid ~2 hours). */
  path: string;
  token: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
  /** Resumable upload URL and confirmed offset, once the transfer has started. */
  uploadUrl: string | null;
  offset: number;
  createdAt: number;
};

export interface PendingUploads {
  list(userId: string): PendingUpload[];
  save(upload: PendingUpload): void;
  progress(documentId: string, uploadUrl: string, offset: number): void;
  remove(documentId: string): void;
  /** On sign-out: another account must never resume these. */
  clearFor(userId: string): void;
}

type State = { uploads: Record<string, PendingUpload> };

/** Signed upload tokens last two hours; older entries cannot be resumed. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const usePendingUploadsStore = create<State>()(
  persist(() => ({ uploads: {} }), {
    name: 'studexa.pending-uploads',
    storage: persistentStorage,
    version: 1,
  }),
);

export const pendingUploads: PendingUploads = {
  list(userId) {
    const now = Date.now();
    return Object.values(usePendingUploadsStore.getState().uploads).filter(
      (u) => u.userId === userId && now - u.createdAt < MAX_AGE_MS,
    );
  },
  save(upload) {
    usePendingUploadsStore.setState((s) => ({
      uploads: { ...s.uploads, [upload.documentId]: upload },
    }));
  },
  progress(documentId, uploadUrl, offset) {
    usePendingUploadsStore.setState((s) => {
      const current = s.uploads[documentId];
      return current
        ? { uploads: { ...s.uploads, [documentId]: { ...current, uploadUrl, offset } } }
        : s;
    });
  },
  remove(documentId) {
    usePendingUploadsStore.setState((s) => {
      const { [documentId]: _removed, ...rest } = s.uploads;
      return { uploads: rest };
    });
  },
  clearFor(userId) {
    usePendingUploadsStore.setState((s) => ({
      uploads: Object.fromEntries(Object.entries(s.uploads).filter(([, u]) => u.userId !== userId)),
    }));
  },
};

/** In-memory implementation for tests and the demo mode. */
export function createMemoryPendingUploads(): PendingUploads {
  const uploads = new Map<string, PendingUpload>();
  return {
    list: (userId) => [...uploads.values()].filter((u) => u.userId === userId),
    save: (upload) => void uploads.set(upload.documentId, upload),
    progress(documentId, uploadUrl, offset) {
      const current = uploads.get(documentId);
      if (current) uploads.set(documentId, { ...current, uploadUrl, offset });
    },
    remove: (documentId) => void uploads.delete(documentId),
    clearFor(userId) {
      for (const [id, u] of uploads) if (u.userId === userId) uploads.delete(id);
    },
  };
}
