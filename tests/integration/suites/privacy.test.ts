/**
 * No personal data or document contents in crash reports, the internal error log, analytics
 * or job diagnostics. Failures are forced with MOCK_ECHO, where the upstream API quotes the
 * request back in its error (the realistic way content leaks into error messages), then every
 * diagnostic sink is searched for the user's email and the secret text.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../src/env.ts';
import { makePdf } from '../src/fixtures.ts';
import {
  admin,
  callFunction,
  createUser,
  deleteUser,
  readSse,
  runWorker,
  setTier,
  sleep,
  type TestUser,
  uploadDocument,
  waitForDocument,
} from '../src/helpers.ts';

const SECRET = 'MOCK_ECHO confidential-exam-answer-7431';

let user: TestUser;
let documentId: string;
beforeAll(async () => {
  user = await createUser('privacy');
  await setTier(user.id, 'premium');
  // Large enough for embeddings, so the worker's Voyage call sees (and echoes) the text.
  const pages = Array.from({ length: 220 }, (_, p) =>
    Array.from(
      { length: 40 },
      (_, l) => `Page ${p + 1} line ${l + 1}: ${SECRET} for ${user.email}`,
    ),
  );
  const upload = await uploadDocument(user, {
    bytes: makePdf(pages),
    mimeType: 'application/pdf',
    title: `Private ${SECRET}`,
  });
  documentId = upload.documentId;
  await waitForDocument(documentId);
}, 180_000);

afterAll(async () => {
  await deleteUser(user);
});

async function sentryPayloads(): Promise<string> {
  const envelopes = (await (await fetch(`${env.mockUrl}/__sentry`)).json()) as string[];
  return envelopes.join('\n');
}

const needles = () => [user.email, 'confidential-exam-answer-7431'];

describe('privacy of diagnostics', () => {
  it('forces failures in the Edge Function and the worker that quote the user’s text', async () => {
    // Edge Function: the model API rejects the request and quotes the question back.
    const { data: conversation } = await user.client
      .from('conversations')
      .insert({ user_id: user.id, document_id: documentId })
      .select('id')
      .single();
    const res = await callFunction(
      'ai',
      {
        action: 'chat',
        conversationId: conversation!.id,
        message: `${SECRET} my email is ${user.email}`,
        language: 'en',
      },
      user.token,
    );
    const events = await readSse(res);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'ai_unavailable' });

    // Worker: the embeddings API rejects the chunks and quotes them back.
    for (let i = 0; i < 5; i++) await runWorker().catch(() => undefined);

    // Reports are sent in the background.
    await sleep(3000);
    const envelopes = await sentryPayloads();
    expect(envelopes.length).toBeGreaterThan(0); // the failures were reported…
    for (const needle of needles()) expect(envelopes).not.toContain(needle); // …without content
  });

  it('the internal error log holds no content or emails', async () => {
    const { data } = await admin
      .from('error_logs')
      .select('message, context')
      .order('created_at', { ascending: false })
      .limit(200);
    expect(data!.length).toBeGreaterThan(0);
    const raw = JSON.stringify(data);
    for (const needle of needles()) expect(raw).not.toContain(needle);
  });

  it('usage analytics hold counts and models only', async () => {
    // Failed requests are refunded, so record one successful request first.
    await readSse(
      await callFunction(
        'ai',
        { action: 'explain', documentId, page: 1, language: 'en' },
        user.token,
      ),
    );
    const { data } = await admin.from('usage_events').select('*').eq('user_id', user.id);
    expect(data!.length).toBeGreaterThan(0);
    const raw = JSON.stringify(data);
    for (const needle of needles()) expect(raw).not.toContain(needle);
    expect(Object.keys(data![0]!).sort()).toEqual(
      [
        'action',
        'cached_input_tokens',
        'cost_micros',
        'created_at',
        'id',
        'input_tokens',
        'latency_ms',
        'model',
        'output_tokens',
        'succeeded',
        'tier',
        'user_id',
      ].sort(),
    );
  });

  it('job diagnostics shown to staff hold no content', async () => {
    const sql = postgres(process.env.DB_URL!, { max: 1 });
    try {
      const rows = await sql`select last_error from private.jobs where last_error is not null`;
      expect(rows.length).toBeGreaterThan(0);
      const raw = JSON.stringify(rows);
      for (const needle of needles()) expect(raw).not.toContain(needle);
    } finally {
      await sql.end();
    }
  });
});
