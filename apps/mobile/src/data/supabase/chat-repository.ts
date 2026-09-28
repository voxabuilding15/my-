import { AppError } from '@studexa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ChatMessage, ChatRepository, Conversation } from '@/features/chat/domain/chat';

import { check, currentUserId, unwrap } from './postgrest';

type ConversationRow = {
  id: string;
  document_id: string | null;
  document_title: string | null;
  title: string;
  preview: string;
  message_count: number;
  last_message_at: string;
};

const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  documentId: row.document_id,
  documentTitle: row.document_title,
  title: row.title,
  preview: row.preview,
  messageCount: row.message_count,
  lastMessageAt: row.last_message_at,
});

/** Conversation history. Sending (AI answers from the document) arrives with the AI phase. */
export class SupabaseChatRepository implements ChatRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly sendMessage: ChatRepository['send'] = () =>
      Promise.reject(new AppError('ai_unavailable')),
  ) {}

  async conversations(query?: string) {
    const rows = unwrap(
      await this.client.rpc('list_my_conversations', { p_query: query ?? null, p_limit: 100 }),
    ) as ConversationRow[];
    return rows.map(toConversation);
  }

  async messages(conversationId: string): Promise<ChatMessage[]> {
    const rows = unwrap(
      await this.client
        .from('messages')
        .select('id, role, content, citations, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at'),
    ) as {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      citations: unknown;
      created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      citations: Array.isArray(row.citations)
        ? row.citations.filter((page): page is number => typeof page === 'number')
        : [],
      createdAt: row.created_at,
    }));
  }

  async openConversation(documentId: string | null) {
    if (documentId) {
      const existing = unwrap(
        await this.client
          .from('conversations')
          .select('id')
          .eq('document_id', documentId)
          .order('updated_at', { ascending: false })
          .limit(1),
      ) as { id: string }[];
      const found = existing[0] && (await this.find(existing[0].id));
      if (found) return found;
    }
    const userId = await currentUserId(this.client);
    const created = unwrap(
      await this.client
        .from('conversations')
        .insert({ user_id: userId, document_id: documentId })
        .select('id')
        .single(),
    ) as { id: string };
    const conversation = await this.find(created.id);
    if (!conversation) throw new AppError('not_found');
    return conversation;
  }

  private async find(id: string): Promise<Conversation | null> {
    const rows = unwrap(
      await this.client
        .from('conversations')
        .select(
          'id, document_id, title, message_count, last_message_at, created_at, documents(title)',
        )
        .eq('id', id)
        .maybeSingle(),
    ) as {
      id: string;
      document_id: string | null;
      title: string;
      message_count: number;
      last_message_at: string | null;
      created_at: string;
      documents: { title: string } | null;
    } | null;
    if (!rows) return null;
    return {
      id: rows.id,
      documentId: rows.document_id,
      documentTitle: rows.documents?.title ?? null,
      title: rows.title,
      preview: '',
      messageCount: rows.message_count,
      lastMessageAt: rows.last_message_at ?? rows.created_at,
    };
  }

  send(conversationId: string, text: string, onToken: (partial: string) => void) {
    return this.sendMessage(conversationId, text, onToken);
  }

  async remove(conversationId: string) {
    check(await this.client.from('conversations').delete().eq('id', conversationId));
  }
}
