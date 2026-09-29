import { AppError, resumableUpload, ResumableUploadError } from '@studexa/shared';
import { File } from 'expo-file-system';

import { readTextOnDevice } from '@/core/ocr/on-device-ocr';
import { invokeFunction } from '@/core/supabase/functions';

import type { DocumentUploadTransport } from './documents-repository';

/** Reads one chunk at a time from disk, so a 50 MB file never sits in JS memory whole. */
function chunkReader(uri: string) {
  return async (offset: number, length: number) => {
    const handle = new File(uri).open();
    try {
      handle.offset = offset;
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  };
}

export function toUploadError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ResumableUploadError) {
    switch (error.kind) {
      case 'too_large':
        return new AppError('file_too_large');
      case 'expired':
        return new AppError('upload_expired', error.message);
      case 'rejected':
        return new AppError('unknown', error.message);
      default:
        // network / aborted: the upload is kept and resumes later.
        return new AppError('network', error.message);
    }
  }
  return new AppError('network', String(error));
}

export function createUploadTransport(
  supabaseUrl: string,
  anonKey: string,
): DocumentUploadTransport {
  return {
    invoke: (body) => invokeFunction('document-upload', body),
    readImageText: readTextOnDevice,
    async putFile({ path, token, uri, mimeType, sizeBytes, uploadUrl, onState, signal }) {
      try {
        await resumableUpload({
          supabaseUrl,
          apikey: anonKey,
          signature: token,
          bucket: 'documents',
          objectName: path,
          contentType: mimeType,
          size: sizeBytes,
          readChunk: chunkReader(uri),
          uploadUrl,
          onState,
          signal,
        });
      } catch (error) {
        throw toUploadError(error);
      }
    },
  };
}
