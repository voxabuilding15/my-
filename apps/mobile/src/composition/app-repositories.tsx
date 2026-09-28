import { useState, type PropsWithChildren } from 'react';

import { createDemoRepositories, type AppRepositories } from '@/data/demo/demo-repositories';
import { AiRepositoryProvider } from '@/features/ai-tools/repository';
import { ChatRepositoryProvider } from '@/features/chat/repository';
import { DocumentsRepositoryProvider } from '@/features/documents/repository';
import { FlashcardsRepositoryProvider } from '@/features/flashcards/repository';
import { ProgressRepositoryProvider } from '@/features/home/repository';
import { NotesRepositoryProvider } from '@/features/notes/repository';
import { QuizzesRepositoryProvider } from '@/features/quizzes/repository';
import { SubscriptionRepositoryProvider } from '@/features/subscription/repository';

/**
 * Composition root: the only place that chooses repository implementations.
 * Phase 4 uses the in-memory demo backend for study content; Phase 5 selects the Supabase
 * implementations here (outside mock mode) without touching any feature code.
 */
export function AppRepositoriesProvider({
  repositories,
  children,
}: PropsWithChildren<{ repositories?: AppRepositories }>) {
  const [value] = useState<AppRepositories>(() => repositories ?? createDemoRepositories());
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
