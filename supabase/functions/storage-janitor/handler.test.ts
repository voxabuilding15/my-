import { assertEquals } from '@std/assert';

import { withHttp } from '../_shared/http.ts';
import { createStorageJanitorHandler } from './handler.ts';

const SECRET = 'c'.repeat(40);

Deno.test('queued prefixes are removed; failures are recorded for retry', async () => {
  const finished: string[] = [];
  const handler = withHttp(
    'test',
    createStorageJanitorHandler({
      secret: SECRET,
      claim: () =>
        Promise.resolve([
          { id: 1, bucketId: 'documents', pathPrefix: 'u1/d1/' },
          { id: 2, bucketId: 'avatars', pathPrefix: 'u2/' },
        ]),
      removePrefix: (bucket) =>
        bucket === 'avatars' ? Promise.reject(new Error('down')) : Promise.resolve(3),
      finish: (id, error) => Promise.resolve(void finished.push(`${id}:${error ?? 'ok'}`)),
    }),
  );
  const res = await handler(
    new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }),
  );
  assertEquals(await res.json(), { prefixes: 2, files: 3, failed: 1 });
  assertEquals(finished, ['1:ok', '2:Error: down']);
});

Deno.test('the janitor only runs for the scheduler', async () => {
  const handler = withHttp(
    'test',
    createStorageJanitorHandler({
      secret: SECRET,
      claim: () => Promise.reject(new Error('must not run')),
      removePrefix: () => Promise.resolve(0),
      finish: () => Promise.resolve(),
    }),
  );
  const res = await handler(new Request('http://localhost', { method: 'POST' }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});
