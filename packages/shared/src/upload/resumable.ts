/**
 * Resumable uploads to Supabase Storage (TUS 1.0.0) with a signed upload token, so users never
 * need write access to the bucket: the token from the `document-upload` function authorises
 * exactly one object path.
 *
 * Platform-neutral (fetch + a chunk reader): the app reads chunks from disk, tests from memory.
 * A dropped connection, a killed app or a device restart loses at most one chunk: the upload
 * URL and offset are reported through `onState`, persisted by the caller, and passed back as
 * `uploadUrl` to continue where the server says the file stopped.
 */

/** Supabase Storage requires 6 MB chunks (except the last). */
export const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;

export type ResumableFailure = 'expired' | 'too_large' | 'rejected' | 'network' | 'aborted';

export class ResumableUploadError extends Error {
  constructor(
    readonly kind: ResumableFailure,
    readonly status?: number,
  ) {
    super(`resumable upload failed: ${kind}${status ? ` (${status})` : ''}`);
    this.name = 'ResumableUploadError';
  }
}

export type ResumableUploadState = { uploadUrl: string; offset: number };

export type ResumableUploadOptions = {
  /** Supabase project URL. */
  supabaseUrl: string;
  /** Publishable (anon) key for the API gateway. */
  apikey: string;
  /** Token from `createSignedUploadUrl` (the document-upload function). */
  signature: string;
  bucket: string;
  objectName: string;
  contentType: string;
  size: number;
  readChunk(offset: number, length: number): Promise<Uint8Array>;
  /** An upload URL saved from an earlier, interrupted attempt. */
  uploadUrl?: string | null | undefined;
  onState?: ((state: ResumableUploadState) => void | Promise<void>) | undefined;
  onProgress?: ((sent: number, total: number) => void) | undefined;
  signal?: AbortSignal | undefined;
  /** Chunk size; Supabase requires the default. Tests use smaller chunks. */
  chunkBytes?: number | undefined;
  /** Attempts per request before giving up (network errors and 5xx). */
  attempts?: number | undefined;
  fetch?: typeof fetch | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
};

const TUS = { 'Tus-Resumable': '1.0.0' } as const;

const base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export async function resumableUpload(options: ResumableUploadOptions): Promise<void> {
  const http = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = options.attempts ?? 6;
  const auth = { apikey: options.apikey, 'x-signature': options.signature };

  /** Retries network failures and 5xx with backoff (1 s, 2 s, 4 s … up to 30 s). */
  async function send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      if (options.signal?.aborted) throw new ResumableUploadError('aborted');
      try {
        const res = await http(url, { ...init, signal: options.signal ?? null });
        if (res.status < 500 || attempt >= attempts) return res;
        await res.body?.cancel();
      } catch (error) {
        if (options.signal?.aborted) throw new ResumableUploadError('aborted');
        if (attempt >= attempts) throw new ResumableUploadError('network');
        void error;
      }
      await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    }
  }

  function fail(res: Response): never {
    if (res.status === 413) throw new ResumableUploadError('too_large', res.status);
    // The signed token lasts two hours; after that the upload has to start over.
    if (res.status === 401 || res.status === 403)
      throw new ResumableUploadError('expired', res.status);
    if (res.status >= 500) throw new ResumableUploadError('network', res.status);
    throw new ResumableUploadError('rejected', res.status);
  }

  /** Where the server says the file stopped, or null when the upload is unknown or expired. */
  async function serverOffset(url: string): Promise<number | null> {
    const res = await send(url, { method: 'HEAD', headers: { ...TUS, ...auth } });
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) fail(res);
    return Number(res.headers.get('upload-offset') ?? 0);
  }

  const chunkBytes = options.chunkBytes ?? RESUMABLE_CHUNK_BYTES;
  let uploadUrl = options.uploadUrl ?? null;
  let offset = 0;
  if (uploadUrl) {
    const known = await serverOffset(uploadUrl);
    if (known === null) uploadUrl = null;
    else offset = known;
  }

  if (!uploadUrl) {
    const res = await send(`${options.supabaseUrl}/storage/v1/upload/resumable/sign`, {
      method: 'POST',
      headers: {
        ...TUS,
        ...auth,
        'Upload-Length': String(options.size),
        'Upload-Metadata': [
          `bucketName ${base64(options.bucket)}`,
          `objectName ${base64(options.objectName)}`,
          `contentType ${base64(options.contentType)}`,
        ].join(','),
      },
    });
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (res.status !== 201 || !location) fail(res);
    uploadUrl = location;
    offset = 0;
    await options.onState?.({ uploadUrl, offset });
  }

  options.onProgress?.(offset, options.size);
  // Consecutive failed chunks without progress: bounded, so a dead link cannot loop forever.
  let stalls = 0;
  while (offset < options.size) {
    if (stalls >= attempts) throw new ResumableUploadError('network');
    const length = Math.min(chunkBytes, options.size - offset);
    const chunk = await options.readChunk(offset, length);
    let res: Response;
    try {
      res = await send(uploadUrl, {
        method: 'PATCH',
        headers: {
          ...TUS,
          ...auth,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: chunk as unknown as BodyInit,
      });
    } catch (error) {
      if (error instanceof ResumableUploadError && error.kind === 'network') {
        // The chunk may have landed before the connection dropped: ask the server.
        const known = await serverOffset(uploadUrl).catch(() => null);
        if (known === null) throw error;
        stalls = known > offset ? 0 : stalls + 1;
        offset = known;
        continue;
      }
      throw error;
    }
    await res.body?.cancel();
    if (res.status === 409) {
      // Offset mismatch (a retried chunk had already arrived): resynchronise.
      const known = await serverOffset(uploadUrl);
      if (known === null) throw new ResumableUploadError('rejected', 409);
      stalls = known > offset ? 0 : stalls + 1;
      offset = known;
      continue;
    }
    if (res.status !== 204) fail(res);
    offset = Number(res.headers.get('upload-offset') ?? offset + length);
    stalls = 0;
    await options.onState?.({ uploadUrl, offset });
    options.onProgress?.(offset, options.size);
  }
}
