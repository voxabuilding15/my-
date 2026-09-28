import { assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import { type AccountCaller, createDeleteAccountHandler } from './handler.ts';

const NOW = 1_800_000_000_000;

function setup(caller: AccountCaller | null) {
  const calls: string[] = [];
  const handler = withHttp(
    'test',
    createDeleteAccountHandler({
      getCaller: () => Promise.resolve(caller),
      rateLimit: () => Promise.resolve(true),
      removeUserFiles: (id) => Promise.resolve(void calls.push(`files:${id}`)),
      deleteUser: (id) => Promise.resolve(void calls.push(`user:${id}`)),
      now: () => NOW,
    }),
  );
  const call = async () => {
    const res = await handler(new Request('http://localhost', { method: 'POST', body: '{}' }));
    return { status: res.status, body: await res.json() };
  };
  return { call, calls };
}

Deno.test('deleting requires authentication', async () => {
  const { call, calls } = setup(null);
  assertEquals((await call()).status, 401);
  assertEquals(calls, []);
});

Deno.test('deleting requires a recent sign-in', async () => {
  const { call, calls } = setup({ id: 'u1', authenticatedAt: [NOW / 1000 - 3600] });
  const res = await call();
  assertEquals(res.status, 401);
  assertEquals(res.body.error.code, 'reauthentication_required');
  assertEquals(calls, []);
});

Deno.test('a recently signed-in user is deleted, files first', async () => {
  const { call, calls } = setup({
    id: 'u1',
    authenticatedAt: [NOW / 1000 - 3600, NOW / 1000 - 60],
  });
  assertEquals((await call()).body, { status: 'deleted' });
  assertEquals(calls, ['files:u1', 'user:u1']);
});
