import { timingSafeEqual } from '../_shared/crypto.ts';
import { HttpError } from '../_shared/errors.ts';
import { json } from '../_shared/http.ts';

export type DeletionTask = { id: number; bucketId: string; pathPrefix: string };

export interface StorageJanitorDeps {
  secret: string;
  claim(limit: number): Promise<DeletionTask[]>;
  removePrefix(bucketId: string, pathPrefix: string): Promise<number>;
  finish(id: number, error: string | null): Promise<void>;
}

/**
 * Deletes files of deleted documents and accounts (queued by database triggers). Runs on a
 * schedule; each batch is claimed with SKIP LOCKED so overlapping runs never collide.
 */
export function createStorageJanitorHandler(deps: StorageJanitorDeps, batchSize = 25) {
  return async function handle(req: Request): Promise<Response> {
    const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!timingSafeEqual(provided, deps.secret)) throw new HttpError('unauthenticated');

    const tasks = await deps.claim(batchSize);
    let files = 0;
    let failed = 0;
    for (const task of tasks) {
      try {
        files += await deps.removePrefix(task.bucketId, task.pathPrefix);
        await deps.finish(task.id, null);
      } catch (error) {
        failed++;
        await deps.finish(task.id, String(error));
      }
    }
    return json({ prefixes: tasks.length, files, failed });
  };
}
