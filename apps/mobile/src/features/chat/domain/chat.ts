import type { AppLocale, Citation } from '@studexa/shared';

export type Conversation = {
  id: string;
  documentId: string | null;
  documentTitle: string | null;
  title: string;
  preview: string;
  messageCount: number;
  lastMessageAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Pages the answer was grounded in. */
  citations: Citation[];
  createdAt: string;
};

export interface ChatRepository {
  conversations(query?: string): Promise<Conversation[]>;
  messages(conversationId: string): Promise<ChatMessage[]>;
  /** Opens (or reuses) the chat for a document; null = general chat. */
  openConversation(documentId: string | null): Promise<Conversation>;
  /** Sends a message; the reply streams through `onToken` and resolves when complete. */
  send(
    conversationId: string,
    text: string,
    language: AppLocale,
    onToken: (partial: string) => void,
  ): Promise<ChatMessage>;
  remove(conversationId: string): Promise<void>;
}
