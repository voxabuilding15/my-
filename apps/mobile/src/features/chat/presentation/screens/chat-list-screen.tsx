import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import {
  ActionSheet,
  Card,
  EmptyState,
  Fab,
  Screen,
  ScreenHeader,
  SearchBar,
  Skeleton,
  useSnackbar,
} from '@/shared/ui';

import type { Conversation } from '../../domain/chat';
import { ConversationRow } from '../components/conversation-row';
import { useConversations, useDeleteConversation, useOpenConversation } from '../hooks/use-chat';

export function ChatListScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const [query, setQuery] = useState('');
  const conversations = useConversations(query);
  const open = useOpenConversation();
  const remove = useDeleteConversation();
  const [selected, setSelected] = useState<Conversation | null>(null);

  const startChat = () =>
    open.mutate(null, {
      onSuccess: (conversation) =>
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } }),
    });

  const confirmDelete = (conversation: Conversation) =>
    Alert.alert(t('chat.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(conversation.id, { onSuccess: () => snackbar(t('chat.deleted')) }),
      },
    ]);

  return (
    <View style={styles.root}>
      <Screen scroll>
        <ScreenHeader title={t('chat.title')} />
        <SearchBar
          testID="chat-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('chat.searchPlaceholder')}
          clearLabel={t('common.clear')}
        />
        {conversations.isPending ? <Skeleton height={160} radius={16} /> : null}
        {conversations.data?.length === 0 ? (
          <EmptyState
            icon="chat-processing-outline"
            title={query ? t('documents.noResults') : t('chat.emptyTitle')}
            message={t('chat.empty')}
          />
        ) : null}
        {conversations.data?.length ? (
          <Card variant="outlined" style={styles.list}>
            {conversations.data.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                onLongPress={setSelected}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
      <Fab
        testID="new-chat"
        icon="chat-plus-outline"
        label={t('chat.newChat')}
        onPress={startChat}
      />
      <ActionSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title || selected?.documentTitle || t('chat.general')}
        actions={
          selected
            ? [
                {
                  key: 'delete',
                  icon: 'delete-outline',
                  label: t('common.delete'),
                  destructive: true,
                  onPress: () => confirmDelete(selected),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    list: { padding: 0, gap: 0, overflow: 'hidden' },
  });
