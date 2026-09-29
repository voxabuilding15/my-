import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, scrubText, scrubValue } from './index.ts';

const EMAIL = 'amina.benali@example.com';
const DOC_TEXT = 'Chapitre 3 : la photosynthèse transforme la lumière';
// A fake token (its signature is the text 'signature-value-here'). gitleaks:allow
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.c2lnbmF0dXJlLXZhbHVlLWhlcmU'; // gitleaks:allow

/** Everything that must never leave the device or server in a report. */
const FORBIDDEN = [
  EMAIL,
  DOC_TEXT,
  JWT,
  'sk-ant-api03-abcdefghijklmnop',
  'Secret question',
  'Amina',
];

function expectClean(value: unknown) {
  const raw = JSON.stringify(value);
  for (const needle of FORBIDDEN) expect(raw).not.toContain(needle);
}

describe('scrubText', () => {
  it('removes emails, tokens, keys and signed URL parameters', () => {
    const out = scrubText(
      `user ${EMAIL} sent Bearer ${JWT} with sk-ant-api03-abcdefghijklmnop to ` +
        `https://x.supabase.co/storage/v1/object/upload/sign/documents/a.pdf?token=${JWT}&x=1`,
    );
    expectClean(out);
    expect(out).toContain('[email]');
    expect(out).toContain('Bearer [jwt]');
    expect(scrubText('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [token]');
    expect(out).toContain('token=[redacted]');
  });

  it('removes row contents quoted by Postgres errors', () => {
    const pg =
      'null value in column "citations" of relation "messages" violates not-null constraint | ' +
      `Failing row contains (465c, 95e8, user, Secret question, null, (1,2), 'what':1).`;
    const out = scrubText(pg);
    expect(out).toContain('violates not-null constraint');
    expect(out).toContain('Failing row contains ([redacted])');
    expectClean(out);
    expect(scrubText(`duplicate key | Key (email)=(${EMAIL}) already exists.`)).toBe(
      'duplicate key | Key (email)=([redacted]) already exists.',
    );
    expect(scrubText(`ERROR: x\nDETAIL: ${DOC_TEXT}`)).toBe('ERROR: x\nDETAIL: [redacted]');
    // Inside a JSON log line the rest of the line survives, so the line stays valid JSON.
    const line = JSON.stringify({ error: `x\nDETAIL: ${DOC_TEXT}`, ms: 3 });
    expect(JSON.parse(scrubText(line))).toEqual({ error: 'x\nDETAIL: [redacted]', ms: 3 });
  });

  it('keeps ordinary diagnostic text and caps the length', () => {
    expect(scrubText('TypeError: undefined is not a function')).toBe(
      'TypeError: undefined is not a function',
    );
    expect(scrubText('x'.repeat(5000)).length).toBeLessThanOrEqual(4001);
  });
});

describe('scrubValue', () => {
  it('drops content-bearing keys at any depth and scrubs other strings', () => {
    const out = scrubValue({
      action: 'summarize',
      documentId: '6f1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d11',
      request: { prompt: DOC_TEXT, history: [{ role: 'user', content: 'Secret question' }] },
      title: 'Amina – notes de bio',
      detail: `for ${EMAIL}`,
      nested: { deeper: { text: DOC_TEXT, ocrText: DOC_TEXT } },
    });
    expectClean(out);
    expect(out).toMatchObject({
      action: 'summarize',
      documentId: '6f1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d11',
      title: '[redacted]',
      detail: 'for [email]',
    });
  });
});

describe('scrubEvent (Sentry beforeSend)', () => {
  const event = {
    event_id: 'abc',
    message: `Upload failed for ${EMAIL}`,
    user: { id: 'u-1', email: EMAIL, username: 'Amina', ip_address: '10.0.0.1' },
    request: {
      url: `https://api.studexa.app/functions/v1/ai?token=${JWT}`,
      method: 'POST',
      data: { message: 'Secret question' },
      headers: { Authorization: `Bearer ${JWT}` },
      cookies: 'sb=1',
    },
    extra: { prompt: DOC_TEXT, documentId: 'd-1' },
    contexts: {
      os: { name: 'Android', version: '15' },
      device: { name: "Amina's Pixel", model: 'Pixel 8' },
      details: { question: 'Secret question', action: 'chat' },
    },
    breadcrumbs: [
      { category: 'console', message: `log ${DOC_TEXT}` },
      {
        category: 'fetch',
        data: {
          url: `https://x.supabase.co/storage/v1/object/sign/documents/u/a.pdf?token=${JWT}`,
          method: 'PUT',
          status_code: 200,
          request_body: DOC_TEXT,
        },
      },
      { category: 'navigation', data: { from: '/documents?q=Secret question', to: '/chat/1' } },
      { category: 'ui.click', message: 'View > Text' },
    ],
    exception: {
      values: [
        {
          type: 'PostgrestError',
          value: `Failing row contains (1, Secret question, ${EMAIL})`,
          stacktrace: { frames: [{ function: 'save', vars: { question: 'Secret question' } }] },
        },
      ],
    },
  };

  it('leaves no personal data or document content anywhere in the event', () => {
    expectClean(scrubEvent(event));
  });

  it('keeps what is needed to debug', () => {
    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: 'u-1' });
    expect(out.request).toEqual({ url: 'https://api.studexa.app/functions/v1/ai', method: 'POST' });
    expect(out.extra).toEqual({ prompt: '[redacted]', documentId: 'd-1' });
    expect(out.contexts).toMatchObject({
      os: { name: 'Android', version: '15' },
      device: { model: 'Pixel 8' },
      details: { action: 'chat' },
    });
    expect(out.breadcrumbs?.map((b) => b.category)).toEqual(['fetch', 'navigation', 'ui.click']);
    expect(out.breadcrumbs?.[0]?.data).toEqual({
      url: 'https://x.supabase.co/storage/v1/object/sign/documents/u/a.pdf',
      method: 'PUT',
      status_code: 200,
    });
    expect(out.exception?.values?.[0]).toMatchObject({ type: 'PostgrestError' });
  });

  it('drops console breadcrumbs entirely', () => {
    expect(scrubBreadcrumb({ category: 'console', message: DOC_TEXT })).toBeNull();
  });
});
