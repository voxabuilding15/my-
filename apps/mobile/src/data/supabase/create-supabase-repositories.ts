import type { SupabaseClient } from '@supabase/supabase-js';

import type { AppRepositories } from '@/data/app-repositories';

import { SupabaseChatRepository } from './chat-repository';
import { SupabaseDocumentsRepository } from './documents-repository';
import { SupabaseFlashcardsRepository } from './flashcards-repository';
import { SupabaseNotesRepository } from './notes-repository';
import { SupabaseProgressRepository } from './progress-repository';
import { SupabaseQuizzesRepository } from './quizzes-repository';
import { createRevenueCatStore } from './revenuecat-store';
import { SupabaseSubscriptionRepository } from './subscription-repository';
import { UnavailableAiRepository } from './unavailable-ai-repository';
import { createUploadTransport } from './upload-transport';

export function createSupabaseRepositories(
  client: SupabaseClient,
  config: { supabaseUrl: string; revenueCatKey: string | undefined },
): AppRepositories {
  return {
    documents: new SupabaseDocumentsRepository(client, createUploadTransport(config.supabaseUrl)),
    chat: new SupabaseChatRepository(client),
    flashcards: new SupabaseFlashcardsRepository(client),
    quizzes: new SupabaseQuizzesRepository(client),
    notes: new SupabaseNotesRepository(client),
    ai: new UnavailableAiRepository(),
    progress: new SupabaseProgressRepository(client),
    subscription: new SupabaseSubscriptionRepository(
      client,
      createRevenueCatStore(config.revenueCatKey),
    ),
  };
}
