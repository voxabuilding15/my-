import { PermanentError } from './errors.ts';
import type { DocumentStore, Job, JobQueue, Reporter } from './ports.ts';
import { processDocument } from './process-document.ts';

export const EXTRACT_JOB = 'document_extract';

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
  options: WorkerOptions,
  report: Reporter,
  stats: RunStats,
) {
  const documentId = typeof job.payload.document_id === 'string' ? job.payload.document_id : null;
  try {
    if (!documentId) throw new PermanentError('invalid_job');
    await processDocument(store, documentId);
    await queue.complete(job.id, options.workerId);
    stats.succeeded++;
  } catch (error) {
    const permanent = error instanceof PermanentError;
    const state = await queue.fail(job.id, options.workerId, String(error), !permanent);
    if (state === 'queued') {
      stats.retried++;
    } else {
      stats.failed++;
      if (documentId) {
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
): Promise<RunStats> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.budgetMs;
  const stats: RunStats = { claimed: 0, succeeded: 0, retried: 0, failed: 0 };

  while (now() < deadline) {
    const jobs = await queue.claim(
      EXTRACT_JOB,
      options.workerId,
      options.concurrency,
      options.leaseSeconds,
    );
    if (jobs.length === 0) break;
    stats.claimed += jobs.length;
    await Promise.all(jobs.map((job) => handleJob(job, store, queue, options, report, stats)));
  }
  await queue.heartbeat({ ...stats, finished_at: new Date(now()).toISOString() });
  return stats;
}
