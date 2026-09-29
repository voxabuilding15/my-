import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, functionsUrl } from './env.ts';

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export const admin: SupabaseClient = createClient(env.supabaseUrl, env.serviceRoleKey, options);

export const anonClient = (): SupabaseClient => createClient(env.supabaseUrl, env.anonKey, options);

export const PASSWORD = 'Integration1test';

export type TestUser = {
  id: string;
  email: string;
  token: string;
  client: SupabaseClient;
};

export const uniqueEmail = (label = 'user') =>
  `${label}-${randomUUID().slice(0, 8)}@studexa-tests.dev`;

/** Signs up through GoTrue like the app does; the account starts unverified. */
export async function signUp(email = uniqueEmail()): Promise<TestUser> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { display_name: 'Test Student' } },
  });
  if (error || !data.session || !data.user) throw error ?? new Error('sign-up returned no session');
  return { id: data.user.id, email, token: data.session.access_token, client };
}

/**
 * A verified user. Marks the account verified with the service role, like auth-email-code
 * does after a correct code (the auth suite covers the real code flow), then refreshes the
 * session so the JWT carries the new app_metadata.
 */
export async function createUser(label = 'user'): Promise<TestUser> {
  const user = await signUp(uniqueEmail(label));
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { email_verified: true },
  });
  if (error) throw error;
  const { data, error: signInError } = await user.client.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (signInError || !data.session) throw signInError ?? new Error('sign-in failed');
  return { ...user, token: data.session.access_token };
}

export async function deleteUser(user: { id: string } | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
}

export async function setTier(userId: string, tier: 'free' | 'premium') {
  const { error } = await admin
    .from('subscriptions')
    .update({
      tier,
      status: tier === 'premium' ? 'active' : 'none',
      current_period_end:
        tier === 'premium' ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
    })
    .eq('user_id', userId);
  if (error) throw error;
}

/** Calls an Edge Function as the user (or anonymously with `token: null`). */
export async function callFunction(
  name: string,
  body: unknown,
  token: string | null,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Response> {
  return fetch(functionsUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: init.signal ?? null,
  });
}

export async function callJson<T = any>(name: string, body: unknown, token: string | null) {
  const res = await callFunction(name, body, token);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

/** Parses an SSE response from the `ai` function into its events. */
export async function readSse(res: Response): Promise<any[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

// Mock server (Anthropic, Voyage, email inbox)

export async function latestCode(to: string, subjectIncludes?: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${env.mockUrl}/email?to=${encodeURIComponent(to)}`);
    const mails = (await res.json()) as { subject: string; text: string }[];
    const mail = mails
      .filter((m) => !subjectIncludes || m.subject.includes(subjectIncludes))
      .at(-1);
    const code = mail && /\b(\d{6})\b/.exec(mail.text)?.[1];
    if (code) return code;
    await sleep(200);
  }
  throw new Error(`no code emailed to ${to}`);
}

export async function mockRequests(): Promise<
  { at: number; path: string; model?: string; summary: Record<string, any> }[]
> {
  return (await fetch(`${env.mockUrl}/__requests`)).json() as never;
}

export async function clearMockRequests() {
  await fetch(`${env.mockUrl}/__requests`, { method: 'DELETE' });
}

// Documents

export type UploadedFile = { bytes: Uint8Array; mimeType: string; title?: string };

/** Uploads like the app: create (quota + signed URL) → PUT to Storage → complete. */
export async function uploadDocument(user: TestUser, file: UploadedFile, ocrText?: string) {
  const created = await callJson<{ documentId: string; path: string; token: string }>(
    'document-upload',
    {
      action: 'create',
      title: file.title ?? 'Test document',
      mimeType: file.mimeType,
      sizeBytes: file.bytes.byteLength,
    },
    user.token,
  );
  if (created.status !== 201) {
    throw Object.assign(new Error(`create failed: ${created.status}`), { response: created });
  }
  const { documentId, path, token } = created.body;
  const { error } = await user.client.storage
    .from('documents')
    .uploadToSignedUrl(path, token, file.bytes, { contentType: file.mimeType });
  if (error) throw error;
  const completed = await callJson<{ status: string }>(
    'document-upload',
    { action: 'complete', documentId, ...(ocrText ? { ocrText } : {}) },
    user.token,
  );
  return { documentId, path, complete: completed };
}

/** Runs the worker once (what Cloud Scheduler or the upload nudge does). */
export async function runWorker() {
  const res = await fetch(`${env.workerUrl}/work`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.workerSecret}` },
  });
  if (!res.ok) throw new Error(`worker run failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function waitForDocument(
  documentId: string,
  statuses: string[] = ['ready', 'failed'],
  timeoutMs = 90_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await admin.from('documents').select('*').eq('id', documentId).single();
    if (data && statuses.includes(data.status)) return data;
    await runWorker().catch(() => undefined);
    await sleep(500);
  }
  throw new Error(`document ${documentId} did not reach ${statuses.join('/')}`);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
