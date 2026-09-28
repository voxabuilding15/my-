import { describe, expect, it, vi } from 'vitest';

import type {
  DocumentStore,
  Job,
  JobQueue,
  ProcessingDocument,
  SavedExtraction,
} from '../src/ports.ts';
import { processDocument } from '../src/process-document.ts';
import { drainQueue } from '../src/worker.ts';

const doc = (overrides: Partial<ProcessingDocument> = {}): ProcessingDocument => ({
  documentId: 'd1',
  userId: 'u1',
  kind: 'txt',
  storagePath: 'u1/d1/original.txt',
  status: 'processing',
  maxPages: 50,
  fullContextMaxTokens: 100_000,
  chunkTargetTokens: 800,
  chunkOverlapTokens: 120,
  ...overrides,
});

function fakeStore(
  options: {
    document?: ProcessingDocument | null;
    file?: string;
    reuse?: boolean;
    download?: () => Promise<Uint8Array>;
  } = {},
) {
  const saved: SavedExtraction[] = [];
  const failed: string[] = [];
  const store: DocumentStore = {
    get: () => Promise.resolve(options.document === undefined ? doc() : options.document),
    download:
      options.download ??
      (() =>
        Promise.resolve(
          new TextEncoder().encode(
            options.file ?? 'The cell is the unit of life and it is in all living things.',
          ),
        )),
    reuse: () => Promise.resolve(options.reuse ?? false),
    save: (_id, extraction) => Promise.resolve(void saved.push(extraction)),
    markFailed: (id, code) => Promise.resolve(void failed.push(`${id}:${code}`)),
  };
  return { store, saved, failed };
}

describe('processDocument', () => {
  it('extracts, detects language and saves full-context documents', async () => {
    const { store, saved } = fakeStore();
    expect(await processDocument(store, 'd1')).toBe('extracted');
    expect(saved[0]).toMatchObject({
      retrievalMode: 'full_context',
      tsConfig: 'english',
      language: 'en',
      extractionVersion: 1,
    });
    expect(saved[0]!.chunks).toHaveLength(1);
  });

  it('routes large documents to hybrid retrieval', async () => {
    const { store, saved } = fakeStore({ document: doc({ fullContextMaxTokens: 5 }) });
    await processDocument(store, 'd1');
    expect(saved[0]!.retrievalMode).toBe('hybrid');
  });

  it('reuses an identical earlier extraction without extracting again', async () => {
    const { store, saved } = fakeStore({ reuse: true });
    expect(await processDocument(store, 'd1')).toBe('reused');
    expect(saved).toEqual([]);
  });

  it('skips documents that were deleted or are already done', async () => {
    expect(await processDocument(fakeStore({ document: null }).store, 'd1')).toBe('skipped');
    expect(
      await processDocument(fakeStore({ document: doc({ status: 'ready' }) }).store, 'd1'),
    ).toBe('skipped');
  });

  it('fails permanently when a file has no text', async () => {
    await expect(processDocument(fakeStore({ file: '   \n ' }).store, 'd1')).rejects.toMatchObject({
      code: 'no_text',
    });
  });
});

function fakeQueue(batches: Job[][], failState: 'queued' | 'dead' = 'queued') {
  const events: string[] = [];
  const queue: JobQueue = {
    claim: () => Promise.resolve(batches.shift() ?? []),
    complete: (id) => Promise.resolve(void events.push(`complete:${id}`)),
    fail: (id, _w, _e, retryable) => {
      events.push(`fail:${id}:${retryable}`);
      return Promise.resolve(retryable ? failState : 'dead');
    },
    heartbeat: () => Promise.resolve(void events.push('heartbeat')),
  };
  return { queue, events };
}

const job = (id: number, documentId = `d${id}`): Job => ({
  id,
  kind: 'document_extract',
  payload: { document_id: documentId },
  attempts: 1,
  max_attempts: 5,
});
const options = { workerId: 'w', concurrency: 4, leaseSeconds: 300, budgetMs: 60_000 };

describe('drainQueue', () => {
  it('processes batches until the queue is empty, then sends a heartbeat', async () => {
    const { store } = fakeStore();
    const { queue, events } = fakeQueue([[job(1), job(2)], [job(3)]]);
    const stats = await drainQueue(store, queue, options, vi.fn());
    expect(stats).toEqual({ claimed: 3, succeeded: 3, retried: 0, failed: 0 });
    expect(events).toEqual(['complete:1', 'complete:2', 'complete:3', 'heartbeat']);
  });

  it('retries transient errors and reports them', async () => {
    const report = vi.fn();
    const { store, failed } = fakeStore({
      download: () => Promise.reject(new Error('storage timeout')),
    });
    const { queue, events } = fakeQueue([[job(1)]]);
    const stats = await drainQueue(store, queue, options, report);
    expect(stats.retried).toBe(1);
    expect(events[0]).toBe('fail:1:true');
    expect(failed).toEqual([]);
    expect(report).toHaveBeenCalledOnce();
  });

  it('fails the document after the last retry', async () => {
    const { store, failed } = fakeStore({
      download: () => Promise.reject(new Error('storage timeout')),
    });
    const { queue } = fakeQueue([[job(1)]], 'dead');
    await drainQueue(store, queue, options, vi.fn());
    expect(failed).toEqual(['d1:processing_failed']);
  });

  it('fails permanently broken files at once, with their reason, without paging anyone', async () => {
    const report = vi.fn();
    const { store, failed } = fakeStore({ document: doc({ kind: 'image' }) });
    const { queue, events } = fakeQueue([[job(1)]]);
    await drainQueue(store, queue, options, report);
    expect(events[0]).toBe('fail:1:false');
    expect(failed).toEqual(['d1:ocr_unavailable']);
    expect(report).not.toHaveBeenCalled();
  });

  it('stops claiming when the time budget is spent', async () => {
    let now = 0;
    const { store } = fakeStore();
    const { queue } = fakeQueue([[job(1)], [job(2)], [job(3)]]);
    const claim = queue.claim;
    queue.claim = (...args) => {
      now += 40_000;
      return claim(...args);
    };
    const stats = await drainQueue(store, queue, { ...options, now: () => now }, vi.fn());
    // Each claim takes 40 s of a 60 s budget: the third batch is left for the next run.
    expect(stats.claimed).toBe(2);
  });
});
