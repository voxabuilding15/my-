import { REAUTHENTICATION_WINDOW_SECONDS } from '@studexa/shared';

import { HttpError } from '../_shared/errors.ts';
import { json } from '../_shared/http.ts';

export type AccountCaller = {
  id: string;
  /** Unix seconds of each sign-in method recorded in the access token (`amr` claim). */
  authenticatedAt: number[];
};

export interface DeleteAccountDeps {
  getCaller(req: Request): Promise<AccountCaller | null>;
  rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  /** Best effort: anything left is removed by the storage deletion queue. */
  removeUserFiles(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  now(): number;
}

export function createDeleteAccountHandler(deps: DeleteAccountDeps) {
  return async function handle(req: Request): Promise<Response> {
    const caller = await deps.getCaller(req);
    if (!caller) throw new HttpError('unauthenticated', 'Sign in first');

    // Irreversible: require a sign-in within the last few minutes, not just a live session.
    const lastSignIn = Math.max(0, ...caller.authenticatedAt);
    if (deps.now() / 1000 - lastSignIn > REAUTHENTICATION_WINDOW_SECONDS) {
      throw new HttpError(
        'reauthentication_required',
        'Please sign in again to delete your account',
      );
    }

    if (!(await deps.rateLimit(`delete_account:${caller.id}`, 3, 3600))) {
      throw new HttpError('rate_limited', 'Too many requests, try again later');
    }

    await deps.removeUserFiles(caller.id);
    await deps.deleteUser(caller.id);
    return json({ status: 'deleted' });
  };
}
