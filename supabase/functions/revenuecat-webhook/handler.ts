import { z } from 'zod';

import { timingSafeEqual } from '../_shared/crypto.ts';
import { HttpError } from '../_shared/errors.ts';
import { json, parseBody } from '../_shared/http.ts';

const webhookSchema = z.object({
  event: z.looseObject({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(64),
  }),
});

export type BillingResult = 'processed' | 'duplicate' | 'stale' | 'unknown_user';

export interface RevenueCatWebhookDeps {
  secret: string;
  applyEvent(event: Record<string, unknown>): Promise<BillingResult>;
}

/**
 * RevenueCat → subscription state. Idempotency and ordering are enforced in the database, so
 * RevenueCat's retries (any non-2xx) are always safe.
 */
export function createRevenueCatWebhookHandler(deps: RevenueCatWebhookDeps) {
  return async function handle(req: Request): Promise<Response> {
    const header = req.headers.get('authorization') ?? '';
    const provided = header.replace(/^Bearer\s+/i, '');
    if (!timingSafeEqual(provided, deps.secret)) throw new HttpError('unauthenticated');

    const { event } = await parseBody(req, webhookSchema);
    const result = await deps.applyEvent(event);
    return json({ result });
  };
}
