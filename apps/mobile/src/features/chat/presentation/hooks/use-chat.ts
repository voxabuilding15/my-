import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ChatMessage } from '../../domain/chat';
import { useChatRepository } from '../../repository';

export const chatKeys = {
  list: (query = '') => ['conversations', query] as const,
  messages: (id: string) => ['conversations', id, 'messages'] as const,
};

export function useConversations(query = '') {
  const repository = useChatRepository();
  return useQuery({
    queryKey: chatKeys.list(query),
    queryFn: () => repository.conversations(query),
  });
}

export function useMessages(conversationId: string) {
  const repository = useChatRepository();
  return useQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: () => repository.messages(conversationId),
  });
}

export function useOpenConversation() {
  const repository = useChatRepository();
  return useMutation({
    mutationFn: (documentId: string | null) => repository.openConversation(documentId),
  });
}

export function useDeleteConversation() {
  const repository = useChatRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.remove(id),
    onSettled: () => client.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

/** Sends a message and exposes the streaming reply while it arrives. */
export function useSendMessage(conversationId: string) {
  const repository = useChatRepository();
  const client = useQueryClient();
  const [streaming, setStreaming] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (text: string) => {
      client.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (messages = []) => [
        ...messages,
        {
          id: `pending-${Date.now()}`,
          role: 'user',
          content: text,
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreaming('');
      return repository.send(conversationId, text, setStreaming);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
      setStreaming(null);
    },
  });

  return { send: mutation.mutate, isSending: mutation.isPending, error: mutation.error, streaming };
}
