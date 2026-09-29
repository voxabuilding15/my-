import { errorText } from '@studexa/shared';
import { PermanentError } from './errors.ts';
import type { AiServices, DocumentStore, Job, JobQueue, Reporter } from './ports.ts';
import { embedDocument, processDocument } from './process-document.ts';

export const EXTRACT_JOB = 'document_extract';
export const EMBED_JOB = 'document_embed';

type JobHandler = {
  run: (store: DocumentStore, documentId: string, services: AiServices) => Promise<unknown>;
  /** Extraction failures fail the document; a failed embedding leaves it usable (full-text search). */
  failsDocument: boolean;
};

const HANDLERS: Record<string, JobHandler> = {
  [EXTRACT_JOB]: { run: processDocument, failsDocument: true },
  [EMBED_JOB]: { run: embedDocument, failsDocument: false },
};

export type WorkerOptions = {
  workerId: string;
  concurrency: number;
  leaseSeconds: number;
  budgetMs: number;
  now?: () => number;
};

export type RunStats = { claimed: number; succeeded: number; retried: number; failed: number };

async function handleJob(
  job: Job,
  store: DocumentStore,
  queue: JobQueue,
  services: AiServices,
  options: WorkerOptions,
  report: Reporter,
  stats: RunStats,
) {
  const documentId = typeof job.payload.document_id === 'string' ? job.payload.document_id : null;
  const handler = HANDLERS[job.kind];
  try {
    if (!documentId || !handler) throw new PermanentError('invalid_job');
    await handler.run(store, documentId, services);
    await queue.complete(job.id, options.workerId);
    stats.succeeded++;
  } catch (error) {
    const permanent = error instanceof PermanentError;
    const state = await queue.fail(job.id, options.workerId, errorText(error), !permanent);
    if (state === 'queued') {
      stats.retried++;
    } else {
      stats.failed++;
      if (documentId && handler?.failsDocument) {
        await store.markFailed(documentId, permanent ? error.code : 'processing_failed');
      }
    }
    // Expected user-file problems are not incidents; everything else is.
    if (!permanent) report(error, { jobId: job.id, documentId, attempt: job.attempts, state });
  }
}

/**
 * Drains the queue until it is empty or the time budget is spent. Jobs are claimed in small
 * batches so parallel instances share the load (SKIP LOCKED) and a crash loses at most one lease.
 */
export async function drainQueue(
  store: DocumentStore,
  queue: JobQueue,
  options: WorkerOptions,
  report: Reporter,
  services: AiServices = { ocr: null, embeddings: null },
): Promise<RunStats> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.budgetMs;
  const stats: RunStats = { claimed: 0, succeeded: 0, retried: 0, failed: 0 };

  // Extraction first (users are waiting on it); embeddings fill the remaining capacity.
  const kinds = services.embeddings ? [EXTRACT_JOB, EMBED_JOB] : [EXTRACT_JOB];
  while (now() < deadline) {
    const jobs: Job[] = [];
    for (const kind of kinds) {
      const room = options.concurrency - jobs.length;
      if (room <= 0) break;
      jobs.push(...(await queue.claim(kind, options.workerId, room, options.leaseSeconds)));
    }
    if (jobs.length === 0) break;
    stats.claimed += jobs.length;
    await Promise.all(
      jobs.map((job) => handleJob(job, store, queue, services, options, report, stats)),
    );
  }
  await queue.heartbeat({ ...stats, finished_at: new Date(now()).toISOString() });
  return stats;
}
