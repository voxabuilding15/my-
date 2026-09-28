import { AppError } from '@studexa/shared';

import { MOCK_EMAIL_CODE, MockAuthRepository } from '../data/mock-auth-repository';

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: AppError) => error.code,
  );

describe('MockAuthRepository (mirrors server rules)', () => {
  let now = 1_000_000;
  const repo = () => new MockAuthRepository(0, () => now);

  it('signs up unverified and verifies with the emailed code', async () => {
    const r = repo();
    const user = await r.signUp({
      email: 'New@Example.com',
      password: 'Str0ngPassword',
      displayName: 'New',
    });
    expect(user).toMatchObject({ email: 'new@example.com', emailVerified: false });
    expect(await code(r.confirmVerificationCode('000000'))).toBe('invalid_code');
    await r.confirmVerificationCode(MOCK_EMAIL_CODE);
    expect((await r.getCurrentUser())?.emailVerified).toBe(true);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const r = repo();
    expect(
      await code(
        r.signUp({ email: 'demo@studexa.app', password: 'Str0ngPassword', displayName: 'x' }),
      ),
    ).toBe('email_in_use');
    expect(await code(r.signUp({ email: 'a@b.co', password: 'weak', displayName: 'x' }))).toBe(
      'weak_password',
    );
  });

  it('enforces the resend delay and the attempt limit', async () => {
    const r = repo();
    await r.signUp({ email: 'x@y.co', password: 'Str0ngPassword', displayName: 'x' });
    expect(await code(r.sendVerificationCode())).toBe('resend_too_soon');
    now += 61_000;
    expect(await code(r.sendVerificationCode())).toBe('ok');
    for (let i = 0; i < 4; i++)
      expect(await code(r.confirmVerificationCode('000000'))).toBe('invalid_code');
    expect(await code(r.confirmVerificationCode('000000'))).toBe('code_expired');
    expect(await code(r.confirmVerificationCode(MOCK_EMAIL_CODE))).toBe('code_expired');
  });

  it('resets a password without revealing whether the email exists', async () => {
    const r = repo();
    expect(await r.requestPasswordReset('nobody@example.com')).toEqual({ retryAfterSeconds: 60 });
    await r.requestPasswordReset('demo@studexa.app');
    await r.checkPasswordResetCode('demo@studexa.app', MOCK_EMAIL_CODE);
    await r.completePasswordReset('demo@studexa.app', MOCK_EMAIL_CODE, 'BrandNew1pass');
    expect(await code(r.signInWithPassword('demo@studexa.app', 'Studexa2026'))).toBe(
      'invalid_credentials',
    );
    expect(await code(r.signInWithPassword('demo@studexa.app', 'BrandNew1pass'))).toBe('ok');
  });

  it('requires a recent sign-in to delete the account', async () => {
    const r = repo();
    await r.signInWithPassword('demo@studexa.app', 'Studexa2026');
    now += 11 * 60_000;
    await r.updateDisplayName('Renamed');
    expect(await code(r.deleteAccount())).toBe('reauthentication_required');
    await r.signInWithPassword('demo@studexa.app', 'Studexa2026');
    expect(await code(r.deleteAccount())).toBe('ok');
    expect(await code(r.signInWithPassword('demo@studexa.app', 'Studexa2026'))).toBe(
      'invalid_credentials',
    );
  });
});
