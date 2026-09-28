import { assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import {
  createDocumentUploadHandler,
  type DocumentUploadDeps,
  type UploadedDocument,
} from './handler.ts';

const DOC = '6f1c2f8e-3b0a-4c61-9a57-0c3b7b8f2d11';

function setup(overrides: Partial<DocumentUploadDeps> = {}, document?: UploadedDocument) {
  const calls: string[] = [];
  const deps: DocumentUploadDeps = {
    getCallerId: () => Promise.resolve('u1'),
    rateLimit: () => Promise.resolve(true),
    createUpload: (input) => {
      calls.push(`create:${input.kind}:${input.extension}`);
      return Promise.resolve({
        allowed: true,
        documentId: DOC,
        storagePath: `u1/${DOC}/original.pdf`,
      });
    },
    createSignedUploadUrl: () => Promise.resolve({ token: 'tok' }),
    getDocument: () =>
      Promise.resolve(
        document ?? {
          userId: 'u1',
          kind: 'pdf',
          status: 'pending_upload',
          storagePath: 'p',
          sizeBytes: 100,
        },
      ),
    objectSize: () => Promise.resolve(100),
    rejectUpload: (_id, _path, code) => Promise.resolve(void calls.push(`reject:${code}`)),
    queueProcessing: () => Promise.resolve('queued'),
    wakeWorker: () => void calls.push('wake'),
    saveDeviceText: (_id, text) => Promise.resolve(void calls.push(`device:${text.length}`)),
    ...overrides,
  };
  const handler = withHttp('test', createDocumentUploadHandler(deps));
  const call = async (body: unknown) => {
    const res = await handler(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, calls };
}

const create = { action: 'create', title: 'Biology', mimeType: 'application/pdf', sizeBytes: 100 };

Deno.test('create returns a signed upload slot', async () => {
  const { call, calls } = setup();
  const res = await call(create);
  assertEquals(res.status, 201);
  assertEquals(res.body, { documentId: DOC, path: `u1/${DOC}/original.pdf`, token: 'tok' });
  assertEquals(calls, ['create:pdf:pdf']);
});

Deno.test('unsupported file types are rejected before any database work', async () => {
  const { call, calls } = setup();
  const res = await call({ ...create, mimeType: 'application/x-msdownload' });
  assertEquals(res.status, 400);
  assertEquals(calls, []);
});

Deno.test('quota rejections map to client error codes', async () => {
  const { call } = setup({
    createUpload: () => Promise.resolve({ allowed: false, reason: 'storage_full' }),
  });
  const res = await call(create);
  assertEquals(res.status, 402);
  assertEquals(res.body.error.code, 'storage_full');
});

Deno.test('complete queues processing and wakes the worker', async () => {
  const { call, calls } = setup();
  const res = await call({ action: 'complete', documentId: DOC });
  assertEquals(res.body, { status: 'queued' });
  assertEquals(calls, ['wake']);
});

Deno.test('a file larger than declared is removed and the document failed', async () => {
  const { call, calls } = setup({ objectSize: () => Promise.resolve(10_000_000) });
  const res = await call({ action: 'complete', documentId: DOC });
  assertEquals(res.status, 413);
  assertEquals(calls, ['reject:size_mismatch']);
});

Deno.test('completing before uploading is refused', async () => {
  const { call } = setup({ objectSize: () => Promise.resolve(null) });
  assertEquals((await call({ action: 'complete', documentId: DOC })).status, 400);
});

Deno.test("another user's document looks like it does not exist", async () => {
  const { call } = setup(
    {},
    {
      userId: 'u2',
      kind: 'pdf',
      status: 'pending_upload',
      storagePath: 'p',
      sizeBytes: 1,
    },
  );
  assertEquals((await call({ action: 'complete', documentId: DOC })).status, 404);
});

Deno.test('uploads require a signed-in user', async () => {
  const { call } = setup({ getCallerId: () => Promise.resolve(null) });
  assertEquals((await call(create)).status, 401);
});

Deno.test('photos read on the device are saved directly, without server OCR', async () => {
  const photo = {
    userId: 'u1',
    kind: 'image' as const,
    status: 'pending_upload' as const,
    storagePath: 'p',
    sizeBytes: 100,
  };
  const { call, calls } = setup({}, photo);
  const res = await call({
    action: 'complete',
    documentId: DOC,
    ocrText: 'Photosynthesis converts light into energy.',
  });
  assertEquals(res.body, { status: 'ready' });
  assertEquals(calls, ['device:42']);
});

Deno.test('photos the device could not read go to server OCR', async () => {
  const photo = {
    userId: 'u1',
    kind: 'image' as const,
    status: 'pending_upload' as const,
    storagePath: 'p',
    sizeBytes: 100,
  };
  const { call, calls } = setup({}, photo);
  assertEquals((await call({ action: 'complete', documentId: DOC, ocrText: 'x' })).body, {
    status: 'queued',
  });
  assertEquals(calls, ['wake']);
});
