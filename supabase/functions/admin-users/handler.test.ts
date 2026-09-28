import { assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import { type AdminUsersDeps, createAdminUsersHandler } from './handler.ts';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

function setup(overrides: Partial<AdminUsersDeps> = {}) {
  const calls: string[] = [];
  const handler = withHttp(
    'test',
    createAdminUsersHandler({
      getAdminId: () => Promise.resolve(ADMIN),
      getRole: () => Promise.resolve('user'),
      audit: (_admin, action) => Promise.resolve(void calls.push(`audit:${action}`)),
      removeUserFiles: () => Promise.resolve(void calls.push('files')),
      deleteUser: () => Promise.resolve(void calls.push('delete')),
      revokeSessions: () => Promise.resolve(void calls.push('revoke')),
      ...overrides,
    }),
  );
  const call = async (body: unknown) => {
    const res = await handler(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, calls };
}

Deno.test('an admin deletes a user: audited first, then files, then the account', async () => {
  const { call, calls } = setup();
  const res = await call({ action: 'delete_user', userId: USER, reason: 'GDPR request by email' });
  assertEquals(res.body, { status: 'deleted' });
  assertEquals(calls, ['audit:delete_user', 'files', 'delete']);
});

Deno.test('deletion requires a reason', async () => {
  const { call, calls } = setup();
  assertEquals((await call({ action: 'delete_user', userId: USER })).status, 400);
  assertEquals(calls, []);
});

Deno.test('non-admins (or admins without MFA) are refused', async () => {
  const { call, calls } = setup({ getAdminId: () => Promise.resolve(null) });
  assertEquals((await call({ action: 'sign_out_user', userId: USER })).status, 403);
  assertEquals(calls, []);
});

Deno.test('staff accounts cannot be deleted until demoted', async () => {
  const { call, calls } = setup({ getRole: () => Promise.resolve('admin') });
  assertEquals(
    (await call({ action: 'delete_user', userId: USER, reason: 'cleanup' })).status,
    403,
  );
  assertEquals(calls, []);
});

Deno.test('admins cannot act on their own account here', async () => {
  const { call } = setup();
  assertEquals((await call({ action: 'sign_out_user', userId: ADMIN })).status, 403);
});

Deno.test('signing a user out everywhere revokes their sessions', async () => {
  const { call, calls } = setup();
  assertEquals((await call({ action: 'sign_out_user', userId: USER })).body, {
    status: 'signed_out',
  });
  assertEquals(calls, ['revoke', 'audit:sign_out_user']);
});
