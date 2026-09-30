import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  buildMessages,
  costMicros,
  createAnthropicProvider,
  DEFAULT_ROUTES,
  documentFromChunks,
  documentFromPages,
  flashcardsSchema,
  quizSchema,
  resolveRoutes,
  SYSTEM_PROMPT,
  toolPrompt,
  type StreamEvent,
  type TextRequest,
} from '../src/index.ts';

const doc = {
  title: 'Cells',
  sections: [
    { pageStart: 1, pageEnd: 1, text: 'Cells are the unit of life.' },
    { pageStart: 2, pageEnd: 2, text: 'Mitochondria produce ATP.' },
  ],
};
const route = DEFAULT_ROUTES.chat;

describe('buildMessages', () => {
  it('puts a cached document first and the new turn last', () => {
    const messages = buildMessages({
      route,
      system: 's',
      document: doc,
      prompt: 'What makes ATP?',
      citations: true,
    });
    expect(messages).toHaveLength(1);
    const content = messages[0]!.content as {
      type: string;
      cache_control?: unknown;
      citations?: unknown;
    }[];
    expect(content[0]).toMatchObject({
      type: 'document',
      cache_control: { type: 'ephemeral' },
      citations: { enabled: true },
    });
    expect(content[1]).toMatchObject({ type: 'text', text: 'What makes ATP?' });
  });

  it('keeps the document in the same place across chat turns and caches the history', () => {
    const history = [
      { role: 'user' as const, content: 'q1' },
      { role: 'assistant' as const, content: 'a1' },
    ];
    const turn1 = buildMessages({ route, system: 's', document: doc, prompt: 'q1' });
    const turn2 = buildMessages({ route, system: 's', document: doc, history, prompt: 'q2' });
    // The first message is byte-identical, so the document cache is reused.
    expect(JSON.stringify(turn2[0])).toBe(JSON.stringify(turn1[0]));
    expect(turn2.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect((turn2[1]!.content as { cache_control?: unknown }[])[0]!.cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('attaches per-question retrieved chunks to the latest turn', () => {
    const messages = buildMessages({
      route,
      system: 's',
      document: doc,
      placement: 'latest',
      history: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
      ],
      prompt: 'q2',
    });
    expect((messages[0]!.content as { type: string }[]).map((b) => b.type)).toEqual(['text']);
    expect((messages[2]!.content as { type: string }[]).map((b) => b.type)).toEqual([
      'document',
      'text',
    ]);
  });

  it('labels every section with its page for citations and quiz sources', () => {
    const [message] = buildMessages({
      route,
      system: 's',
      document: { title: 't', sections: [{ pageStart: 3, pageEnd: 4, text: 'x' }] },
      prompt: 'p',
    });
    const source = (message!.content as { source?: { content: { text: string }[] } }[])[0]!.source!;
    expect(source.content[0]!.text).toBe('[Pages 3–4]\nx');
  });
});

function fakeClient(
  events: unknown[],
  final: Partial<Anthropic.Beta.Messages.BetaMessage>,
  calls: unknown[] = [],
) {
  return {
    beta: {
      messages: {
        stream(params: unknown) {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              yield* events;
            },
            finalMessage: async () => ({
              model: 'claude-haiku-4-5',
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'ATP is made by mitochondria.' }],
              usage: {
                input_tokens: 100,
                output_tokens: 20,
                cache_read_input_tokens: 900,
                cache_creation_input_tokens: 0,
              },
              ...final,
            }),
          };
        },
      },
    },
  } as unknown as Anthropic;
}

describe('Anthropic provider', () => {
  const request: TextRequest = {
    route,
    system: SYSTEM_PROMPT,
    document: doc,
    prompt: 'q',
    citations: true,
  };

  it('streams text and maps citations back to pages', async () => {
    const client = fakeClient(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ATP is made' } },
        {
          type: 'content_block_delta',
          delta: {
            type: 'citations_delta',
            citation: {
              type: 'content_block_location',
              start_block_index: 1,
              end_block_index: 2,
              cited_text: '[Page 2]\nMitochondria produce ATP.',
            },
          },
        },
      ],
      {},
    );
    const events: StreamEvent[] = [];
    const result = await createAnthropicProvider({ apiKey: 'k', client }).streamText(request, (e) =>
      events.push(e),
    );
    expect(events[0]).toEqual({ type: 'text', text: 'ATP is made' });
    expect(result.citations).toEqual([
      { pageStart: 2, pageEnd: 2, quote: 'Mitochondria produce ATP.' },
    ]);
    expect(result.usage).toMatchObject({ inputTokens: 100, cacheReadTokens: 900 });
    expect(result.stopReason).toBe('end');
  });

  it('sends effort and the server-side fallback only on routes that use them', async () => {
    const calls: Record<string, unknown>[] = [];
    const provider = createAnthropicProvider({ apiKey: 'k', client: fakeClient([], {}, calls) });
    await provider.streamText({ ...request, route: DEFAULT_ROUTES.chat }, () => undefined);
    await provider.streamText({ ...request, route: DEFAULT_ROUTES.summarize }, () => undefined);
    expect(calls[0]).not.toHaveProperty('output_config');
    expect(calls[0]).not.toHaveProperty('fallbacks');
    expect(calls[1]).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'low' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
  });

  it('reports a safety decline', async () => {
    const provider = createAnthropicProvider({
      apiKey: 'k',
      client: fakeClient([], { stop_reason: 'refusal', content: [] }),
    });
    expect((await provider.streamText(request, () => undefined)).stopReason).toBe('refusal');
  });

  it('constrains structured output with a JSON schema', async () => {
    const calls: Record<string, unknown>[] = [];
    const provider = createAnthropicProvider({
      apiKey: 'k',
      client: fakeClient(
        [],
        { content: [{ type: 'text', text: '{"a":1}', citations: null }] },
        calls,
      ),
    });
    const out = await provider.generateJson({
      route: DEFAULT_ROUTES.quiz,
      system: 's',
      document: doc,
      prompt: 'p',
      jsonSchema: { type: 'object' },
    });
    expect(out.json).toBe('{"a":1}');
    expect(calls[0]).toMatchObject({
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
    });
  });
});

describe('routes', () => {
  it('uses Haiku for light tasks and Sonnet for heavy ones', () => {
    expect(DEFAULT_ROUTES.chat.model).toBe('claude-haiku-4-5');
    expect(DEFAULT_ROUTES.flashcards.model).toBe('claude-haiku-4-5');
    expect(DEFAULT_ROUTES.quiz.model).toBe('claude-sonnet-5-5');
    expect(DEFAULT_ROUTES.mind_map.model).toBe('claude-sonnet-5-5');
    // A tool asked about one page is light, whatever the action.
    expect(DEFAULT_ROUTES.page_tool.model).toBe('claude-haiku-4-5');
  });

  it('applies valid remote overrides and ignores invalid ones', () => {
    const routes = resolveRoutes({
      chat: { model: 'claude-sonnet-5-5', effort: 'low' },
      quiz: { maxTokens: -1 },
      bogus: {},
    });
    expect(routes.chat).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'low' });
    expect(routes.quiz).toEqual(DEFAULT_ROUTES.quiz);
  });
});

describe('pricing', () => {
  it('estimates cost in micro-dollars including cache reads and writes', () => {
    expect(
      costMicros({
        model: 'claude-haiku-4-5',
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 0,
      }),
    ).toBe(1000 + 1000 + 1000);
  });
});

describe('context', () => {
  it('stops at the budget and reports the last covered page', () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, text: 'x'.repeat(400) }));
    const { document, coveredUntilPage } = documentFromPages('t', pages, 330);
    expect(document.sections).toHaveLength(3);
    expect(coveredUntilPage).toBe(3);
    expect(documentFromPages('t', pages.slice(0, 2), 10_000).coveredUntilPage).toBeUndefined();
  });

  it('orders retrieved chunks by page', () => {
    const d = documentFromChunks('t', [
      { pageStart: 9, pageEnd: 9, content: 'b' },
      { pageStart: 2, pageEnd: 3, content: 'a' },
    ]);
    expect(d.sections.map((s) => s.pageStart)).toEqual([2, 9]);
  });
});

describe('prompts', () => {
  it('asks for the app language and keeps the system prompt constant', () => {
    expect(toolPrompt('summarize', { language: 'ar' })).toContain('Arabic');
    expect(toolPrompt('explain', { page: 3, language: 'fr' })).toContain('page 3');
    expect(toolPrompt('translate', { language: 'en', targetLanguage: 'es' })).toContain('Spanish');
    expect(SYSTEM_PROMPT).not.toMatch(/\$\{/);
  });
});

describe('schemas', () => {
  it('keeps consistent quiz questions and drops broken ones', () => {
    const quiz = quizSchema.parse({
      title: 'Cells',
      questions: [
        {
          type: 'multiple_choice',
          prompt: 'Powerhouse?',
          choices: ['Nucleus', 'Mitochondria'],
          correct_answer: 'Mitochondria',
          explanation: 'p2',
          source_page: 2,
        },
        {
          type: 'true_false',
          prompt: 'Cells live?',
          choices: [],
          correct_answer: 'True',
          explanation: '',
          source_page: 1,
        },
        {
          type: 'multiple_choice',
          prompt: 'Broken',
          choices: ['a', 'b'],
          correct_answer: 'c',
          explanation: '',
          source_page: 1,
        },
      ],
    });
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[1]).toMatchObject({ correct_answer: 'true', choices: null });
  });

  it('removes duplicate flashcards', () => {
    const deck = flashcardsSchema.parse({
      title: 'd',
      cards: [
        { front: 'ATP?', back: 'Energy', source_page: 2 },
        { front: 'atp?', back: 'Energy again', source_page: 2 },
      ],
    });
    expect(deck.cards).toHaveLength(1);
  });
});
