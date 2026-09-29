/**
 * Slow and unreliable networks: uploads and AI answers over 2G/3G profiles, and uploads that
 * are cut off mid-transfer and resumed (the same resumable client the app uses).
 */
import { resumableUpload, type ResumableUploadState } from '@studexa/shared';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../src/env.ts';
import { makePdf, studyPages } from '../src/fixtures.ts';
import {
  callJson,
  createUser,
  deleteUser,
  setTier,
  type TestUser,
  waitForDocument,
} from '../src/helpers.ts';
import { PROFILES, startNetworkProxy } from '../src/network-proxy.ts';

let user: TestUser;
beforeAll(async () => {
  user = await createUser('network');
  await setTier(user.id, 'premium');
});
afterAll(async () => {
  await deleteUser(user);
});

async function createSlot(bytes: Uint8Array, title: string) {
  const created = await callJson<{ documentId: string; path: string; token: string }>(
    'document-upload',
    { action: 'create', title, mimeType: 'application/pdf', sizeBytes: bytes.length },
    user.token,
  );
  expect(created.status).toBe(201);
  return created.body;
}

function uploadOptions(baseUrl: string, slot: { path: string; token: string }, bytes: Uint8Array) {
  return {
    supabaseUrl: baseUrl,
    apikey: env.anonKey,
    signature: slot.token,
    bucket: 'documents',
    objectName: slot.path,
    contentType: 'application/pdf',
    size: bytes.length,
    readChunk: async (offset: number, length: number) => bytes.slice(offset, offset + length),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 300))),
  };
}

async function completeAndWait(documentId: string) {
  const done = await callJson('document-upload', { action: 'complete', documentId }, user.token);
  expect(done.status).toBe(200);
  return waitForDocument(documentId);
}

describe('uploads cut off mid-transfer', () => {
  it('a dropped connection resumes where it stopped, without re-sending the file', async () => {
    const bytes = makePdf(studyPages(5600, 30)); // ≈ 14 MB: three 6 MB chunks
    expect(bytes.length).toBeGreaterThan(12 * 1024 * 1024);
    const slot = await createSlot(bytes, 'Interrupted');
    const proxy = await startNetworkProxy(env.supabaseUrl, PROFILES['4g']);
    try {
      let cut = false;
      await resumableUpload({
        ...uploadOptions(proxy.url, slot, bytes),
        onProgress: (sent) => {
          // Signal lost after the first chunk: every open connection drops.
          if (!cut && sent > 0) {
            cut = true;
            expect(sent).toBeLessThan(bytes.length);
            proxy.cutAll();
          }
        },
      });
      expect(cut).toBe(true);
      const doc = await completeAndWait(slot.documentId);
      expect(doc.status).toBe('ready');
      expect(doc.page_count).toBe(5600);
      // At most one chunk was sent twice.
      expect(proxy.bytesUploaded()).toBeLessThan(bytes.length + 6 * 1024 * 1024 + 64 * 1024);
    } finally {
      await proxy.close();
    }
  }, 180_000);

  it('an app killed mid-upload continues on the next launch from the saved state', async () => {
    const bytes = makePdf(studyPages(5600, 30));
    const slot = await createSlot(bytes, 'Killed');
    let saved: ResumableUploadState | null = null;
    const controller = new AbortController();
    await expect(
      resumableUpload({
        ...uploadOptions(env.supabaseUrl, slot, bytes),
        signal: controller.signal,
        onState: (state) => {
          saved = state;
          if (state.offset > 0) controller.abort(); // the OS kills the app
        },
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(saved!.offset).toBeGreaterThan(0);

    const sentOffsets: number[] = [];
    await resumableUpload({
      ...uploadOptions(env.supabaseUrl, slot, bytes),
      uploadUrl: saved!.uploadUrl,
      readChunk: async (offset, length) => {
        sentOffsets.push(offset);
        return bytes.slice(offset, offset + length);
      },
    });
    expect(sentOffsets[0]).toBe(saved!.offset);
    expect((await completeAndWait(slot.documentId)).status).toBe('ready');
  }, 180_000);
});

describe('slow networks', () => {
  it.each(['3g', '2g'] as const)(
    'on %s, a student can sign in, upload, and get a streamed answer',
    async (profileName) => {
      const profile = PROFILES[profileName];
      const proxy = await startNetworkProxy(env.supabaseUrl, profile);
      const timings: Record<string, number> = {};
      try {
        const client = createClient(proxy.url, env.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        let t = Date.now();
        const { data: session, error } = await client.auth.signInWithPassword({
          email: user.email,
          password: 'Integration1test',
        });
        expect(error).toBeNull();
        timings.signInMs = Date.now() - t;

        t = Date.now();
        const { error: listError } = await client.from('documents').select('id, title').limit(20);
        expect(listError).toBeNull();
        timings.listMs = Date.now() - t;

        // A photo-sized upload (150 KB on 2G, 1 MB on 3G).
        const bytes = makePdf(studyPages(profileName === '2g' ? 15 : 100, 30));
        const slot = await createSlot(bytes, `Slow ${profileName}`);
        t = Date.now();
        await resumableUpload(uploadOptions(proxy.url, slot, bytes));
        timings.uploadMs = Date.now() - t;
        await completeAndWait(slot.documentId);

        t = Date.now();
        const res = await fetch(`${proxy.url}/functions/v1/ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.anonKey,
            Authorization: `Bearer ${session.session!.access_token}`,
          },
          body: JSON.stringify({
            action: 'explain',
            documentId: slot.documentId,
            page: 1,
            language: 'en',
          }),
        });
        const reader = res.body!.getReader();
        await reader.read();
        timings.firstByteMs = Date.now() - t;
        let rest = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          rest += new TextDecoder().decode(value);
        }
        timings.answerMs = Date.now() - t;
        expect(rest).toContain('"type":"done"');

        console.log(
          JSON.stringify({
            metric: 'slow_network',
            profile: profile.name,
            bytes: bytes.length,
            ...timings,
          }),
        );
        // Budgets the app's timeouts are designed around.
        expect(timings.signInMs).toBeLessThan(15_000);
        expect(timings.firstByteMs).toBeLessThan(15_000);
      } finally {
        await proxy.close();
      }
    },
    240_000,
  );
});
