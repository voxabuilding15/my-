import { AppError } from '@studexa/shared';

import type { AiStreamResult } from '@/core/ai';
import { createFakeSupabase } from '@/test-utils/fake-supabase';

import { SupabaseAiRepository } from '../ai-repository';
import { SupabaseChatRepository } from '../chat-repository';
import { SupabaseDocumentsRepository, type DocumentUploadTransport } from '../documents-repository';
import { SupabaseProgressRepository } from '../progress-repository';
import { SupabaseQuizzesRepository } from '../quizzes-repository';
import { SupabaseSubscriptionRepository, type StoreClient } from '../subscription-repository';

const docRow = (status: string) => ({
  id: 'd1',
  title: 'Cells',
  kind: 'pdf',
  size_bytes: 1000,
  page_count: null,
  status,
  is_favorite: false,
  last_page: null,
  last_opened_at: null,
  created_at: '2026-09-01T00:00:00Z',
});

describe('SupabaseDocumentsRepository', () => {
  it('uploads through a signed slot, confirms, and shows the new document as processing', async () => {
    const { client } = createFakeSupabase({
      documents: [{ data: docRow('pending_upload'), error: null }],
    });
    const steps: string[] = [];
    const transport: DocumentUploadTransport = {
      invoke: async <T>(body: Record<string, unknown>) => {
        steps.push(String(body.action));
        return (
          body.action === 'create'
            ? { documentId: 'd1', path: 'u/d1/original.pdf', token: 't' }
            : { status: 'queued' }
        ) as T;
      },
      putFile: async ({ path }) => void steps.push(`put:${path}`),
      readImageText: async () => 'unused',
    };
    const repo = new SupabaseDocumentsRepository(client, transport);
    const doc = await repo.upload({
      name: 'Cells.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      uri: 'file:///x',
      source: 'file',
    });
    expect(steps).toEqual(['create', 'put:u/d1/original.pdf', 'complete']);
    expect(doc).toMatchObject({ id: 'd1', status: 'processing', pageCount: 0 });
  });

  it('retries confirming after a network error', async () => {
    jest.useFakeTimers();
    const { client } = createFakeSupabase({
      documents: [{ data: docRow('processing'), error: null }],
    });
    let completes = 0;
    const transport: DocumentUploadTransport = {
      invoke: async <T>(body: Record<string, unknown>) => {
        if (body.action === 'create') return { documentId: 'd1', path: 'p', token: 't' } as T;
        completes++;
        if (completes === 1) throw new AppError('network');
        return { status: 'queued' } as T;
      },
      putFile: async () => undefined,
      readImageText: async () => '',
    };
    const upload = new SupabaseDocumentsRepository(client, transport).upload({
      name: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      uri: 'u',
      source: 'file',
    });
    await jest.runAllTimersAsync();
    await expect(upload).resolves.toMatchObject({ id: 'd1' });
    expect(completes).toBe(2);
    jest.useRealTimers();
  });

  it('maps "no rows" to not_found', async () => {
    const { client } = createFakeSupabase({
      documents: [{ data: null, error: { message: 'none', code: 'PGRST116' } }],
    });
    const repo = new SupabaseDocumentsRepository(client, {
      invoke: jest.fn(),
      putFile: jest.fn(),
      readImageText: jest.fn(),
    });
    await expect(repo.get('x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('toggles a bookmark off when one exists, on otherwise', async () => {
    const { client, calls } = createFakeSupabase({
      bookmarks: [
        { data: [{ id: 'b1' }], error: null },
        { data: [], error: null },
        { data: null, error: null },
      ],
    });
    const repo = new SupabaseDocumentsRepository(client, {
      invoke: jest.fn(),
      putFile: jest.fn(),
      readImageText: jest.fn(),
    });
    expect(await repo.toggleBookmark('d1', 3)).toBe(false);
    expect(await repo.toggleBookmark('d1', 3)).toBe(true);
    expect(calls.at(-1)?.chain[0]).toEqual([
      'insert',
      [{ user_id: 'user-1', document_id: 'd1', page_number: 3 }],
    ]);
  });
});

const streamResult = (overrides: Partial<AiStreamResult> = {}): AiStreamResult => ({
  type: 'done',
  text: 'Mitochondria make ATP.',
  model: 'claude-haiku-4-5',
  cached: false,
  citations: [{ pageStart: 2, pageEnd: 2, quote: 'Mitochondria produce ATP.' }],
  remaining: 19,
  ...overrides,
});

describe('SupabaseChatRepository', () => {
  it('streams the answer in the chosen language and returns it with citations', async () => {
    const { client } = createFakeSupabase({});
    const stream = jest.fn(
      async (_request: unknown, handlers?: { onText?: (t: string) => void }) => {
        handlers?.onText?.('Mitochondria');
        return streamResult({ messageId: 'm1' });
      },
    );
    const partials: string[] = [];
    const message = await new SupabaseChatRepository(client, stream).send(
      'c1',
      'What makes ATP?',
      'fr',
      (p) => partials.push(p),
    );
    expect(stream.mock.calls[0]?.[0]).toEqual({
      action: 'chat',
      conversationId: 'c1',
      message: 'What makes ATP?',
      language: 'fr',
    });
    expect(partials).toEqual(['Mitochondria']);
    expect(message).toMatchObject({ id: 'm1', role: 'assistant', citations: [{ pageStart: 2 }] });
  });
});

describe('SupabaseAiRepository', () => {
  it('runs a tool and maps the result', async () => {
    const { client } = createFakeSupabase({});
    const stream = jest.fn(async (_request: unknown) =>
      streamResult({ outputId: 'o1', cached: true, coveredUntilPage: 120 }),
    );
    const result = await new SupabaseAiRepository(client, stream).run(
      { action: 'summarize', documentId: 'd1', language: 'ar', regenerate: true },
      jest.fn(),
    );
    expect(stream.mock.calls[0]?.[0]).toEqual({
      action: 'summarize',
      documentId: 'd1',
      language: 'ar',
      regenerate: true,
    });
    expect(result).toMatchObject({
      outputId: 'o1',
      cached: true,
      coveredUntilPage: 120,
      citations: [{ pageStart: 2 }],
    });
  });

  it('files a report, treating a repeat as already done', async () => {
    const { client, calls } = createFakeSupabase({
      content_reports: [
        { data: null, error: null },
        { data: null, error: { message: 'duplicate', code: '23505' } },
      ],
    });
    const repo = new SupabaseAiRepository(client, jest.fn());
    const report = {
      targetType: 'message' as const,
      targetId: 'm1',
      reason: 'incorrect' as const,
      details: '  wrong page ',
    };
    await repo.report(report);
    await expect(repo.report(report)).resolves.toBeUndefined();
    expect(calls[0]?.chain[0]).toEqual([
      'insert',
      [
        {
          reporter_id: 'user-1',
          target_type: 'message',
          target_id: 'm1',
          reason: 'incorrect',
          details: 'wrong page',
        },
      ],
    ]);
  });
});

describe('SupabaseQuizzesRepository.generate', () => {
  it('returns the new quiz id, or fails when none was produced', async () => {
    const { client } = createFakeSupabase({});
    const ok = new SupabaseQuizzesRepository(
      client,
      jest.fn(async () => streamResult({ quizId: 'q1' })),
    );
    expect(await ok.generate('d1', { questionCount: 5, language: 'en' })).toBe('q1');
    const broken = new SupabaseQuizzesRepository(
      client,
      jest.fn(async () => streamResult()),
    );
    await expect(broken.generate('d1', { questionCount: 5, language: 'en' })).rejects.toMatchObject(
      { code: 'ai_unavailable' },
    );
  });
});

describe('photo uploads', () => {
  it('send text read on the device with the confirmation', async () => {
    const { client } = createFakeSupabase({ documents: [{ data: docRow('ready'), error: null }] });
    const bodies: Record<string, unknown>[] = [];
    const transport: DocumentUploadTransport = {
      invoke: async <T>(body: Record<string, unknown>) => {
        bodies.push(body);
        return (
          body.action === 'create'
            ? { documentId: 'd1', path: 'p', token: 't' }
            : { status: 'ready' }
        ) as T;
      },
      putFile: async () => undefined,
      readImageText: async () => 'Photosynthesis happens in chloroplasts.',
    };
    await new SupabaseDocumentsRepository(client, transport).upload({
      name: 'notes.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      uri: 'file:///notes.jpg',
      source: 'camera',
    });
    expect(bodies[1]).toEqual({
      action: 'complete',
      documentId: 'd1',
      ocrText: 'Photosynthesis happens in chloroplasts.',
    });
  });
});

describe('SupabaseProgressRepository', () => {
  it('builds the 7-day chart from activity days, today last', async () => {
    const now = new Date(2026, 8, 28, 12);
    const { client } = createFakeSupabase({
      'rpc:get_study_stats': [
        {
          data: [
            {
              current_streak: 3,
              longest_streak: 9,
              cards_reviewed_7d: 40,
              quizzes_completed_7d: 2,
            },
          ],
          error: null,
        },
      ],
      study_activity_days: [
        {
          data: [
            { activity_date: '2026-09-28', study_seconds: 900 },
            { activity_date: '2026-09-22', study_seconds: 120 },
          ],
          error: null,
        },
      ],
    });
    const progress = await new SupabaseProgressRepository(client, () => now).progress();
    expect(progress.weekMinutes).toEqual([2, 0, 0, 0, 0, 0, 15]);
    expect(progress).toMatchObject({
      currentStreak: 3,
      longestStreak: 9,
      todayMinutes: 15,
      cardsReviewedThisWeek: 40,
    });
  });
});

describe('SupabaseSubscriptionRepository', () => {
  const store = (overrides: Partial<StoreClient> = {}): StoreClient => ({
    identify: jest.fn(async () => undefined),
    packages: async () => [
      {
        id: 'monthly',
        period: 'monthly',
        price: 4.99,
        priceString: '€4.99',
        pricePerMonthString: '€4.99',
        freeTrialDays: null,
      },
      {
        id: 'yearly',
        period: 'yearly',
        price: 39.99,
        priceString: '€39.99',
        pricePerMonthString: '€3.33',
        freeTrialDays: 7,
      },
    ],
    purchase: async () => true,
    restore: async () => undefined,
    ...overrides,
  });
  const usage = {
    data: [
      { metric: 'ai_requests', used: 4, quota: 20 },
      { metric: 'uploads', used: 1, quota: 5 },
    ],
    error: null,
  };
  const free = { data: { tier: 'free', current_period_end: null, will_renew: null }, error: null };
  const premium = {
    data: { tier: 'premium', current_period_end: '2099-01-01T00:00:00Z', will_renew: true },
    error: null,
  };

  it('lists yearly first with its savings versus monthly', async () => {
    const { client } = createFakeSupabase({});
    const packages = await new SupabaseSubscriptionRepository(client, store()).packages();
    expect(packages.map((p) => [p.id, p.savingsPercent, p.trialDays])).toEqual([
      ['yearly', 33, 7],
      ['monthly', null, null],
    ]);
  });

  it('waits for the webhook to grant premium after a purchase', async () => {
    const { client } = createFakeSupabase({
      'rpc:get_my_usage': [usage, usage],
      subscriptions: [free, premium],
    });
    const status = await new SupabaseSubscriptionRepository(
      client,
      store(),
      async () => undefined,
    ).purchase('yearly');
    expect(status.tier).toBe('premium');
    expect(status.renewsAt).toBe('2099-01-01T00:00:00Z');
  });

  it('a cancelled purchase leaves the plan unchanged without an error', async () => {
    const { client } = createFakeSupabase({ 'rpc:get_my_usage': [usage], subscriptions: [free] });
    const status = await new SupabaseSubscriptionRepository(
      client,
      store({ purchase: async () => false }),
    ).purchase('yearly');
    expect(status.tier).toBe('free');
    expect(status.usage.find((u) => u.metric === 'ai_requests')).toEqual({
      metric: 'ai_requests',
      used: 4,
      quota: 20,
    });
  });
});
