import { assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import { createRevenueCatWebhookHandler } from './handler.ts';

const SECRET = 's'.repeat(40);

function setup() {
  const events: Record<string, unknown>[] = [];
  const handler = withHttp(
    'test',
    createRevenueCatWebhookHandler({
      secret: SECRET,
      applyEvent: (event) =>
        Promise.resolve(void events.push(event)).then(() => 'processed' as const),
    }),
  );
  const call = async (auth: string, body: unknown) => {
    const res = await handler(
      new Request('http://localhost', {
        method: 'POST',
        headers: { Authorization: auth },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, events };
}

const payload = {
  api_version: '1.0',
  event: { id: 'e1', type: 'RENEWAL', app_user_id: 'u1', price: 4.99 },
};

Deno.test('events with the configured secret are applied with all their fields', async () => {
  const { call, events } = setup();
  const res = await call(`Bearer ${SECRET}`, payload);
  assertEquals(res.body, { result: 'processed' });
  assertEquals(events, [payload.event]);
});

Deno.test('the raw secret (no Bearer prefix) is also accepted', async () => {
  const { call } = setup();
  assertEquals((await call(SECRET, payload)).status, 200);
});

Deno.test('a wrong secret is rejected without applying anything', async () => {
  const { call, events } = setup();
  assertEquals((await call('Bearer nope', payload)).status, 401);
  assertEquals(events, []);
});

Deno.test('malformed events are rejected', async () => {
  const { call } = setup();
  assertEquals((await call(SECRET, { event: { type: 'RENEWAL' } })).status, 400);
});
