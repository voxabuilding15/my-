import type { AiRepository } from '@/features/ai-tools/domain/ai-tools';
import type { ChatRepository } from '@/features/chat/domain/chat';
import type { DocumentsRepository } from '@/features/documents/domain/documents-repository';
import type { FlashcardsRepository } from '@/features/flashcards/domain/flashcards';
import type { ProgressRepository } from '@/features/home/domain/progress';
import type { NotesRepository } from '@/features/notes/domain/note';
import type { QuizzesRepository } from '@/features/quizzes/domain/quiz';
import type { SubscriptionRepository } from '@/features/subscription/domain/subscription';

export type AppRepositories = {
  documents: DocumentsRepository;
  chat: ChatRepository;
  flashcards: FlashcardsRepository;
  quizzes: QuizzesRepository;
  notes: NotesRepository;
  ai: AiRepository;
  progress: ProgressRepository;
  subscription: SubscriptionRepository;
};
