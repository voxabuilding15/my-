import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makePdf, studyPages } from '../src/fixtures.ts';
import {
  admin,
  callFunction,
  clearMockRequests,
  createUser,
  deleteUser,
  mockRequests,
  readSse,
  setTier,
  type TestUser,
  uploadDocument,
  waitForDocument,
} from '../src/helpers.ts';

let user: TestUser;
let documentId: string;
let largeDocumentId: string;
const users: TestUser[] = [];

async function ask(u: TestUser, body: Record<string, unknown>) {
  const res = await callFunction('ai', body, u.token);
  if (!res.headers.get('content-type')?.includes('text/event-stream')) {
    return { status: res.status, events: [] as any[], error: (await res.json()) as any };
  }
  return { status: res.status, events: await readSse(res), error: null };
}

const textOf = (events: any[]) =>
  events
    .filter((e) => e.type === 'text')
    .map((e) => e.text)
    .join('');

async function used(userId: string, metric: string) {
  const { data } = await admin
    .from('usage_counters')
    .select('used')
    .match({ user_id: userId, metric });
  return (data ?? []).reduce((sum, row) => sum + row.used, 0);
}

async function readyPdf(u: TestUser, pages: number, lines = 10) {
  const { documentId: id } = await uploadDocument(u, {
    bytes: makePdf(studyPages(pages, lines)),
    mimeType: 'application/pdf',
    title: `Biology ${pages}`,
  });
  const doc = await waitForDocument(id);
  expect(doc.status).toBe('ready');
  return id;
}

beforeAll(async () => {
  user = await createUser('ai');
  users.push(user);
  await setTier(user.id, 'premium');
  documentId = await readyPdf(user, 3);
  largeDocumentId = await readyPdf(user, 250, 40);
}, 240_000);

afterAll(async () => {
  await Promise.all(users.map(deleteUser));
});

describe('document tools', () => {
  it('streams a summary with page citations, the configured model and a cached prefix', async () => {
    await clearMockRequests();
    const { status, events } = await ask(user, { action: 'summarize', documentId, language: 'en' });
    expect(status).toBe(200);
    expect(events[0]).toMatchObject({ type: 'start', model: 'claude-sonnet-5-5', cached: false });
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1);
    expect(textOf(events)).toContain('According to your document');
    const done = events.at(-1);
    expect(done.type).toBe('done');
    expect(done.outputId).toBeTruthy();
    expect(done.citations[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });

    const [call] = (await mockRequests()).filter((r) => r.path === '/v1/messages');
    expect(call?.model).toBe('claude-sonnet-5-5');
    expect(call?.summary).toMatchObject({
      stream: true,
      citations: true,
      cached: true,
      sections: 3,
      effort: 'low',
    });
  });

  it('replays a stored result for free, without calling the model', async () => {
    await clearMockRequests();
    const before = await used(user.id, 'ai_requests');
    const { events } = await ask(user, { action: 'summarize', documentId, language: 'en' });
    expect(events[0]).toMatchObject({ type: 'start', cached: true, remaining: null });
    expect(await mockRequests()).toHaveLength(0);
    expect(await used(user.id, 'ai_requests')).toBe(before);
  });

  it('answers in the requested language (Arabic and French)', async () => {
    const ar = await ask(user, { action: 'explain', documentId, page: 2, language: 'ar' });
    expect(textOf(ar.events)).toContain('وفقًا لمستندك');
    const fr = await ask(user, { action: 'eli10', documentId, language: 'fr' });
    expect(textOf(fr.events)).toContain('D’après votre document');
  });

  it('routes light tasks to Haiku', async () => {
    await clearMockRequests();
    await ask(user, { action: 'explain', documentId, page: 1, language: 'en' });
    const [call] = await mockRequests();
    expect(call?.model).toBe('claude-haiku-4-5');
    expect(call?.summary.effort).toBeNull();
  });

  it('generates and saves a quiz and a flashcard deck', async () => {
    const quiz = await ask(user, { action: 'quiz', documentId, language: 'en', questionCount: 4 });
    const quizId = quiz.events.at(-1).quizId;
    expect(quizId).toBeTruthy();
    const { data: questions } = await user.client
      .from('quiz_questions')
      .select('id')
      .eq('quiz_id', quizId);
    expect(questions).toHaveLength(4);

    const deck = await ask(user, {
      action: 'flashcards',
      documentId,
      language: 'en',
      cardCount: 6,
    });
    const deckId = deck.events.at(-1).deckId;
    const { data: cards } = await user.client.from('flashcards').select('id').eq('deck_id', deckId);
    expect(cards).toHaveLength(6);
  });

  it('a document not processed yet cannot be used', async () => {
    // Created but never completed: no worker can race this test.
    const created = await callFunction(
      'document-upload',
      { action: 'create', title: 'Pending', mimeType: 'text/plain', sizeBytes: 10 },
      user.token,
    ).then((r) => r.json());
    const res = await ask(user, {
      action: 'summarize',
      documentId: created.documentId,
      language: 'en',
    });
    expect(res.status).toBe(409);
    expect(res.error.error.code).toBe('document_not_ready');
  });
});

describe('long generations', () => {
  it('keeps a silent connection alive with heartbeats until the quiz is ready', async () => {
    const { documentId: id } = await uploadDocument(user, {
      bytes: new Uint8Array(Buffer.from('Cells and MOCK_STALL enzymes.\n\nOsmosis moves water.')),
      mimeType: 'text/plain',
    });
    await waitForDocument(id);
    const res = await callFunction('ai', { action: 'quiz', documentId: id, language: 'en', questionCount: 3 }, user.token);
    const raw = await res.text();
    // One heartbeat every 15 s while the model works; the app's idle timeout is 60 s.
    expect(raw).toContain(': ping');
    expect(raw).toContain('"type":"done"');
  }, 60_000);
});

describe('chat', () => {
  it('keeps history, retrieves passages from a large document and saves both turns', async () => {
    const { data: conversation } = await user.client
      .from('conversations')
      .insert({ user_id: user.id, document_id: largeDocumentId })
      .select('id')
      .single();
    await clearMockRequests();
    const first = await ask(user, {
      action: 'chat',
      conversationId: conversation!.id,
      message: 'What is osmosis?',
      language: 'en',
    });
    expect(first.events.at(-1).messageId).toBeTruthy();
    const second = await ask(user, {
      action: 'chat',
      conversationId: conversation!.id,
      message: 'And enzymes?',
      language: 'en',
    });
    expect(second.events.at(-1).type).toBe('done');

    const calls = (await mockRequests()).filter((r) => r.path === '/v1/messages');
    expect(calls.at(-1)?.summary.historyTurns).toBe(3); // user, assistant, new question
    expect(calls.at(-1)?.summary.sections).toBeGreaterThan(0); // retrieved passages
    expect(
      (await mockRequests()).some((r) => r.path === '/v1/embeddings' && r.summary.kind === 'query'),
    ).toBe(true);

    const { data: messages } = await user.client
      .from('messages')
      .select('role')
      .eq('conversation_id', conversation!.id);
    expect(messages).toHaveLength(4);
    const { data: conv } = await user.client
      .from('conversations')
      .select('title')
      .eq('id', conversation!.id)
      .single();
    expect(conv?.title).toBe('What is osmosis?');
  });

  it('a reported answer is snapshotted for reviewers without the reporter', async () => {
    const { data: conversation } = await user.client
      .from('conversations')
      .insert({ user_id: user.id, document_id: documentId })
      .select('id')
      .single();
    const chat = await ask(user, {
      action: 'chat',
      conversationId: conversation!.id,
      message: 'Explain cells',
      language: 'en',
    });
    const messageId = chat.events.at(-1).messageId;
    const { error } = await user.client.from('content_reports').insert({
      reporter_id: user.id,
      target_type: 'message',
      target_id: messageId,
      reason: 'incorrect',
    });
    expect(error).toBeNull();
    const { data: report } = await admin
      .from('content_reports')
      .select('content_snapshot, model')
      .eq('target_id', messageId)
      .single();
    expect(report?.content_snapshot).toContain('According to your document');
    expect(report?.model).toBe('claude-haiku-4-5');
  });
});

describe('quotas, refunds and failures', () => {
  let free: TestUser;
  let freeDoc: string;
  beforeAll(async () => {
    free = await createUser('ai-free');
    users.push(free);
    freeDoc = await readyPdf(free, 2);
  }, 120_000);

  it('shows Free users their remaining requests and refuses at the daily limit', async () => {
    const first = await ask(free, {
      action: 'explain',
      documentId: freeDoc,
      page: 1,
      language: 'en',
      regenerate: true,
    });
    const remaining = first.events[0].remaining as number;
    expect(remaining).toBeGreaterThan(0);
    expect(first.events.at(-1).remaining).toBe(remaining);

    // Use up the rest directly (the limit is 20/day on Free).
    await admin
      .from('usage_counters')
      .update({ used: 20 })
      .match({ user_id: free.id, metric: 'ai_requests' });
    const refused = await ask(free, {
      action: 'explain',
      documentId: freeDoc,
      page: 2,
      language: 'en',
      regenerate: true,
    });
    expect(refused.status).toBe(402);
    expect(refused.error.error.code).toBe('quota_exceeded');
    await admin
      .from('usage_counters')
      .update({ used: 0 })
      .match({ user_id: free.id, metric: 'ai_requests' });
  });

  it('a safety decline ends the stream with ai_declined and gives the quota back', async () => {
    const { data: conversation } = await free.client
      .from('conversations')
      .insert({ user_id: free.id, document_id: freeDoc })
      .select('id')
      .single();
    const before = await used(free.id, 'chat_messages');
    const res = await ask(free, {
      action: 'chat',
      conversationId: conversation!.id,
      message: 'MOCK_REFUSE please',
      language: 'en',
    });
    expect(res.events.at(-1)).toMatchObject({ type: 'error', code: 'ai_declined' });
    expect(await used(free.id, 'chat_messages')).toBe(before);
  });

  it('retries a failing provider, then fails cleanly and refunds (API retry validation)', async () => {
    const { data: conversation } = await free.client
      .from('conversations')
      .insert({ user_id: free.id, document_id: freeDoc })
      .select('id')
      .single();
    await clearMockRequests();
    const before = await used(free.id, 'chat_messages');
    const res = await ask(free, {
      action: 'chat',
      conversationId: conversation!.id,
      message: 'MOCK_ERROR now',
      language: 'en',
    });
    expect(res.events.at(-1)).toMatchObject({ type: 'error', code: 'ai_unavailable' });
    // The SDK retries twice (3 attempts) before giving up.
    expect((await mockRequests()).filter((r) => r.path === '/v1/messages')).toHaveLength(3);
    expect(await used(free.id, 'chat_messages')).toBe(before);
    const { data: messages } = await free.client
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation!.id);
    expect(messages).toHaveLength(0);
  });

  it('a client that disconnects mid-stream stops generation and is not charged a saved turn', async () => {
    const { data: conversation } = await free.client
      .from('conversations')
      .insert({ user_id: free.id, document_id: freeDoc })
      .select('id')
      .single();
    const controller = new AbortController();
    const res = await callFunction(
      'ai',
      {
        action: 'chat',
        conversationId: conversation!.id,
        message: 'MOCK_SLOW answer',
        language: 'en',
      },
      free.token,
      { signal: controller.signal },
    );
    const reader = res.body!.getReader();
    await reader.read(); // start event
    controller.abort();
    await new Promise((r) => setTimeout(r, 3000));
    const { data: messages } = await free.client
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation!.id);
    expect(messages).toHaveLength(0);
  });

  it('rate-limits bursts per user (12 per minute)', async () => {
    const burst = await createUser('ai-burst');
    users.push(burst);
    await setTier(burst.id, 'premium');
    const statuses = await Promise.all(
      Array.from({ length: 14 }, () =>
        callFunction(
          'ai',
          { action: 'translate_text', text: 'Bonjour', from: 'fr', to: 'en' },
          burst.token,
        ).then(async (r) => {
          await r.body?.cancel();
          return r.status;
        }),
      ),
    );
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });
});
