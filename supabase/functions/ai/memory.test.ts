/**
 * Memory leak check for the ai function: thousands of requests through the real handler (SSE
 * streaming, admission, citations, cancelled streams) must not grow the heap. Needs a manual
 * GC, so it only runs with:
 *
 *   deno test -A --v8-flags=--expose-gc ai/memory.test.ts
 */
import { assert } from '@std/assert';
import { type AiProvider, DEFAULT_PRICES, DEFAULT_ROUTES } from '@studexa/ai';

import { withHttp } from '../_shared/http.ts';
import { setReporters } from '../_shared/telemetry.ts';
import type { AiDeps } from './deps.ts';
import { createAiHandler } from './handler.ts';

const gc = (globalThis as { gc?: () => void }).gc;
const DOC = '6f1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d11';
const usage = {
  model: 'm',
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const provider: AiProvider = {
  name: 'anthropic',
  streamText(_request, onEvent) {
    for (let i = 0; i < 20; i++) onEvent({ type: 'text', text: `token ${i} ` });
    onEvent({ type: 'citation', citation: { pageStart: 1, pageEnd: 1, quote: 'q'.repeat(200) } });
    return Promise.resolve({
      text: 'x'.repeat(400),
      citations: [],
      usage,
      stopReason: 'end' as const,
    });
  },
  generateJson: () => Promise.reject(new Error('unused')),
  imageToText: () => Promise.reject(new Error('unused')),
};

const pages = Array.from({ length: 30 }, (_, i) => ({
  number: i + 1,
  text: `Page ${i + 1} `.repeat(300),
}));

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
  provider: () => provider,
  admit: () => Promise.resolve({ allowed: true, reason: null, remaining: 5 }),
  finish: () => Promise.resolve(),
  getDocument: () =>
    Promise.resolve({
      id: DOC,
      title: 'T',
      status: 'ready',
      pageCount: 30,
      tokenCount: 27_000,
      retrievalMode: 'full_context',
      extractionVersion: 1,
    }),
  getPages: () => Promise.resolve(pages),
  retrieve: () => Promise.resolve([]),
  getOutput: () => Promise.resolve(null),
  saveOutput: () => Promise.resolve('o1'),
  getConversation: () => Promise.resolve(null),
  getHistory: () => Promise.resolve([]),
  saveChatTurn: () => Promise.resolve('m1'),
  saveQuiz: () => Promise.resolve('q1'),
  saveDeck: () => Promise.resolve('d1'),
  now: () => Date.now(),
};

const handler = withHttp('ai', createAiHandler(deps));
const request = () =>
  new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      action: 'summarize',
      documentId: DOC,
      language: 'en',
      regenerate: true,
    }),
  });

async function run(count: number) {
  for (let i = 0; i < count; i++) {
    const res = await handler(request());
    if (i % 10 === 0)
      await res.body?.cancel(); // the student left mid-answer
    else await res.text();
  }
}

function heapMb(): number {
  gc!();
  gc!();
  return Deno.memoryUsage().heapUsed / 1024 / 1024;
}

Deno.test({
  name: 'thousands of AI requests do not grow the heap',
  ignore: !gc,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    setReporters([]);
    await run(300); // warm-up: JIT, module caches
    const before = heapMb();
    await run(3000);
    const after = heapMb();
    console.log(
      JSON.stringify({
        metric: 'ai_function_heap',
        requests: 3000,
        beforeMb: before,
        afterMb: after,
      }),
    );
    // A leak of even 1 KB per request would add ~3 MB.
    assert(after - before < 3, `heap grew ${(after - before).toFixed(1)} MB over 3000 requests`);
  },
});
