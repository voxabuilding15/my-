import { getCronEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { removePrefix } from '../_shared/storage.ts';
import { createAdminClient, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { createStorageJanitorHandler } from './handler.ts';

const env = getCronEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);

type Row = { id: number; bucket_id: string; path_prefix: string };

const handler = createStorageJanitorHandler({
  secret: env.CRON_SECRET,
  async claim(limit) {
    const rows = await rpc<Row[]>(admin, 'claim_storage_deletions', { p_limit: limit });
    return rows.map((row) => ({
      id: row.id,
      bucketId: row.bucket_id,
      pathPrefix: row.path_prefix,
    }));
  },
  removePrefix: (bucketId, pathPrefix) => removePrefix(admin, bucketId, pathPrefix),
  finish: (id, error) => rpc(admin, 'finish_storage_deletion', { p_id: id, p_error: error }),
});

Deno.serve(withHttp('storage-janitor', handler));
