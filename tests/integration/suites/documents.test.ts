import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makeDocx, makePdf, makePng, studyPages, text } from '../src/fixtures.ts';
import {
  admin,
  clearMockRequests,
  createUser,
  deleteUser,
  mockRequests,
  runWorker,
  setTier,
  sleep,
  type TestUser,
  uploadDocument,
  waitForDocument,
} from '../src/helpers.ts';

let user: TestUser;
let other: TestUser;
beforeAll(async () => {
  [user, other] = await Promise.all([createUser('docs'), createUser('docs-other')]);
  // Many uploads: Premium keeps the Free monthly upload quota out of these tests.
  await Promise.all([setTier(user.id, 'premium'), setTier(other.id, 'premium')]);
});
afterAll(async () => {
  await Promise.all([deleteUser(user), deleteUser(other)]);
});

const PDF = 'application/pdf';

describe('document pipeline (Edge Function → Storage → queue → worker → database)', () => {
  it('extracts a PDF page by page and makes it ready', async () => {
    const pdf = makePdf(studyPages(3, 10));
    const { documentId, complete } = await uploadDocument(user, { bytes: pdf, mimeType: PDF });
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('queued');

    const doc = await waitForDocument(documentId);
    expect(doc.status).toBe('ready');
    expect(doc.page_count).toBe(3);
    expect(doc.retrieval_mode).toBe('full_context');
    expect(doc.language).toBe('en');
    expect(doc.content_sha256).toMatch(/^[0-9a-f]{64}$/);

    const { data: pages } = await admin
      .from('document_pages')
      .select('page_number, content')
      .eq('document_id', documentId)
      .order('page_number');
    expect(pages?.map((p) => p.page_number)).toEqual([1, 2, 3]);
    expect(pages?.[1]?.content).toContain('Page 2 line 1: mitochondria');

    // The owner sees it through RLS; another user does not.
    const own = await user.client.from('documents').select('id').eq('id', documentId);
    expect(own.data).toHaveLength(1);
    const foreign = await other.client.from('documents').select('id').eq('id', documentId);
    expect(foreign.data).toHaveLength(0);
  });

  it('extracts Word documents and plain text', async () => {
    const docx = await makeDocx([
      'Chapter 1',
      'Enzymes speed up reactions.',
      'Chapter 2',
      'Osmosis moves water.',
    ]);
    const word = await uploadDocument(user, {
      bytes: docx,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const txt = await uploadDocument(user, {
      bytes: text('Genetics studies heredity.\n\nDNA carries genes.'),
      mimeType: 'text/plain',
    });
    const [wordDoc, txtDoc] = await Promise.all([
      waitForDocument(word.documentId),
      waitForDocument(txt.documentId),
    ]);
    expect(wordDoc.status).toBe('ready');
    expect(txtDoc.status).toBe('ready');
    expect(txtDoc.page_count).toBeGreaterThanOrEqual(1);
  });

  it('reuses an identical earlier extraction instead of processing the file again', async () => {
    const pdf = makePdf(studyPages(4, 5));
    const first = await uploadDocument(user, { bytes: pdf, mimeType: PDF, title: 'Original' });
    await waitForDocument(first.documentId);
    const second = await uploadDocument(user, { bytes: pdf, mimeType: PDF, title: 'Copy' });
    const copy = await waitForDocument(second.documentId);
    expect(copy.status).toBe('ready');
    expect(copy.page_count).toBe(4);

    const { data: firstDoc } = await admin
      .from('documents')
      .select('content_sha256, processed_at')
      .eq('id', first.documentId)
      .single();
    expect(copy.content_sha256).toBe(firstDoc?.content_sha256);
  });

  it('saves photo text read on the device without server OCR', async () => {
    await clearMockRequests();
    const ocrText = 'Photosynthesis happens in the chloroplasts of plant cells.';
    const { documentId, complete } = await uploadDocument(
      user,
      { bytes: makePng(), mimeType: 'image/png' },
      ocrText,
    );
    expect(complete.body.status).toBe('ready');
    const { data: page } = await admin
      .from('document_pages')
      .select('content')
      .eq('document_id', documentId)
      .single();
    expect(page?.content).toBe(ocrText);
    expect((await mockRequests()).filter((r) => r.summary.image)).toHaveLength(0);
  });

  it('falls back to server OCR (Claude vision) when the device read nothing', async () => {
    await clearMockRequests();
    const { documentId, complete } = await uploadDocument(user, {
      bytes: makePng(20, 90),
      mimeType: 'image/png',
    });
    expect(complete.body.status).toBe('queued');
    const doc = await waitForDocument(documentId);
    expect(doc.status).toBe('ready');
    const ocrCalls = (await mockRequests()).filter((r) => r.summary.image);
    expect(ocrCalls.length).toBeGreaterThanOrEqual(1);
    // Documented route: accuracy first for Arabic and handwriting (docs/AI.md).
    expect(ocrCalls[0]?.model).toBe('claude-sonnet-5-5');
  });

  it('marks unreadable files as failed with a reason', async () => {
    const broken = new Uint8Array(Buffer.from('%PDF-1.7\nthis is not really a pdf'));
    const { documentId } = await uploadDocument(user, { bytes: broken, mimeType: PDF });
    const doc = await waitForDocument(documentId);
    expect(doc.status).toBe('failed');
    expect(doc.error_code).toBeTruthy();
  });

  it('rejects a file larger than declared (quota bypass attempt)', async () => {
    const created = await fetch(`${process.env.SUPABASE_URL}/functions/v1/document-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        action: 'create',
        title: 'liar',
        mimeType: 'text/plain',
        sizeBytes: 10,
      }),
    }).then((r) => r.json());
    const big = text('x'.repeat(5000));
    // Storage enforces nothing about the declared size; the complete step must.
    await user.client.storage
      .from('documents')
      .uploadToSignedUrl(created.path, created.token, big, {
        contentType: 'text/plain',
      });
    const complete = await fetch(`${process.env.SUPABASE_URL}/functions/v1/document-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ action: 'complete', documentId: created.documentId }),
    });
    expect(complete.status).toBe(413);
    const { data } = await admin
      .from('documents')
      .select('status, error_code')
      .eq('id', created.documentId)
      .single();
    expect(data?.status).toBe('failed');
  });

  it('cannot complete another user’s upload', async () => {
    const { documentId } = await uploadDocument(user, {
      bytes: text('Mine only.'),
      mimeType: 'text/plain',
    });
    const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/document-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${other.token}`,
      },
      body: JSON.stringify({ action: 'complete', documentId }),
    });
    expect(res.status).toBe(404);
  });
});

describe('large PDF stress (100–500 pages)', () => {
  it('a Free account is limited to its page allowance', async () => {
    const free = await createUser('free-pages');
    try {
      const { documentId } = await uploadDocument(free, {
        bytes: makePdf(studyPages(100, 20)),
        mimeType: PDF,
      });
      const doc = await waitForDocument(documentId);
      expect(doc.status).toBe('failed');
      expect(doc.error_code).toBe('too_many_pages');
    } finally {
      await deleteUser(free);
    }
  });

  it.each([100, 250, 500])(
    'processes a %i-page PDF for Premium, with embeddings when it is too large for full context',
    async (pageCount) => {
      await clearMockRequests();
      const pdf = makePdf(studyPages(pageCount, 40));
      const started = Date.now();
      const { documentId } = await uploadDocument(other, {
        bytes: pdf,
        mimeType: PDF,
        title: `${pageCount} pages`,
      });
      const doc = await waitForDocument(documentId, ['ready', 'failed'], 240_000);
      const elapsedMs = Date.now() - started;
      expect(doc.status).toBe('ready');
      expect(doc.page_count).toBe(pageCount);
      // Above 30k tokens (config `retrieval.full_context_max_tokens`) documents use hybrid search.
      expect(doc.retrieval_mode).toBe(doc.token_count > 30_000 ? 'hybrid' : 'full_context');

      const { count: chunks } = await admin
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);
      expect(chunks).toBeGreaterThan(pageCount / 4);

      // Embeddings are a separate queued job; wait until every chunk has a vector.
      let embedded = 0;
      if (doc.retrieval_mode === 'hybrid') {
        const deadline = Date.now() + 120_000;
        while (embedded < (chunks ?? 0) && Date.now() < deadline) {
          const { count } = await admin
            .from('document_chunk_embeddings')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', documentId);
          embedded = count ?? 0;
          if (embedded < (chunks ?? 0)) {
            await runWorker().catch(() => undefined);
            await sleep(500);
          }
        }
        expect(embedded).toBe(chunks);
      }

      console.log(
        JSON.stringify({
          metric: 'large_pdf',
          pages: pageCount,
          bytes: pdf.byteLength,
          tokens: doc.token_count,
          mode: doc.retrieval_mode,
          chunks,
          embedded,
          elapsedMs,
          totalMs: Date.now() - started,
        }),
      );
    },
    300_000,
  );
});
