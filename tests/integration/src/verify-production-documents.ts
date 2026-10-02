/**
 * End-to-end document check against a deployed backend (production after a worker deploy):
 * a temporary verified account uploads a PDF, a Word file and a text file exactly like the app
 * (create → signed Storage upload → complete), waits for the Cloud Run worker to finish them
 * (pages and chunks saved), asks the AI one question about the PDF, then deletes the account.
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     pnpm --filter @studexa/integration-tests exec tsx src/verify-production-documents.ts
 *
 * Run by .github/workflows/deploy-worker.yml (mode deploy and verify). Prints no secrets.
 */
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { makeDocx, makePdf, text } from './fixtures.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const url = required('SUPABASE_URL');
const anonKey = required('SUPABASE_ANON_KEY');
const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TIMEOUT_MS = Number(process.env.DOCUMENT_TIMEOUT_SECONDS ?? 300) * 1000;
const MARKER = 'Mitochondria produce ATP through cellular respiration';

type Sample = { label: string; title: string; mimeType: string; bytes: Uint8Array };

async function samples(): Promise<Sample[]> {
  return [
    {
      label: 'PDF',
      title: 'QA check - PDF',
      mimeType: 'application/pdf',
      bytes: makePdf([
        ['Cell biology, chapter 1', MARKER, 'The nucleus stores genetic information.'],
        ['Chapter 2', 'Ribosomes build proteins from amino acids.'],
        ['Chapter 3', 'The cell membrane controls what enters and leaves the cell.'],
      ]),
    },
    {
      label: 'DOCX',
      title: 'QA check - Word',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: await makeDocx([
        'Photosynthesis',
        'Plants convert light energy into chemical energy stored in glucose.',
        'Chlorophyll absorbs mostly blue and red light.',
      ]),
    },
    {
      label: 'TXT',
      title: 'QA check - text',
      mimeType: 'text/plain',
      bytes: text(
        'The water cycle\n\nWater evaporates, condenses into clouds and falls as precipitation.\n' +
          'Groundwater slowly returns to rivers and oceans.\n',
      ),
    },
  ];
}

async function callFunction(name: string, body: unknown, token: string): Promise<Response> {
  return fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const email = `qa-documents-${randomUUID().slice(0, 8)}@studexa-tests.dev`;
  const password = `Qa-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { email_verified: true },
    user_metadata: { display_name: 'QA check' },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('no user created');
  const userId = created.data.user.id;
  console.log(`temporary account created (${email})`);

  let failed = false;
  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error('sign-in failed');
    const token = signIn.data.session.access_token;

    const uploaded: { sample: Sample; id: string; started: number }[] = [];
    for (const sample of await samples()) {
      const res = await callFunction(
        'document-upload',
        {
          action: 'create',
          title: sample.title,
          mimeType: sample.mimeType,
          sizeBytes: sample.bytes.byteLength,
        },
        token,
      );
      const body = (await res.json()) as { documentId: string; path: string; token: string };
      if (res.status !== 201)
        throw new Error(`${sample.label}: create ${res.status} ${JSON.stringify(body)}`);
      const put = await client.storage
        .from('documents')
        .uploadToSignedUrl(body.path, body.token, sample.bytes, { contentType: sample.mimeType });
      if (put.error)
        throw new Error(`${sample.label}: storage upload failed: ${put.error.message}`);
      const done = await callFunction(
        'document-upload',
        { action: 'complete', documentId: body.documentId },
        token,
      );
      const doneBody = (await done.json()) as { status?: string };
      if (!done.ok)
        throw new Error(`${sample.label}: complete ${done.status} ${JSON.stringify(doneBody)}`);
      console.log(`${sample.label}: uploaded, status ${doneBody.status}`);
      uploaded.push({ sample, id: body.documentId, started: Date.now() });
    }

    const results: Record<string, unknown>[] = [];
    for (const { sample, id, started } of uploaded) {
      let row: Record<string, any> | null = null;
      // Each file gets its own deadline, and is always read at least once.
      for (;;) {
        const { data } = await admin
          .from('documents')
          .select('status, error_code, page_count, token_count, language, retrieval_mode')
          .eq('id', id)
          .single();
        row = data;
        if (row && (row.status === 'ready' || row.status === 'failed')) break;
        if (Date.now() - started >= TIMEOUT_MS) break;
        await sleep(3000);
      }
      const seconds = Math.round((Date.now() - started) / 1000);
      const { count: pages } = await admin
        .from('document_pages')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', id);
      const { count: chunks } = await admin
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', id);
      const ok = row?.status === 'ready' && (pages ?? 0) > 0 && (chunks ?? 0) > 0;
      if (!ok) failed = true;
      const result = {
        file: sample.label,
        result: ok ? 'ready' : 'FAILED',
        status: row?.status ?? 'unknown',
        error: row?.error_code ?? null,
        seconds,
        pages,
        chunks,
        tokens: row?.token_count ?? null,
        language: row?.language ?? null,
        retrieval: row?.retrieval_mode ?? null,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }

    const pdf = uploaded.find((u) => u.sample.label === 'PDF');
    if (pdf && !failed) {
      const res = await callFunction(
        'ai',
        { action: 'explain', documentId: pdf.id, page: 1, language: 'en' },
        token,
      );
      const raw = await res.text();
      const events = raw
        .split('\n\n')
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.startsWith('data:'))
        .map((chunk) => JSON.parse(chunk.slice(5).trim()) as Record<string, any>);
      const answer = events
        .filter((e) => e.type === 'text')
        .map((e) => e.text)
        .join('');
      const end = events.at(-1);
      const ok = res.ok && answer.length > 40 && end?.type !== 'error';
      if (!ok) failed = true;
      console.log(
        JSON.stringify({
          aiExplainPage1: ok ? 'answered' : 'FAILED',
          status: res.status,
          characters: answer.length,
          mentionsMitochondria: /mitochondri/i.test(answer),
          lastEvent: end?.type ?? null,
          error: ok ? null : (end ?? raw.slice(0, 300)),
        }),
      );
    }
  } finally {
    // Removes the account; documents, pages and chunks cascade, the janitor clears Storage.
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(
      error
        ? `could not delete the temporary account: ${error.message}`
        : 'temporary account deleted',
    );
  }
  if (failed) {
    console.error('document processing check FAILED');
    process.exitCode = 1;
    return;
  }
  console.log('document processing check passed');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error));
  process.exitCode = 1;
});
