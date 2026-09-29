import { AppError } from '@studexa/shared';

import { createMemoryPendingUploads } from '@/core/upload/pending-uploads';
import { createFakeSupabase } from '@/test-utils/fake-supabase';

import {
  type DocumentUploadTransport,
  type PutFileInput,
  SupabaseDocumentsRepository,
} from '../documents-repository';

const row = {
  id: 'd1',
  title: 'Cells',
  kind: 'pdf',
  size_bytes: 20_000_000,
  page_count: null,
  status: 'processing',
  is_favorite: false,
  last_page: null,
  last_opened_at: null,
  created_at: '2026-09-01T00:00:00Z',
};

const input = {
  name: 'Cells.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 20_000_000,
  uri: 'file:///cache/cells.pdf',
  source: 'file' as const,
};

function transportWith(putFile: (input: PutFileInput) => Promise<void>) {
  const actions: string[] = [];
  const transport: DocumentUploadTransport = {
    invoke: async <T>(body: Record<string, unknown>) => {
      actions.push(String(body.action));
      return (
        body.action === 'create'
          ? { documentId: 'd1', path: 'user-1/d1/original.pdf', token: 'signed' }
          : { status: 'queued' }
      ) as T;
    },
    putFile,
    readImageText: async () => '',
  };
  return { transport, actions };
}

describe('interrupted uploads', () => {
  it('keeps an upload cut off by the network and finishes it later from where it stopped', async () => {
    const pending = createMemoryPendingUploads();
    const attempts: PutFileInput[] = [];
    let online = false;
    const { transport, actions } = transportWith(async (put) => {
      attempts.push(put);
      if (!online) {
        // The first chunk made it before the signal dropped.
        put.onState?.({ uploadUrl: 'https://storage/tus/1', offset: 6 * 1024 * 1024 });
        throw new AppError('network', 'lost connection');
      }
    });
    const { client } = createFakeSupabase({ documents: [{ data: row, error: null }] });
    const repo = new SupabaseDocumentsRepository(client, transport, pending);

    await expect(repo.upload(input)).rejects.toMatchObject({ code: 'network' });
    expect(pending.list('user-1')).toEqual([
      expect.objectContaining({
        documentId: 'd1',
        uploadUrl: 'https://storage/tus/1',
        offset: 6291456,
      }),
    ]);
    expect(actions).toEqual(['create']);

    online = true;
    expect(await repo.resumePendingUploads()).toBe(1);
    // The resumed transfer continues the same upload instead of starting a new one.
    expect(attempts[1]).toMatchObject({ uploadUrl: 'https://storage/tus/1', token: 'signed' });
    expect(actions).toEqual(['create', 'complete']);
    expect(pending.list('user-1')).toEqual([]);
  });

  it('drops an upload whose signed slot expired and tells the user', async () => {
    const pending = createMemoryPendingUploads();
    const { transport } = transportWith(async () => {
      throw new AppError('upload_expired');
    });
    const { client } = createFakeSupabase({});
    const repo = new SupabaseDocumentsRepository(client, transport, pending);
    await expect(repo.upload(input)).rejects.toMatchObject({ code: 'upload_expired' });
    expect(pending.list('user-1')).toEqual([]);
  });

  it('stops resuming while still offline and keeps everything for later', async () => {
    const pending = createMemoryPendingUploads();
    for (const id of ['a', 'b']) {
      pending.save({
        userId: 'user-1',
        documentId: id,
        path: `user-1/${id}/original.pdf`,
        token: 't',
        uri: 'file:///x',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        uploadUrl: null,
        offset: 0,
        createdAt: Date.now(),
      });
    }
    const put = jest.fn(async () => {
      throw new AppError('network');
    });
    const { transport } = transportWith(put);
    const repo = new SupabaseDocumentsRepository(createFakeSupabase({}).client, transport, pending);
    expect(await repo.resumePendingUploads()).toBe(0);
    expect(put).toHaveBeenCalledTimes(1);
    expect(pending.list('user-1')).toHaveLength(2);
  });

  it('never resumes another account’s uploads', async () => {
    const pending = createMemoryPendingUploads();
    pending.save({
      userId: 'someone-else',
      documentId: 'x',
      path: 'someone-else/x/original.pdf',
      token: 't',
      uri: 'file:///x',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      uploadUrl: null,
      offset: 0,
      createdAt: Date.now(),
    });
    const put = jest.fn(async () => undefined);
    const { transport } = transportWith(put);
    const repo = new SupabaseDocumentsRepository(createFakeSupabase({}).client, transport, pending);
    expect(await repo.resumePendingUploads()).toBe(0);
    expect(put).not.toHaveBeenCalled();
  });
});
