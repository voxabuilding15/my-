import { AppError } from '@studexa/shared';

const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('@/core/config/env', () => ({
  env: { supabaseUrl: 'https://project.test', supabaseAnonKey: 'anon' },
}));
jest.mock('@/core/supabase/client', () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
  }),
}));

// eslint-disable-next-line import/first -- the mocks above must be registered first
import { streamAi } from '../stream-ai';

const encoder = new TextEncoder();
const request = { action: 'summarize', documentId: 'd', language: 'en' } as const;
const timeouts = { firstByteMs: 200, idleMs: 200 };

/** A response whose body yields the given chunks, each after `delayMs` (then stays open). */
function streaming(chunks: string[], delayMs: number, signal: AbortSignal, end = true) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          new Promise((resolve, reject) => {
            const onAbort = () => reject(new Error('aborted'));
            signal.addEventListener('abort', onAbort);
            if (index >= chunks.length && !end) return; // silent, connection still open
            setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              if (index < chunks.length) {
                resolve({ value: encoder.encode(chunks[index++]), done: false });
              } else resolve({ value: undefined, done: true });
            }, delayMs);
          }),
      }),
    },
  };
}

const event = (e: object) => `data: ${JSON.stringify(e)}\n\n`;
const start = event({ type: 'start', model: 'm', cached: false, remaining: null });
const done = event({ type: 'done', citations: [], remaining: null });

describe('streamAi timeouts', () => {
  beforeEach(() => mockFetch.mockReset());

  it('completes a slow answer as long as data (or heartbeats) keep arriving', async () => {
    mockFetch.mockImplementation(async (_url: string, init: { signal: AbortSignal }) =>
      streaming(
        [start, ': ping\n\n', event({ type: 'text', text: 'Hi' }), ': ping\n\n', done],
        120, // each gap is under the idle timeout, the total is well over it
        init.signal,
      ),
    );
    const result = await streamAi(request, {}, undefined, timeouts);
    expect(result.text).toBe('Hi');
  });

  it('gives up when the stream goes silent', async () => {
    mockFetch.mockImplementation(async (_url: string, init: { signal: AbortSignal }) =>
      streaming([start], 10, init.signal, false),
    );
    const error = await streamAi(request, {}, undefined, timeouts).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'network', message: 'The connection timed out' });
  });

  it('gives up when the server never answers', async () => {
    mockFetch.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const error = await streamAi(request, {}, undefined, timeouts).catch((e) => e);
    expect(error).toMatchObject({ code: 'network', message: 'The connection timed out' });
  });

  it('reports a connection dropped mid-answer as a network error', async () => {
    mockFetch.mockImplementation(async (_url: string, init: { signal: AbortSignal }) =>
      streaming([start, event({ type: 'text', text: 'Half' })], 10, init.signal),
    );
    const error = await streamAi(request, {}, undefined, timeouts).catch((e) => e);
    expect(error).toMatchObject({ code: 'network', message: 'The answer was interrupted' });
  });

  it('stops immediately when the caller cancels', async () => {
    mockFetch.mockImplementation(async (_url: string, init: { signal: AbortSignal }) =>
      streaming([start], 10, init.signal, false),
    );
    const controller = new AbortController();
    const pending = streamAi(request, {}, controller.signal, {
      firstByteMs: 10_000,
      idleMs: 10_000,
    });
    setTimeout(() => controller.abort(), 50);
    const error = await pending.catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toBe('The connection timed out');
  });
});
