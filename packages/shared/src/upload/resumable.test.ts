import { describe, expect, it } from 'vitest';

import { resumableUpload, ResumableUploadError, type ResumableUploadState } from '../index.ts';

const CHUNK = 1024;
const RESUMABLE_CHUNK_BYTES = CHUNK;

/** In-memory TUS server with the failure modes of a flaky mobile connection. */
function fakeStorage(options: { dropAfterReceiving?: number[]; expireAfterPatches?: number } = {}) {
  const uploads = new Map<string, { length: number; data: number[] }>();
  let patches = 0;
  const log: string[] = [];
  const drops = [...(options.dropAfterReceiving ?? [])];

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    log.push(method);
    if (headers.get('x-signature') !== 'signed-token') return new Response(null, { status: 403 });
    if (method === 'POST') {
      const id = `u${uploads.size + 1}`;
      uploads.set(id, { length: Number(headers.get('upload-length')), data: [] });
      return new Response(null, {
        status: 201,
        headers: { location: `https://storage.test/tus/${id}` },
      });
    }
    const upload = uploads.get(url.split('/').pop()!);
    if (!upload) return new Response(null, { status: 404 });
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'upload-offset': String(upload.data.length) },
      });
    }
    // PATCH
    patches++;
    if (options.expireAfterPatches !== undefined && patches > options.expireAfterPatches) {
      return new Response(null, { status: 403 });
    }
    if (Number(headers.get('upload-offset')) !== upload.data.length)
      return new Response(null, { status: 409 });
    const body = init?.body as Uint8Array;
    for (const byte of body) upload.data.push(byte);
    // The server stored the chunk but the response never reached the phone.
    if (drops[0] === patches) {
      drops.shift();
      throw new TypeError('Network request failed');
    }
    return new Response(null, {
      status: 204,
      headers: { 'upload-offset': String(upload.data.length) },
    });
  }) as typeof globalThis.fetch;

  return { fetch, uploads, log };
}

const file = (size: number) => Uint8Array.from({ length: size }, (_, i) => i % 251);

function options(bytes: Uint8Array, storage: ReturnType<typeof fakeStorage>, extra = {}) {
  return {
    supabaseUrl: 'https://project.test',
    apikey: 'anon',
    signature: 'signed-token',
    bucket: 'documents',
    objectName: 'u/d/original.pdf',
    contentType: 'application/pdf',
    size: bytes.length,
    readChunk: async (offset: number, length: number) => bytes.slice(offset, offset + length),
    fetch: storage.fetch,
    sleep: async () => undefined,
    chunkBytes: CHUNK,
    ...extra,
  };
}

describe('resumableUpload', () => {
  it('uploads in fixed-size chunks and reports progress', async () => {
    const bytes = file(RESUMABLE_CHUNK_BYTES * 2 + 234);
    const storage = fakeStorage();
    const progress: number[] = [];
    await resumableUpload(
      options(bytes, storage, { onProgress: (sent: number) => progress.push(sent) }),
    );
    const stored = [...storage.uploads.values()][0]!;
    expect(stored.data).toEqual([...bytes]);
    expect(progress).toEqual([0, RESUMABLE_CHUNK_BYTES, RESUMABLE_CHUNK_BYTES * 2, bytes.length]);
  });

  it('survives a connection dropped after the server stored the chunk', async () => {
    const bytes = file(RESUMABLE_CHUNK_BYTES * 2);
    const storage = fakeStorage({ dropAfterReceiving: [1] });
    await resumableUpload(options(bytes, storage));
    expect([...storage.uploads.values()][0]!.data).toEqual([...bytes]);
    // The retry hit a 409 (already stored) and resynchronised instead of duplicating data.
    expect(storage.log.filter((m) => m === 'HEAD').length).toBeGreaterThanOrEqual(1);
  });

  it('resumes after the app was killed, from the server’s offset', async () => {
    const bytes = file(RESUMABLE_CHUNK_BYTES * 3);
    const storage = fakeStorage();
    let saved: ResumableUploadState | null = null;
    const controller = new AbortController();
    // First run: the app dies after the first chunk.
    await expect(
      resumableUpload(
        options(bytes, storage, {
          signal: controller.signal,
          onState: (state: ResumableUploadState) => {
            saved = state;
            if (state.offset >= RESUMABLE_CHUNK_BYTES) controller.abort();
          },
        }),
      ),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(saved!.offset).toBe(RESUMABLE_CHUNK_BYTES);

    // Next launch: continue with the saved upload URL; only the missing chunks are sent.
    const readOffsets: number[] = [];
    await resumableUpload(
      options(bytes, storage, {
        uploadUrl: saved!.uploadUrl,
        readChunk: async (offset: number, length: number) => {
          readOffsets.push(offset);
          return bytes.slice(offset, offset + length);
        },
      }),
    );
    expect(readOffsets).toEqual([RESUMABLE_CHUNK_BYTES, RESUMABLE_CHUNK_BYTES * 2]);
    expect(storage.uploads.size).toBe(1);
    expect([...storage.uploads.values()][0]!.data).toEqual([...bytes]);
  });

  it('starts over when the saved upload no longer exists', async () => {
    const bytes = file(1000);
    const storage = fakeStorage();
    await resumableUpload(options(bytes, storage, { uploadUrl: 'https://storage.test/tus/gone' }));
    expect(storage.log.slice(0, 2)).toEqual(['HEAD', 'POST']);
  });

  it('reports an expired token so the app can ask for a new upload', async () => {
    const bytes = file(RESUMABLE_CHUNK_BYTES * 2);
    const storage = fakeStorage({ expireAfterPatches: 1 });
    const error = await resumableUpload(options(bytes, storage)).catch((e) => e);
    expect(error).toBeInstanceOf(ResumableUploadError);
    expect(error.kind).toBe('expired');
  });

  it('gives up when chunks keep failing even though the server answers', async () => {
    const bytes = file(CHUNK * 2);
    const storage = fakeStorage();
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new TypeError('Network request failed');
      return storage.fetch(input, init);
    }) as typeof fetch;
    const error = await resumableUpload(
      options(bytes, storage, { fetch: flaky, attempts: 3 }),
    ).catch((e) => e);
    expect(error.kind).toBe('network');
  });

  it('gives up on a dead network after its attempts', async () => {
    const failing = (async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    const error = await resumableUpload(
      options(file(10), fakeStorage(), { fetch: failing, attempts: 3 }),
    ).catch((e) => e);
    expect(error.kind).toBe('network');
  });
});
