import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../src/env.ts';
import { admin, callFunction, createUser, deleteUser, type TestUser } from '../src/helpers.ts';

let user: TestUser;
beforeAll(async () => {
  user = await createUser('billing');
});
afterAll(async () => {
  await deleteUser(user);
});

const DAY = 86_400_000;

/** A RevenueCat webhook body (the fields apply_billing_event reads). */
function event(type: string, fields: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: randomUUID(),
      type,
      app_user_id: user.id,
      product_id: 'studexa_premium_monthly',
      period_type: 'NORMAL',
      store: 'PLAY_STORE',
      price: 4.99,
      currency: 'USD',
      event_timestamp_ms: Date.now(),
      expiration_at_ms: Date.now() + 30 * DAY,
      environment: 'SANDBOX',
      ...fields,
    },
  };
}

async function send(body: unknown, secret = env.revenueCatSecret) {
  const res = await callFunction('revenuecat-webhook', body, null, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function subscription() {
  const { data } = await admin.from('subscriptions').select('*').eq('user_id', user.id).single();
  return data!;
}

describe('RevenueCat webhook simulation', () => {
  it('rejects a wrong or missing secret without touching the subscription', async () => {
    expect((await send(event('INITIAL_PURCHASE'), 'wrong-secret')).status).toBe(401);
    const res = await callFunction('revenuecat-webhook', event('INITIAL_PURCHASE'), null);
    expect(res.status).toBe(401);
    await res.body?.cancel();
    expect((await subscription()).tier).toBe('free');
  });

  it('a purchase makes the user Premium, and the app sees it through RLS', async () => {
    const res = await send(event('INITIAL_PURCHASE'));
    expect(res).toEqual({ status: 200, body: { result: 'processed' } });
    const sub = await subscription();
    expect(sub).toMatchObject({
      tier: 'premium',
      status: 'active',
      product_id: 'studexa_premium_monthly',
    });
    const { data } = await user.client.from('subscriptions').select('tier').single();
    expect(data?.tier).toBe('premium');
  });

  it('retried deliveries are idempotent', async () => {
    const renewal = event('RENEWAL', { event_timestamp_ms: Date.now() + 1000 });
    expect((await send(renewal)).body.result).toBe('processed');
    expect((await send(renewal)).body.result).toBe('duplicate');
    const { count } = await admin
      .from('billing_events')
      .select('*', { count: 'exact', head: true })
      .eq('id', renewal.event.id);
    expect(count).toBe(1);
  });

  it('out-of-order (stale) events cannot downgrade a newer state', async () => {
    const old = event('EXPIRATION', {
      event_timestamp_ms: Date.now() - 10 * DAY,
      expiration_reason: 'UNSUBSCRIBE',
    });
    expect((await send(old)).body.result).toBe('stale');
    expect((await subscription()).tier).toBe('premium');
  });

  it('cancellation keeps Premium until expiry; expiration returns to Free', async () => {
    await send(
      event('CANCELLATION', {
        event_timestamp_ms: Date.now() + 2000,
        cancel_reason: 'UNSUBSCRIBE',
      }),
    );
    expect(await subscription()).toMatchObject({ tier: 'premium', will_renew: false });
    await send(
      event('EXPIRATION', {
        event_timestamp_ms: Date.now() + 3000,
        expiration_reason: 'UNSUBSCRIBE',
      }),
    );
    expect((await subscription()).tier).toBe('free');
  });

  it('events for unknown users are recorded but change nothing', async () => {
    const res = await send(event('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc' }));
    expect(res.body.result).toBe('unknown_user');
  });

  it('malformed bodies are rejected', async () => {
    expect((await send({ event: { type: 'RENEWAL' } })).status).toBe(400);
    expect((await send('not json')).status).toBe(400);
  });

  it('users cannot grant themselves Premium', async () => {
    const { error } = await user.client
      .from('subscriptions')
      .update({ tier: 'premium' })
      .eq('user_id', user.id);
    const sub = await subscription();
    expect(sub.tier).toBe('free');
    // Either refused outright or silently matched no row (RLS): both leave the row unchanged.
    if (error) expect(error.code).toMatch(/42501|PGRST/);
    const rpc = await user.client.rpc('apply_billing_event', {
      p_event: event('INITIAL_PURCHASE').event,
    });
    expect(rpc.error).not.toBeNull();
  });
});
