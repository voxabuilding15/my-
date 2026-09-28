import { assert, assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import { type AuthEmailCodeDeps, type Caller, createAuthEmailCodeHandler } from './handler.ts';

type Account = {
  id: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  password?: string;
};

function setup(
  options: { caller?: Caller | null; accounts?: Account[]; rateLimited?: boolean } = {},
) {
  const accounts = options.accounts ?? [
    { id: 'u1', email: 'ada@example.com', emailVerified: true, hasPassword: true },
    { id: 'g1', email: 'google@example.com', emailVerified: true, hasPassword: false },
  ];
  const codes = new Map<string, { hash: string; attempts: number; issuedAt: number }>();
  const sent: { to: string; code: string; purpose: string }[] = [];
  const background: Promise<unknown>[] = [];
  const calls: string[] = [];
  let clock = 0;
  let nextCode = 100000;

  const deps: AuthEmailCodeDeps = {
    getCaller: () => Promise.resolve(options.caller ?? null),
    findAccount: (email) => {
      const a = accounts.find((x) => x.email === email);
      return Promise.resolve(
        a ? { id: a.id, emailVerified: a.emailVerified, hasPassword: a.hasPassword } : null,
      );
    },
    issueCode: (userId, purpose, hash) => {
      const key = `${userId}:${purpose}`;
      const existing = codes.get(key);
      if (existing && clock - existing.issuedAt < 60) {
        return Promise.resolve({
          issued: false,
          retryAfterSeconds: 60 - (clock - existing.issuedAt),
        });
      }
      codes.set(key, { hash, attempts: 0, issuedAt: clock });
      return Promise.resolve({ issued: true, retryAfterSeconds: 60 });
    },
    verifyCode: (userId, purpose, hash, consume) => {
      const key = `${userId}:${purpose}`;
      const code = codes.get(key);
      if (!code) return Promise.resolve({ status: 'no_code' as const, attemptsRemaining: 0 });
      if (code.hash === hash) {
        if (consume) codes.delete(key);
        return Promise.resolve({ status: 'valid' as const, attemptsRemaining: 5 - code.attempts });
      }
      code.attempts += 1;
      if (code.attempts >= 5) {
        codes.delete(key);
        return Promise.resolve({ status: 'too_many_attempts' as const, attemptsRemaining: 0 });
      }
      return Promise.resolve({ status: 'invalid' as const, attemptsRemaining: 5 - code.attempts });
    },
    markEmailVerified: (userId) => {
      calls.push(`verified:${userId}`);
      return Promise.resolve();
    },
    setPassword: (userId, password) => {
      calls.push(`password:${userId}`);
      accounts.find((a) => a.id === userId)!.password = password;
      return Promise.resolve();
    },
    revokeSessions: (userId) => {
      calls.push(`revoke:${userId}`);
      return Promise.resolve();
    },
    rateLimit: () => Promise.resolve(!options.rateLimited),
    sendCodeEmail: ({ to, code, purpose }) => {
      sent.push({ to, code, purpose });
      return Promise.resolve();
    },
    preferredLocale: () => Promise.resolve('en'),
    generateCode: () => String(nextCode++),
    hash: (value) => Promise.resolve(`h(${value})`),
    runInBackground: (task) => void background.push(task),
  };

  const handler = withHttp('test', createAuthEmailCodeHandler(deps));
  const call = async (body: unknown) => {
    const res = await handler(
      new Request('http://localhost', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
    await Promise.all(background.splice(0));
    return { status: res.status, body: await res.json() };
  };
  return { call, sent, calls, codes, accounts, tick: (seconds: number) => (clock += seconds) };
}

const unverified: Caller = { id: 'n1', email: 'new@example.com', emailVerified: false };

Deno.test('verification requires a signed-in user', async () => {
  const { call } = setup();
  const res = await call({ action: 'send_verification' });
  assertEquals(res.status, 401);
  assertEquals(res.body.error.code, 'unauthenticated');
});

Deno.test('verification code is emailed and confirms the address', async () => {
  const { call, sent, calls } = setup({ caller: unverified });
  const send = await call({ action: 'send_verification' });
  assertEquals(send.body, { status: 'sent', retryAfterSeconds: 60 });
  assertEquals(sent.length, 1);
  assert(/^\d{6}$/.test(sent[0]!.code));

  const wrong = await call({ action: 'confirm_verification', code: '000000' });
  assertEquals(wrong.status, 400);
  assertEquals(wrong.body.error, {
    code: 'invalid_code',
    message: 'Incorrect code',
    details: { attemptsRemaining: 4 },
  });

  const ok = await call({ action: 'confirm_verification', code: sent[0]!.code });
  assertEquals(ok.body, { status: 'verified' });
  assertEquals(calls, ['verified:n1']);
});

Deno.test('a new code cannot be requested within 60 seconds', async () => {
  const { call, sent, tick } = setup({ caller: unverified });
  await call({ action: 'send_verification' });
  tick(20);
  const again = await call({ action: 'send_verification' });
  assertEquals(again.status, 429);
  assertEquals(again.body.error.code, 'resend_too_soon');
  assertEquals(again.body.error.details.retryAfterSeconds, 40);
  tick(40);
  assertEquals((await call({ action: 'send_verification' })).status, 200);
  assertEquals(sent.length, 2);
});

Deno.test('already verified users are not emailed', async () => {
  const { call, sent } = setup({
    caller: { id: 'u1', email: 'ada@example.com', emailVerified: true },
  });
  assertEquals((await call({ action: 'send_verification' })).body, { status: 'already_verified' });
  assertEquals(sent.length, 0);
});

Deno.test('five wrong codes lock the code', async () => {
  const { call, sent } = setup({ caller: unverified });
  await call({ action: 'send_verification' });
  for (let i = 0; i < 4; i++) await call({ action: 'confirm_verification', code: '000000' });
  const fifth = await call({ action: 'confirm_verification', code: '000000' });
  assertEquals(fifth.body.error.code, 'code_expired');
  const right = await call({ action: 'confirm_verification', code: sent[0]!.code });
  assertEquals(right.body.error.code, 'code_expired');
});

Deno.test(
  'password reset responds identically for unknown, Google-only and real accounts',
  async () => {
    const { call, sent } = setup();
    const unknown = await call({ action: 'send_password_reset', email: 'nobody@example.com' });
    const googleOnly = await call({ action: 'send_password_reset', email: 'google@example.com' });
    const real = await call({ action: 'send_password_reset', email: 'ADA@example.com ' });
    assertEquals(unknown, real);
    assertEquals(googleOnly, real);
    assertEquals(
      sent.map((s) => s.to),
      ['ada@example.com'],
    );
  },
);

Deno.test('checking a reset code for an unknown email does not reveal attempts', async () => {
  const { call } = setup();
  const res = await call({
    action: 'check_password_reset',
    email: 'nobody@example.com',
    code: '123456',
  });
  assertEquals(res.body.error, { code: 'invalid_code', message: 'Incorrect code' });
});

Deno.test(
  'completing a reset sets the password, signs out everywhere and consumes the code',
  async () => {
    const { call, sent, calls, accounts } = setup({
      accounts: [{ id: 'u2', email: 'bob@example.com', emailVerified: false, hasPassword: true }],
    });
    await call({ action: 'send_password_reset', email: 'bob@example.com' });
    const code = sent[0]!.code;

    const weak = await call({
      action: 'complete_password_reset',
      email: 'bob@example.com',
      code,
      newPassword: 'short',
    });
    assertEquals(weak.body.error.code, 'weak_password');

    assertEquals(
      (await call({ action: 'check_password_reset', email: 'bob@example.com', code })).body,
      { status: 'valid' },
    );
    const done = await call({
      action: 'complete_password_reset',
      email: 'bob@example.com',
      code,
      newPassword: 'NewPassw0rd!',
    });
    assertEquals(done.body, { status: 'password_updated' });
    assertEquals(accounts[0]!.password, 'NewPassw0rd!');
    assertEquals(calls, ['password:u2', 'revoke:u2', 'verified:u2']);

    const reuse = await call({
      action: 'complete_password_reset',
      email: 'bob@example.com',
      code,
      newPassword: 'Another0ne!!',
    });
    assertEquals(reuse.body.error.code, 'code_expired');
  },
);

Deno.test('rate limits reject with 429', async () => {
  const { call } = setup({ rateLimited: true });
  const res = await call({ action: 'send_password_reset', email: 'ada@example.com' });
  assertEquals(res.status, 429);
  assertEquals(res.body.error.code, 'rate_limited');
});

Deno.test('malformed requests are rejected', async () => {
  const { call } = setup();
  assertEquals((await call('not json')).body.error.code, 'validation_failed');
  assertEquals((await call({ action: 'send_password_reset', email: 'nope' })).status, 400);
  assertEquals((await call({ action: 'unknown' })).status, 400);
});
