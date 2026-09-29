import { afterAll, describe, expect, it } from 'vitest';

import { env, functionsUrl } from '../src/env.ts';
import { makePdf, studyPages, text } from '../src/fixtures.ts';
import {
  admin,
  callFunction,
  callJson,
  createUser,
  deleteUser,
  readSse,
  runWorker,
  sleep,
  type TestUser,
  uploadDocument,
  waitForDocument,
} from '../src/helpers.ts';

const users: TestUser[] = [];
afterAll(async () => {
  await Promise.all(users.map(deleteUser));
});

async function newUsers(count: number, label: string) {
  const created = await Promise.all(
    Array.from({ length: count }, (_, i) => createUser(`${label}${i}`)),
  );
  users.push(...created);
  return created;
}

describe('many simultaneous users', () => {
  it('20 students upload, process and ask the AI at the same time', async () => {
    const students = await newUsers(20, 'crowd');
    const started = Date.now();
    const results = await Promise.all(
      students.map(async (student, i) => {
        const { documentId } = await uploadDocument(student, {
          bytes: makePdf(studyPages(3 + (i % 5), 10)),
          mimeType: 'application/pdf',
          title: `Course ${i}`,
        });
        const doc = await waitForDocument(documentId, ['ready', 'failed'], 180_000);
        const res = await callFunction(
          'ai',
          { action: 'summarize', documentId, language: 'en' },
          student.token,
        );
        const events = await readSse(res);
        return {
          status: doc.status,
          pages: doc.page_count,
          last: events.at(-1)?.type,
          ownerOk: true,
        };
      }),
    );
    expect(results.every((r) => r.status === 'ready')).toBe(true);
    expect(results.every((r) => r.last === 'done')).toBe(true);
    console.log(
      JSON.stringify({ metric: 'concurrent_users', users: 20, totalMs: Date.now() - started }),
    );

    // Each user still sees only their own document.
    for (const student of students.slice(0, 5)) {
      const { data } = await student.client.from('documents').select('user_id');
      expect(data?.every((d) => d.user_id === student.id)).toBe(true);
    }
  }, 300_000);

  it('quota counters stay exact under parallel requests (no double spending)', async () => {
    const [student] = await newUsers(1, 'quota');
    const { documentId } = await uploadDocument(student!, {
      bytes: makePdf(studyPages(2, 5)),
      mimeType: 'application/pdf',
    });
    await waitForDocument(documentId);
    // Free: 3 quizzes a day. Fire 6 at once.
    const statuses = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const res = await callFunction(
          'ai',
          { action: 'quiz', documentId, language: 'en', questionCount: 3 },
          student!.token,
        );
        if (res.headers.get('content-type')?.includes('text/event-stream')) {
          const events = await readSse(res);
          return events.at(-1)?.type === 'done' ? 200 : 500;
        }
        await res.body?.cancel();
        return res.status;
      }),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.filter((s) => s === 402)).toHaveLength(3);
    const { data } = await admin
      .from('usage_counters')
      .select('used')
      .match({ user_id: student!.id, metric: 'quizzes' });
    expect(data?.[0]?.used).toBe(3);
    const { count } = await admin
      .from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', student!.id);
    expect(count).toBe(3);
  });

  it('parallel worker instances never process the same job twice', async () => {
    const [student] = await newUsers(1, 'workers');
    await admin
      .from('subscriptions')
      .update({ tier: 'premium', status: 'active' })
      .eq('user_id', student!.id);
    const docs = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        uploadDocument(student!, {
          bytes: text(`Document ${i}: enzymes and osmosis.`),
          mimeType: 'text/plain',
        }),
      ),
    );
    await Promise.all([runWorker(), runWorker(), runWorker(), runWorker()]);
    await Promise.all(docs.map((d) => waitForDocument(d.documentId)));
    const { data: jobs } = await admin
      .schema('private' as never)
      .from('jobs')
      .select('attempts, status')
      .in(
        'dedupe_key',
        docs.map((d) => d.documentId),
      )
      .eq('kind', 'document_extract');
    // `private` is not exposed through the API; fall back to page counts when it is not readable.
    if (jobs) expect(jobs.every((j: { attempts: number }) => j.attempts === 1)).toBe(true);
    const { data: pages } = await admin
      .from('document_pages')
      .select('document_id')
      .in(
        'document_id',
        docs.map((d) => d.documentId),
      );
    expect(pages).toHaveLength(8); // exactly one page each, no duplicates
  });
});

describe('recovery after crashes', () => {
  it('a job held by a crashed worker is picked up again after its lease expires', async () => {
    const [student] = await newUsers(1, 'crash');
    // Upload without completing through the function, so nothing wakes the worker.
    const created = await callJson(
      'document-upload',
      { action: 'create', title: 'Crash test', mimeType: 'text/plain', sizeBytes: 40 },
      student!.token,
    );
    await student!.client.storage
      .from('documents')
      .uploadToSignedUrl(
        created.body.path,
        created.body.token,
        text('Recovered after a worker crash.'),
        {
          contentType: 'text/plain',
        },
      );
    const queued = await admin.rpc('queue_document_processing', {
      p_document_id: created.body.documentId,
      p_user_id: student!.id,
    });
    expect(queued.error).toBeNull();

    // A worker claims the job with a 1 s lease and then "crashes" (never finishes).
    const claimed = await admin.rpc('claim_jobs', {
      p_kind: 'document_extract',
      p_worker: 'crashed-instance',
      p_limit: 50,
      p_lease_seconds: 1,
    });
    expect(claimed.error).toBeNull();
    expect(
      (claimed.data as { dedupe_key: string }[]).some(
        (j) => j.dedupe_key === created.body.documentId,
      ),
    ).toBe(true);

    await sleep(1500);
    const doc = await waitForDocument(created.body.documentId);
    expect(doc.status).toBe('ready');
  });

  it('the worker restarts cleanly: health check and a run right after start', async () => {
    const health = await fetch(`${env.workerUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await runWorker()).toBeTruthy();
  });
});

describe('account deletion', () => {
  it('removes the account, its rows and its files', async () => {
    const [student] = await newUsers(1, 'delete');
    const { documentId, path } = await uploadDocument(student!, {
      bytes: text('To be deleted with the account.'),
      mimeType: 'text/plain',
    });
    await waitForDocument(documentId);
    const res = await callJson('delete-account', {}, student!.token);
    expect(res.status).toBe(200);

    const { data } = await admin.auth.admin.getUserById(student!.id);
    expect(data.user).toBeNull();
    const { count } = await admin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', student!.id);
    expect(count).toBe(0);

    // Files go right away or through the storage janitor (retries).
    const janitor = await fetch(functionsUrl('storage-janitor'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.cronSecret}` },
    });
    expect(janitor.status).toBe(200);
    await janitor.body?.cancel();
    const { data: file } = await admin.storage.from('documents').download(path);
    expect(file).toBeNull();
  });
});
