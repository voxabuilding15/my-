import type { SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../_shared/env.ts';
import { log } from '../_shared/logger.ts';
import { withHttp } from '../_shared/http.ts';
import { createAdminClient, getUser, rateLimit } from '../_shared/supabase.ts';
import { createDeleteAccountHandler } from './handler.ts';

const env = getEnv();
const admin = createAdminClient(env);
const BUCKETS = ['documents', 'avatars'];

function amrTimestamps(token: string): number[] {
  try {
    const payload = JSON.parse(
      atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
    );
    return Array.isArray(payload.amr)
      ? payload.amr
          .map((entry: { timestamp?: unknown }) => Number(entry.timestamp))
          .filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

async function listFilesRecursive(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders have no id in Storage listings.
      if (entry.id) files.push(path);
      else files.push(...(await listFilesRecursive(client, bucket, path)));
    }
    if (data.length < 100) return files;
  }
}

const handler = createDeleteAccountHandler({
  async getCaller(req) {
    const auth = await getUser(admin, req);
    return auth ? { id: auth.user.id, authenticatedAt: amrTimestamps(auth.token) } : null;
  },
  rateLimit: (key, max, windowSeconds) => rateLimit(admin, key, max, windowSeconds),
  async removeUserFiles(userId) {
    for (const bucket of BUCKETS) {
      try {
        const files = await listFilesRecursive(admin, bucket, userId);
        for (let i = 0; i < files.length; i += 100) {
          const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100));
          if (error) throw error;
        }
      } catch (error) {
        log('warn', 'delete-account.files_deferred', { bucket, error: String(error) });
      }
    }
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
  now: () => Date.now(),
});

Deno.serve(withHttp('delete-account', handler));
