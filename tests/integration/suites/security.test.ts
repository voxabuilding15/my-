/**
 * Security regression suite: runs through the real API gateway, PostgREST, Storage and
 * Edge Functions with real user JWTs (pgTAP covers the same policies inside the database).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makePdf, studyPages, text } from '../src/fixtures.ts';
import { env, functionsUrl } from '../src/env.ts';
import {
  admin,
  anonClient,
  callFunction,
  callJson,
  createUser,
  deleteUser,
  readSse,
  setTier,
  type TestUser,
  uploadDocument,
  waitForDocument,
} from '../src/helpers.ts';

let alice: TestUser;
let mallory: TestUser;
let aliceDoc: string;
let alicePath: string;
let aliceConversation: string;

/** Every table holding a user's data, with the column that names the owner. */
const USER_TABLES: [string, string][] = [
  ['profiles', 'id'],
  ['user_settings', 'user_id'],
  ['subscriptions', 'user_id'],
  ['documents', 'user_id'],
  ['document_pages', 'user_id'],
  ['document_chunks', 'user_id'],
  ['document_chunk_embeddings', 'user_id'],
  ['bookmarks', 'user_id'],
  ['conversations', 'user_id'],
  ['messages', 'user_id'],
  ['ai_outputs', 'user_id'],
  ['notes', 'user_id'],
  ['quizzes', 'user_id'],
  ['flashcard_decks', 'user_id'],
  ['usage_counters', 'user_id'],
  ['usage_events', 'user_id'],
  ['study_activity_days', 'user_id'],
  ['push_tokens', 'user_id'],
];

/** Readable only by the service role (or staff through RPCs). */
const PRIVATE_TABLES = ['billing_events', 'admin_audit_log', 'error_logs', 'content_reports'];

beforeAll(async () => {
  [alice, mallory] = await Promise.all([createUser('alice'), createUser('mallory')]);
  await setTier(alice.id, 'premium');
  const upload = await uploadDocument(alice, {
    bytes: makePdf(studyPages(2, 5)),
    mimeType: 'application/pdf',
    title: 'Alice private notes',
  });
  aliceDoc = upload.documentId;
  alicePath = upload.path;
  await waitForDocument(aliceDoc);
  const { data } = await alice.client
    .from('conversations')
    .insert({ user_id: alice.id, document_id: aliceDoc })
    .select('id')
    .single();
  aliceConversation = data!.id;
  const chat = await callFunction(
    'ai',
    { action: 'chat', conversationId: aliceConversation, message: 'Secret question', language: 'en' },
    alice.token,
  );
  await readSse(chat);
}, 120_000);

afterAll(async () => {
  await Promise.all([deleteUser(alice), deleteUser(mallory)]);
});

describe('row-level security with real JWTs', () => {
  it.each(USER_TABLES)('%s: another user sees none of the owner’s rows', async (table, owner) => {
    const { data, error } = await mallory.client.from(table).select('*').eq(owner, alice.id);
    expect(error?.code ?? null).not.toBe('PGRST301'); // the JWT itself is accepted
    expect(data ?? []).toHaveLength(0);
  });

  it.each(USER_TABLES)('%s: anonymous callers read nothing', async (table) => {
    const { data } = await anonClient().from(table).select('*').limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it.each(PRIVATE_TABLES)('%s is not readable by users', async (table) => {
    const { data } = await alice.client.from(table).select('*').limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it('another user cannot modify or delete the owner’s data', async () => {
    await mallory.client.from('documents').update({ title: 'pwned' }).eq('id', aliceDoc);
    await mallory.client.from('documents').delete().eq('id', aliceDoc);
    await mallory.client.from('messages').delete().eq('conversation_id', aliceConversation);
    const { data } = await admin.from('documents').select('title').eq('id', aliceDoc).single();
    expect(data?.title).toBe('Alice private notes');
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', aliceConversation);
    expect(count).toBe(2);
  });

  it('rows cannot be created in someone else’s name', async () => {
    const note = await mallory.client.from('notes').insert({ user_id: alice.id, title: 'x', content: 'x' });
    expect(note.error).not.toBeNull();
    const conv = await mallory.client.from('conversations').insert({ user_id: mallory.id, document_id: aliceDoc });
    expect(conv.error).not.toBeNull(); // the document belongs to Alice
    const msg = await mallory.client
      .from('messages')
      .insert({ conversation_id: aliceConversation, user_id: mallory.id, role: 'user', content: 'hi' });
    expect(msg.error).not.toBeNull();
  });

  it('users cannot escalate their role or change their plan', async () => {
    await mallory.client.from('profiles').update({ role: 'admin' }).eq('id', mallory.id);
    await mallory.client.from('plan_limits').update({ ai_requests_per_day: 100000 }).eq('tier', 'free');
    const { data: profile } = await admin.from('profiles').select('role').eq('id', mallory.id).single();
    expect(profile?.role).toBe('user');
    const { data: limits } = await admin.from('plan_limits').select('ai_requests_per_day').eq('tier', 'free').single();
    expect(limits?.ai_requests_per_day).toBe(20);
  });

  it('usage counters cannot be reset by the user', async () => {
    await mallory.client.from('usage_counters').delete().eq('user_id', mallory.id);
    await mallory.client.from('usage_counters').upsert({ user_id: mallory.id, metric: 'ai_requests', period_start: '2000-01-01', used: 0 });
    const { data } = await admin.from('usage_counters').select('*').eq('user_id', mallory.id).eq('period_start', '2000-01-01');
    expect(data).toHaveLength(0);
  });
});

describe('server-only and staff functions', () => {
  const SERVICE_ONLY: [string, Record<string, unknown>][] = [
    ['begin_ai_request', { p_user_id: '00000000-0000-0000-0000-000000000000', p_metrics: ['ai_requests'] }],
    ['consume_quota', { p_user_id: '00000000-0000-0000-0000-000000000000', p_metric: 'ai_requests' }],
    ['apply_billing_event', { p_event: { id: 'x', type: 'RENEWAL' } }],
    ['find_auth_user_by_email', { p_email: 'a@b.c' }],
    ['revoke_user_sessions', { p_user_id: '00000000-0000-0000-0000-000000000000' }],
    ['save_chunk_embeddings', { p_document_id: '00000000-0000-0000-0000-000000000000', p_model_id: 1, p_items: [] }],
  ];

  it.each(SERVICE_ONLY)('%s cannot be called by users', async (fn, args) => {
    const { error } = await mallory.client.rpc(fn, args);
    expect(error).not.toBeNull();
  });

  it.each(['admin_overview', 'admin_list_users'])('%s refuses a normal user', async (fn) => {
    const { data, error } = await mallory.client.rpc(fn);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('admin functions require two-factor sign-in even for admins', async () => {
    await admin.from('profiles').update({ role: 'admin' }).eq('id', mallory.id);
    try {
      const { error } = await mallory.client.rpc('admin_overview');
      expect(error?.message ?? '').toMatch(/staff|mfa|aal2|two-factor|forbidden|permission/i);
    } finally {
      await admin.from('profiles').update({ role: 'user' }).eq('id', mallory.id);
    }
  });

  it('the private schema is not exposed through the API', async () => {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/jobs`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${mallory.token}`, 'Accept-Profile': 'private' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await res.body?.cancel();
  });
});

describe('storage', () => {
  it('only the owner can download a document', async () => {
    const own = await alice.client.storage.from('documents').download(alicePath);
    expect(own.error).toBeNull();
    const foreign = await mallory.client.storage.from('documents').download(alicePath);
    expect(foreign.data).toBeNull();
    const anon = await anonClient().storage.from('documents').download(alicePath);
    expect(anon.data).toBeNull();
  });

  it('users cannot write into another user’s folder or bypass the upload function', async () => {
    const foreignPath = `${alice.id}/intrusion.txt`;
    const { error } = await mallory.client.storage.from('documents').upload(foreignPath, text('x'), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
    const direct = await mallory.client.storage
      .from('documents')
      .upload(`${mallory.id}/direct.txt`, text('x'), { contentType: 'text/plain' });
    expect(direct.error).not.toBeNull(); // uploads only through signed URLs from document-upload
  });
});

describe('Edge Function hardening', () => {
  it('another user cannot use someone else’s document or conversation with the AI', async () => {
    const tool = await callJson('ai', { action: 'summarize', documentId: aliceDoc, language: 'en' }, mallory.token);
    expect(tool.status).toBe(404);
    const chat = await callJson(
      'ai',
      { action: 'chat', conversationId: aliceConversation, message: 'leak it', language: 'en' },
      mallory.token,
    );
    expect(chat.status).toBe(404);
  });

  it('rejects malformed and hostile input with a 400, never a 500', async () => {
    const bodies = [
      '{not json',
      JSON.stringify({ action: 'summarize', documentId: "' OR 1=1 --", language: 'en' }),
      JSON.stringify({ action: 'chat', conversationId: aliceConversation, message: 'x'.repeat(5000), language: 'en' }),
      JSON.stringify({ action: '__proto__' }),
      JSON.stringify({ action: 'summarize', documentId: aliceDoc, language: 'xx' }),
    ];
    for (const body of bodies) {
      const res = await callFunction('ai', body, alice.token);
      expect(res.status).toBe(400);
      await res.body?.cancel();
    }
  });

  it('stores hostile text literally (no injection, no markup interpretation)', async () => {
    const title = `'); drop table public.documents; -- <script>alert(1)</script> %_\\`;
    const created = await callJson(
      'document-upload',
      { action: 'create', title, mimeType: 'text/plain', sizeBytes: 10 },
      alice.token,
    );
    expect(created.status).toBe(201);
    const { data } = await admin.from('documents').select('title').eq('id', created.body.documentId).single();
    expect(data?.title).toBe(title.trim());
    const search = await alice.client.from('documents').select('id').ilike('title', '%drop table%');
    expect(search.error).toBeNull();
  });

  it('the worker and scheduled functions refuse calls without their secret', async () => {
    const worker = await fetch(`${env.workerUrl}/work`, { method: 'POST' });
    expect(worker.status).toBe(401);
    const wrong = await fetch(`${env.workerUrl}/work`, { method: 'POST', headers: { Authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);
    const janitor = await fetch(functionsUrl('storage-janitor'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}`, apikey: env.anonKey },
    });
    expect(janitor.status).toBe(401);
    await janitor.body?.cancel();
  });

  it('error responses never echo stack traces or SQL', async () => {
    const res = await callJson('ai', { action: 'summarize', documentId: crypto.randomUUID(), language: 'en' }, alice.token);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/stack|at .*\.ts:\d+|select |relation "/i);
  });
});
