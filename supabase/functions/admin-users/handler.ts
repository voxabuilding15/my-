import { z } from 'zod';

import { HttpError } from '../_shared/errors.ts';
import { json, parseBody } from '../_shared/http.ts';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delete_user'),
    userId: z.uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal('sign_out_user'), userId: z.uuid() }),
]);

export interface AdminUsersDeps {
  /** The caller's id when they are an admin with a multi-factor session, else null. */
  getAdminId(req: Request): Promise<string | null>;
  getRole(userId: string): Promise<string | null>;
  audit(
    adminId: string,
    action: string,
    userId: string,
    details: Record<string, unknown>,
  ): Promise<void>;
  removeUserFiles(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
}

/** Account actions that need the Auth admin API (service role), so they cannot be plain RPCs. */
export function createAdminUsersHandler(deps: AdminUsersDeps) {
  return async function handle(req: Request): Promise<Response> {
    const adminId = await deps.getAdminId(req);
    if (!adminId) throw new HttpError('forbidden', 'Admin with two-factor sign-in required');

    const body = await parseBody(req, requestSchema);
    if (body.userId === adminId) {
      throw new HttpError('forbidden', 'Use the app to act on your own account');
    }
    const role = await deps.getRole(body.userId);
    if (role === null) throw new HttpError('not_found');

    if (body.action === 'sign_out_user') {
      await deps.revokeSessions(body.userId);
      await deps.audit(adminId, 'sign_out_user', body.userId, {});
      return json({ status: 'signed_out' });
    }

    // Staff accounts are demoted first, so the last-admin guard always applies.
    if (role !== 'user') throw new HttpError('forbidden', 'Remove the staff role first');
    // The audit target is anonymised by the database once the profile is gone.
    await deps.audit(adminId, 'delete_user', body.userId, { reason: body.reason });
    await deps.removeUserFiles(body.userId);
    await deps.deleteUser(body.userId);
    return json({ status: 'deleted' });
  };
}
