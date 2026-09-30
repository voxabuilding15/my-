import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { type AiProvider, DEFAULT_PRICES, DEFAULT_ROUTES, type TextRequest } from '@studexa/ai';
import type { AiStreamEvent } from '@studexa/shared';

import { withHttp } from '../_shared/http.ts';
import { setReporters } from '../_shared/telemetry.ts';
import type { AiDeps, AiDocument } from './deps.ts';
import { createAiHandler } from './handler.ts';

const DOC = '6f1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d11';
const CONV = '7a1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d12';
const usage = {
  model: 'claude-sonnet-5-5',
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

type Log = {
  calls: string[];
  textRequests: TextRequest[];
  finished: { succeeded: boolean; costMicros?: number | undefined }[];
};

function fakeProvider(log: Log, overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    name: 'anthropic',
    streamText(request, onEvent) {
      log.textRequests.push(request);
      onEvent({ type: 'text', text: 'Cells are ' });
      onEvent({ type: 'text', text: 'alive.' });
      const citation = { pageStart: 1, pageEnd: 1, quote: 'Cells are the unit of life.' };
      if (request.citations) onEvent({ type: 'citation', citation });
      return Promise.resolve({
        text: 'Cells are alive.',
        citations: request.citations ? [citation] : [],
        usage,
        stopReason: 'end' as const,
      });
    },
    generateJson: () =>
      Promise.resolve({
        json: JSON.stringify({
          title: 'Cells',
          questions: [
            {
              type: 'true_false',
              prompt: 'Cells live?',
              choices: [],
              correct_answer: 'true',
              explanation: 'p1',
              source_page: 1,
            },
          ],
        }),
        usage,
        stopReason: 'end' as const,
      }),
    imageToText: () => Promise.reject(new Error('unused')),
    ...overrides,
  };
}

function setup(
  options: {
    doc?: Partial<AiDocument> | null;
    admit?: { allowed: boolean; reason: string | null };
    provider?: Partial<AiProvider>;
    stored?: boolean;
    conversationDoc?: string | null;
  } = {},
) {
  setReporters([]);
  const log: Log = { calls: [], textRequests: [], finished: [] };
  const document: AiDocument | null =
    options.doc === null
      ? null
      : {
          id: DOC,
          title: 'Biology',
          status: 'ready',
          pageCount: 3,
          tokenCount: 40,
          retrievalMode: 'full_context',
          extractionVersion: 1,
          ...options.doc,
        };
  const deps: AiDeps = {
    getCallerId: () => Promise.resolve('u1'),
    settings: () =>
      Promise.resolve({
        routes: DEFAULT_ROUTES,
        prices: DEFAULT_PRICES,
        historyMessages: 20,
        maxContextTokens: 150_000,
        chatFullContextMaxTokens: 30_000,
      }),
    provider: () => fakeProvider(log, options.provider),
    admit: (_u, metrics) => {
      log.calls.push(`admit:${metrics.join('+')}`);
      return Promise.resolve({
        ...(options.admit ?? { allowed: true, reason: null }),
        remaining: 7,
      });
    },
    finish: (input) => {
      log.finished.push({ succeeded: input.succeeded, costMicros: input.costMicros });
      return Promise.resolve();
    },
    getDocument: () => Promise.resolve(document),
    getPages: (_d, page) =>
      Promise.resolve(
        [
          { number: 1, text: 'Cells are the unit of life.' },
          { number: 2, text: 'Mitochondria produce ATP.' },
        ].filter((p) => !page || p.number === page),
      ),
    retrieve: () => {
      log.calls.push('retrieve');
      return Promise.resolve([{ pageStart: 40, pageEnd: 41, content: 'Relevant passage.' }]);
    },
    getOutput: () =>
      Promise.resolve(
        options.stored
          ? { id: 'out-1', output: { markdown: 'Stored summary', citations: [] } }
          : null,
      ),
    saveOutput: () => {
      log.calls.push('saveOutput');
      return Promise.resolve('out-2');
    },
    getConversation: () =>
      Promise.resolve({
        documentId: options.conversationDoc === undefined ? DOC : options.conversationDoc,
        title: '',
      }),
    getHistory: () =>
      Promise.resolve([
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ]),
    saveChatTurn: (input) => {
      log.calls.push(`saveChat:title=${input.setTitle}`);
      return Promise.resolve('msg-1');
    },
    saveQuiz: (input) => {
      log.calls.push(`saveQuiz:${input.questions.length}`);
      return Promise.resolve('quiz-1');
    },
    saveDeck: () => Promise.resolve('deck-1'),
    now: () => 0,
  };
  const handler = withHttp('ai', createAiHandler(deps));
  const call = async (body: unknown) => {
    const res = await handler(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
    );
    if (!res.headers.get('content-type')?.includes('text/event-stream')) {
      return { status: res.status, json: await res.json(), events: [] as AiStreamEvent[] };
    }
    const text = await res.text();
    const events = text
      .split('\n\n')
      .filter(Boolean)
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, '')) as AiStreamEvent);
    return { status: res.status, json: null, events };
  };
  return { call, log };
}

const summarize = { action: 'summarize', documentId: DOC, language: 'en' };

Deno.test(
  'a document tool streams text and page citations, then records usage and stores the result',
  async () => {
    const { call, log } = setup();
    const { events } = await call(summarize);
    assertEquals(
      events.map((e) => e.type),
      ['start', 'text', 'text', 'citation', 'done'],
    );
    assertEquals(events[0], {
      type: 'start',
      model: 'claude-sonnet-5-5',
      cached: false,
      remaining: 7,
    });
    const done = events.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
    assertEquals(done.outputId, 'out-2');
    assertEquals(done.citations[0]?.pageStart, 1);
    assertEquals(log.calls, ['admit:ai_requests', 'saveOutput']);
    assertEquals(log.finished, [{ succeeded: true, costMicros: 4000 }]);
    // Whole document, cached prefix, citations on.
    assertEquals(log.textRequests[0]?.document?.sections.length, 2);
    assertEquals(log.textRequests[0]?.citations, true);
  },
);

Deno.test('stored results are replayed without a model call or quota', async () => {
  const { call, log } = setup({ stored: true });
  const { events } = await call(summarize);
  assertEquals(events[0], {
    type: 'start',
    model: 'claude-sonnet-5-5',
    cached: true,
    remaining: null,
  });
  assertEquals((events[1] as { text: string }).text, 'Stored summary');
  assertEquals(log.calls, []);
});

Deno.test('the answer language follows the request', async () => {
  const { call, log } = setup();
  await call({ action: 'explain', documentId: DOC, page: 2, language: 'ar' });
  assertStringIncludes(log.textRequests[0]!.prompt, 'Arabic');
  assertEquals(
    log.textRequests[0]?.document?.sections.map((s) => s.pageStart),
    [2],
  );
});

Deno.test('quota and rate limits refuse before streaming, with a client error code', async () => {
  const quota = await setup({ admit: { allowed: false, reason: 'quota_exceeded' } }).call(
    summarize,
  );
  assertEquals(quota.status, 402);
  assertEquals(quota.json.error.code, 'quota_exceeded');
  const limited = await setup({ admit: { allowed: false, reason: 'rate_limited' } }).call(
    summarize,
  );
  assertEquals(limited.status, 429);
  const disabled = await setup({ admit: { allowed: false, reason: 'ai_disabled' } }).call(
    summarize,
  );
  assertEquals(disabled.json.error.code, 'ai_unavailable');
});

Deno.test('documents still processing cannot be used yet', async () => {
  const { status, json } = await setup({ doc: { status: 'processing' } }).call(summarize);
  assertEquals(status, 409);
  assertEquals(json.error.code, 'document_not_ready');
  assertEquals((await setup({ doc: null }).call(summarize)).status, 404);
});

Deno.test('a safety decline ends the stream with an error and gives the quota back', async () => {
  const { call, log } = setup({
    provider: {
      streamText: () =>
        Promise.resolve({ text: '', citations: [], usage, stopReason: 'refusal' as const }),
    },
  });
  const { events } = await call(summarize);
  assertEquals(events.at(-1), {
    type: 'error',
    code: 'ai_declined',
    message: 'This request can’t be answered. Try rephrasing it as a study question.',
  });
  assertEquals(log.finished, [{ succeeded: false, costMicros: undefined }]);
});

Deno.test('chat on a large document retrieves passages and saves the turn', async () => {
  const { call, log } = setup({ doc: { retrievalMode: 'hybrid' } });
  const { events } = await call({
    action: 'chat',
    conversationId: CONV,
    message: 'What is ATP?',
    language: 'fr',
  });
  assertEquals((events.at(-1) as { messageId?: string }).messageId, 'msg-1');
  assertEquals(log.calls, ['admit:chat_messages', 'retrieve', 'saveChat:title=true']);
  const request = log.textRequests[0]!;
  assertEquals(request.placement, 'latest');
  assertEquals(request.history?.length, 2);
  assertEquals(request.document?.sections[0]?.pageStart, 40);
  assertStringIncludes(request.prompt, 'French');
});

Deno.test('chat on a small document sends the whole text as the cached prefix', async () => {
  const { call, log } = setup();
  await call({ action: 'chat', conversationId: CONV, message: 'What is ATP?', language: 'en' });
  assertEquals(log.calls.includes('retrieve'), false);
  assertEquals(log.textRequests[0]?.placement, 'prefix');
  assertEquals(log.textRequests[0]?.document?.sections.length, 2);
});

Deno.test(
  'chat on a document above the chat threshold retrieves passages even without vectors',
  async () => {
    // Processed before the threshold was lowered: still `full_context`, but 80k tokens.
    const { call, log } = setup({ doc: { tokenCount: 80_000 } });
    await call({ action: 'chat', conversationId: CONV, message: 'What is ATP?', language: 'en' });
    assertEquals(log.calls.includes('retrieve'), true);
    assertEquals(log.textRequests[0]?.placement, 'latest');
  },
);

Deno.test('a tool asked about one page runs on the light page route', async () => {
  const { call, log } = setup();
  const { events } = await call({ ...summarize, page: 2 });
  assertEquals((events[0] as { model: string }).model, DEFAULT_ROUTES.page_tool.model);
  assertEquals(DEFAULT_ROUTES.page_tool.model, 'claude-haiku-4-5');
  assertEquals(log.textRequests[0]?.route, DEFAULT_ROUTES.page_tool);
  assertEquals(
    log.textRequests[0]?.document?.sections.map((s) => s.pageStart),
    [2],
  );
});

Deno.test('whole-document tools keep the full context budget and the strong model', async () => {
  const { call, log } = setup({ doc: { tokenCount: 140_000, retrievalMode: 'hybrid' } });
  const { events } = await call(summarize);
  assertEquals((events[0] as { model: string }).model, 'claude-sonnet-5-5');
  // Every page is sent (not retrieved passages), up to ai.context.max_context_tokens.
  assertEquals(log.calls.includes('retrieve'), false);
  assertEquals(log.textRequests[0]?.document?.sections.length, 2);
});

Deno.test('chat without a document answers without citations', async () => {
  const { call, log } = setup({ conversationDoc: null });
  await call({ action: 'chat', conversationId: CONV, message: 'How do I revise?', language: 'en' });
  assertEquals(log.textRequests[0]?.document, undefined);
  assertEquals(log.textRequests[0]?.citations, false);
});

Deno.test('quizzes are generated as validated JSON and saved', async () => {
  const { call, log } = setup();
  const { events } = await call({
    action: 'quiz',
    documentId: DOC,
    language: 'en',
    questionCount: 5,
  });
  assertEquals((events.at(-1) as { quizId?: string }).quizId, 'quiz-1');
  assertEquals(log.calls, ['admit:ai_requests+quizzes', 'saveQuiz:1']);
});

Deno.test('unusable generated output fails cleanly and refunds the quota', async () => {
  const { call, log } = setup({
    provider: {
      generateJson: () =>
        Promise.resolve({
          json: '{"title": "x", "questions": []}',
          usage,
          stopReason: 'end' as const,
        }),
    },
  });
  const { events } = await call({ action: 'quiz', documentId: DOC, language: 'en' });
  assertEquals((events.at(-1) as { code?: string }).code, 'ai_unavailable');
  assert(log.finished.every((f) => !f.succeeded));
});

Deno.test('requests are validated', async () => {
  const { status } = await setup().call({
    action: 'summarize',
    documentId: 'nope',
    language: 'en',
  });
  assertEquals(status, 400);
});
