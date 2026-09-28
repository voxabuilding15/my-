import { useState, type PropsWithChildren } from 'react';

import { env } from '@/core/config/env';
import { getSupabase } from '@/core/supabase/client';
import type { AppRepositories } from '@/data/app-repositories';
import { createDemoRepositories } from '@/data/demo/demo-repositories';
import { createSupabaseRepositories } from '@/data/supabase/create-supabase-repositories';
import { AiRepositoryProvider } from '@/features/ai-tools/repository';
import { ChatRepositoryProvider } from '@/features/chat/repository';
import { DocumentsRepositoryProvider } from '@/features/documents/repository';
import { FlashcardsRepositoryProvider } from '@/features/flashcards/repository';
import { ProgressRepositoryProvider } from '@/features/home/repository';
import { NotesRepositoryProvider } from '@/features/notes/repository';
import { QuizzesRepositoryProvider } from '@/features/quizzes/repository';
import { SubscriptionRepositoryProvider } from '@/features/subscription/repository';

function createRepositories(): AppRepositories {
  if (env.useMocks || !env.supabaseUrl) return createDemoRepositories();
  return createSupabaseRepositories(getSupabase(), {
    supabaseUrl: env.supabaseUrl,
    revenueCatKey: env.revenueCatAndroidKey,
  });
}

/**
 * Composition root: the only place that chooses repository implementations — the in-memory
 * demo backend in mock mode, Supabase otherwise. Features only see the repository interfaces.
 */
export function AppRepositoriesProvider({
  repositories,
  children,
}: PropsWithChildren<{ repositories?: AppRepositories }>) {
  const [value] = useState<AppRepositories>(() => repositories ?? createRepositories());
  return (
    <DocumentsRepositoryProvider value={value.documents}>
      <ChatRepositoryProvider value={value.chat}>
        <FlashcardsRepositoryProvider value={value.flashcards}>
          <QuizzesRepositoryProvider value={value.quizzes}>
            <NotesRepositoryProvider value={value.notes}>
              <AiRepositoryProvider value={value.ai}>
                <ProgressRepositoryProvider value={value.progress}>
                  <SubscriptionRepositoryProvider value={value.subscription}>
                    {children}
                  </SubscriptionRepositoryProvider>
                </ProgressRepositoryProvider>
              </AiRepositoryProvider>
            </NotesRepositoryProvider>
          </QuizzesRepositoryProvider>
        </FlashcardsRepositoryProvider>
      </ChatRepositoryProvider>
    </DocumentsRepositoryProvider>
  );
}
