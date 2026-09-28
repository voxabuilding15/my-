import { assert, assertEquals, assertNotEquals } from '@std/assert';

import { generateNumericCode, hmacSha256Hex, timingSafeEqual } from './crypto.ts';
import { codeEmail } from './email/templates.ts';
import { HttpError } from './errors.ts';
import { withHttp } from './http.ts';
import { redact } from './logger.ts';
import { setReporters } from './telemetry.ts';

Deno.test('codes are six random digits', () => {
  const codes = new Set(Array.from({ length: 200 }, () => generateNumericCode()));
  for (const code of codes) assert(/^\d{6}$/.test(code));
  assert(codes.size > 190);
});

Deno.test('HMAC depends on the key', async () => {
  const a = await hmacSha256Hex('k'.repeat(32), 'value');
  assertEquals(a.length, 64);
  assertNotEquals(a, await hmacSha256Hex('j'.repeat(32), 'value'));
});

Deno.test('logs never contain email addresses', () => {
  assertEquals(redact('{"to":"ada@example.com"}'), '{"to":"[email]"}');
});

Deno.test('Arabic emails are right-to-left and keep the code left-to-right', () => {
  const email = codeEmail({
    to: 'a@b.co',
    code: '123456',
    purpose: 'verify_email',
    locale: 'ar',
    ttlMinutes: 10,
  });
  assert(email.html.includes('dir="rtl"'));
  assert(email.html.includes('dir="ltr">123456'));
  assert(email.text.includes('123456'));
});

Deno.test('secrets are compared in constant time and exactly', () => {
  assert(timingSafeEqual('secret-value', 'secret-value'));
  assert(!timingSafeEqual('secret-value', 'secret-valuf'));
  assert(!timingSafeEqual('secret', 'secret-value'));
});

Deno.test('unexpected errors are reported; client errors are not', async () => {
  const reports: string[] = [];
  setReporters([
    (report) => Promise.resolve(void reports.push(`${report.fn}:${String(report.error)}`)),
  ]);
  const failing = withHttp('boom', () => Promise.reject(new Error('db down')));
  const rejected = withHttp('nope', () => Promise.reject(new HttpError('forbidden')));
  const req = () => new Request('http://localhost', { method: 'POST' });
  assertEquals((await failing(req())).status, 500);
  assertEquals((await rejected(req())).status, 403);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(reports, ['boom:Error: db down']);
  setReporters([]);
});
