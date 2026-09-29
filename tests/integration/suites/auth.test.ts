import { afterAll, describe, expect, it } from 'vitest';

import {
  admin,
  anonClient,
  callFunction,
  callJson,
  deleteUser,
  latestCode,
  PASSWORD,
  signUp,
  type TestUser,
  uniqueEmail,
} from '../src/helpers.ts';

const users: TestUser[] = [];
afterAll(async () => {
  await Promise.all(users.map(deleteUser));
});

describe('email verification (GoTrue + auth-email-code + database gate)', () => {
  it('a new account is unverified even though GoTrue auto-confirms it', async () => {
    const user = await signUp();
    users.push(user);
    const { data } = await admin.auth.admin.getUserById(user.id);
    // Regression: GoTrue sets email_confirmed_at at signup when confirmations are off.
    expect(data.user?.app_metadata.email_verified).toBeUndefined();

    const upload = await callJson(
      'document-upload',
      { action: 'create', title: 'x', mimeType: 'text/plain', sizeBytes: 10 },
      user.token,
    );
    expect(upload.status).toBe(403);
    expect(upload.body.error.code).toBe('email_unverified');

    const ai = await callJson(
      'ai',
      { action: 'summarize', documentId: crypto.randomUUID(), language: 'en' },
      user.token,
    );
    // Either the document is not found (404) or the account gate answers first (403); never 200.
    expect([403, 404]).toContain(ai.status);
  });

  it('the emailed code verifies the account and unlocks uploads', async () => {
    const user = await signUp();
    users.push(user);
    // Sign-up sends the first code; the app calls send_verification the same way.
    const sent = await callJson('auth-email-code', { action: 'send_verification' }, user.token);
    expect([200, 429]).toContain(sent.status);
    const code = await latestCode(user.email);

    const wrong = await callJson(
      'auth-email-code',
      { action: 'confirm_verification', code: code === '000000' ? '111111' : '000000' },
      user.token,
    );
    expect(wrong.status).toBe(400);

    const ok = await callJson(
      'auth-email-code',
      { action: 'confirm_verification', code },
      user.token,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('verified');

    // The refreshed session carries the flag the app reads.
    const { data } = await user.client.auth.refreshSession();
    expect(data.user?.app_metadata.email_verified).toBe(true);
    const token = data.session!.access_token;

    const again = await callJson('auth-email-code', { action: 'send_verification' }, token);
    expect(again.body.status).toBe('already_verified');

    const upload = await callJson(
      'document-upload',
      { action: 'create', title: 'x', mimeType: 'text/plain', sizeBytes: 10 },
      token,
    );
    expect(upload.status).toBe(201);
  });

  it('users cannot mark themselves verified', async () => {
    const user = await signUp();
    users.push(user);
    // user_metadata is user-writable; app_metadata is not.
    await user.client.auth.updateUser({ data: { email_verified: true } });
    const { data } = await admin.auth.admin.getUserById(user.id);
    expect(data.user?.app_metadata.email_verified).toBeUndefined();
    const { data: verified } = await admin.rpc('find_auth_user_by_email', { p_email: user.email });
    expect(verified[0].email_verified).toBe(false);
  });
});

describe('password reset', () => {
  it('resets the password with an emailed code and signs out every session', async () => {
    const user = await signUp(uniqueEmail('reset'));
    users.push(user);
    const sent = await callJson(
      'auth-email-code',
      { action: 'send_password_reset', email: user.email },
      null,
    );
    expect(sent.status).toBe(200);
    const code = await latestCode(user.email, 'reset');

    const newPassword = 'Another1password';
    const done = await callJson(
      'auth-email-code',
      { action: 'complete_password_reset', email: user.email, code, newPassword },
      null,
    );
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('password_updated');

    // The old refresh token no longer works.
    const { error: refreshError } = await user.client.auth.refreshSession();
    expect(refreshError).not.toBeNull();

    const fresh = anonClient();
    expect(
      (await fresh.auth.signInWithPassword({ email: user.email, password: PASSWORD })).error,
    ).not.toBeNull();
    const { data, error } = await fresh.auth.signInWithPassword({
      email: user.email,
      password: newPassword,
    });
    expect(error).toBeNull();
    // Receiving the code proves the inbox, so the account is verified too.
    expect(data.user?.app_metadata.email_verified).toBe(true);
  });

  it('does not reveal whether an address has an account', async () => {
    const res = await callJson(
      'auth-email-code',
      { action: 'send_password_reset', email: uniqueEmail('nobody') },
      null,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
  });
});

describe('function authentication', () => {
  it.each(['ai', 'document-upload', 'delete-account', 'admin-users'])(
    '%s rejects calls without a valid JWT',
    async (name) => {
      // With only the anon apikey, admin-users answers 403 (not an admin) rather than 401.
      const none = await callFunction(name, {}, null);
      expect([401, 403]).toContain(none.status);
      await none.body?.cancel();
      const forged = await callFunction(
        name,
        {},
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.forged',
      );
      expect(forged.status).toBe(401);
      await forged.body?.cancel();
    },
  );
});
