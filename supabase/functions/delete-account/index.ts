import { errorText } from '@studexa/shared';
import { getEnv } from '../_shared/env.ts';
import { log } from '../_shared/logger.ts';
import { withHttp } from '../_shared/http.ts';
import { removePrefix, USER_BUCKETS } from '../_shared/storage.ts';
import { createAdminClient, getUser, rateLimit } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { createDeleteAccountHandler } from './handler.ts';

const env = getEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);

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

const handler = createDeleteAccountHandler({
  async getCaller(req) {
    const auth = await getUser(admin, req);
    return auth ? { id: auth.user.id, authenticatedAt: amrTimestamps(auth.token) } : null;
  },
  rateLimit: (key, max, windowSeconds) => rateLimit(admin, key, max, windowSeconds),
  async removeUserFiles(userId) {
    for (const bucket of USER_BUCKETS) {
      try {
        await removePrefix(admin, bucket, userId);
      } catch (error) {
        log('warn', 'delete-account.files_deferred', { bucket, error: errorText(error) });
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
