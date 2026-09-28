import { getEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { log } from '../_shared/logger.ts';
import { removePrefix, USER_BUCKETS } from '../_shared/storage.ts';
import { bearerToken, createAdminClient, createUserClient, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { createAdminUsersHandler } from './handler.ts';

const env = getEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);

const handler = createAdminUsersHandler({
  async getAdminId(req) {
    const token = bearerToken(req);
    if (!token) return null;
    const { data } = await admin.auth.getUser(token);
    if (!data.user) return null;
    // Evaluated as the caller, so the database's role + MFA (aal2) check applies.
    const { data: isAdmin, error } = await createUserClient(env, token).rpc('is_admin');
    return !error && isAdmin === true ? data.user.id : null;
  },
  async getRole(userId) {
    const { data, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.role ?? null;
  },
  async audit(adminId, action, userId, details) {
    const { error } = await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action,
      target: `users:${userId}`,
      after: details,
    });
    if (error) throw error;
  },
  async removeUserFiles(userId) {
    for (const bucket of USER_BUCKETS) {
      try {
        await removePrefix(admin, bucket, userId);
      } catch (error) {
        // The storage deletion queue retries whatever is left.
        log('warn', 'admin-users.files_deferred', { bucket, error: String(error) });
      }
    }
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
  revokeSessions: (userId) => rpc(admin, 'revoke_user_sessions', { p_user_id: userId }),
});

Deno.serve(withHttp('admin-users', handler));
