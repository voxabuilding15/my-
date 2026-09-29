import type { SupabaseClient } from '@supabase/supabase-js';

import { streamAi } from '@/core/ai';
import type { AppRepositories } from '@/data/app-repositories';

import { SupabaseAiRepository } from './ai-repository';
import { SupabaseChatRepository } from './chat-repository';
import { SupabaseDocumentsRepository } from './documents-repository';
import { SupabaseFlashcardsRepository } from './flashcards-repository';
import { SupabaseNotesRepository } from './notes-repository';
import { SupabaseProgressRepository } from './progress-repository';
import { SupabaseQuizzesRepository } from './quizzes-repository';
import { createRevenueCatStore } from './revenuecat-store';
import { SupabaseSubscriptionRepository } from './subscription-repository';
import { createUploadTransport } from './upload-transport';

export function createSupabaseRepositories(
  client: SupabaseClient,
  config: { supabaseUrl: string; anonKey: string; revenueCatKey: string | undefined },
): AppRepositories {
  return {
    documents: new SupabaseDocumentsRepository(
      client,
      createUploadTransport(config.supabaseUrl, config.anonKey),
    ),
    chat: new SupabaseChatRepository(client, streamAi),
    flashcards: new SupabaseFlashcardsRepository(client, streamAi),
    quizzes: new SupabaseQuizzesRepository(client, streamAi),
    notes: new SupabaseNotesRepository(client),
    ai: new SupabaseAiRepository(client, streamAi),
    progress: new SupabaseProgressRepository(client),
    subscription: new SupabaseSubscriptionRepository(
      client,
      createRevenueCatStore(config.revenueCatKey),
    ),
  };
}
