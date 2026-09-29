import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useIsOnline } from '@/core/network/online';
import { reportError } from '@/core/telemetry';

import { useDocumentsRepository } from '../../repository';
import { documentKeys } from './use-documents';

/**
 * Finishes uploads that were cut off (lost signal, app closed, phone restarted): once when
 * the signed-in app starts, and again whenever the connection comes back.
 */
export function useResumePendingUploads(): void {
  const repository = useDocumentsRepository();
  const client = useQueryClient();
  const online = useIsOnline();

  useEffect(() => {
    if (!online) return;
    let active = true;
    repository
      .resumePendingUploads()
      .then((completed) => {
        if (active && completed > 0) void client.invalidateQueries({ queryKey: documentKeys.all });
      })
      .catch((error: unknown) => reportError(error, { task: 'resume_uploads' }));
    return () => {
      active = false;
    };
  }, [online, repository, client]);
}
