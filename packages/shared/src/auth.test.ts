import { describe, expect, it } from 'vitest';

import {
  authEmailCodeRequestSchema,
  emailCodeSchema,
  emailSchema,
  passwordSchema,
  unmetPasswordRules,
} from './index.ts';

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Correct1horse').success).toBe(true);
    expect(unmetPasswordRules('Correct1horse')).toEqual([]);
  });

  it('reports each unmet rule', () => {
    expect(unmetPasswordRules('short')).toEqual(['length', 'uppercase', 'digit']);
    expect(unmetPasswordRules('ALLUPPERCASE1')).toEqual(['lowercase']);
  });

  it('counts non-Latin letters for case rules', () => {
    expect(unmetPasswordRules('Éléphant2024')).toEqual([]);
  });

  it('rejects passwords longer than bcrypt can hash', () => {
    expect(unmetPasswordRules(`Aa1${'x'.repeat(70)}`)).toEqual(['length']);
  });
});

describe('email and code formats', () => {
  it('normalises emails', () => {
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('accepts only six digits', () => {
    expect(emailCodeSchema.safeParse('012345').success).toBe(true);
    expect(emailCodeSchema.safeParse('12345').success).toBe(false);
    expect(emailCodeSchema.safeParse('12345a').success).toBe(false);
  });
});

describe('auth-email-code request contract', () => {
  it('validates each action', () => {
    expect(authEmailCodeRequestSchema.safeParse({ action: 'send_verification' }).success).toBe(
      true,
    );
    expect(
      authEmailCodeRequestSchema.safeParse({
        action: 'complete_password_reset',
        email: 'a@b.co',
        code: '123456',
        newPassword: 'weak',
      }).success,
    ).toBe(false);
    expect(authEmailCodeRequestSchema.safeParse({ action: 'drop_tables' }).success).toBe(false);
  });
});
