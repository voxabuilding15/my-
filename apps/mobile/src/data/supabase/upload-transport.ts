import { AppError } from '@studexa/shared';
import { File, UploadTask, UploadType } from 'expo-file-system';

import { readTextOnDevice } from '@/core/ocr/on-device-ocr';
import { invokeFunction } from '@/core/supabase/functions';

import type { DocumentUploadTransport } from './documents-repository';

export function createUploadTransport(supabaseUrl: string): DocumentUploadTransport {
  return {
    invoke: (body) => invokeFunction('document-upload', body),
    readImageText: readTextOnDevice,
    async putFile({ path, token, uri, mimeType }) {
      const url = `${supabaseUrl}/storage/v1/object/upload/sign/documents/${path}?token=${encodeURIComponent(token)}`;
      const task = new UploadTask(new File(uri), url, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: { 'Content-Type': mimeType, 'x-upsert': 'false' },
      });
      try {
        const result = await task.uploadAsync();
        if (result.status === 413) throw new AppError('file_too_large');
        if (result.status < 200 || result.status >= 300) {
          throw new AppError('unknown', `upload failed (${result.status})`);
        }
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('network', String(error));
      } finally {
        task.release();
      }
    },
  };
}
