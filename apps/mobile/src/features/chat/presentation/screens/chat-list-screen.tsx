import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/core/layout/use-layout';
import { useStyles, type Theme } from '@/core/theme';
import {
  ActionSheet,
  EmptyState,
  Fab,
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
  const { contentMaxWidth } = useLayout();
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

  const items = conversations.data ?? [];
  const header = (
    <View style={styles.header}>
      <ScreenHeader title={t('chat.title')} />
      <SearchBar
        testID="chat-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('chat.searchPlaceholder')}
        clearLabel={t('common.clear')}
      />
      {conversations.isPending ? <Skeleton height={160} radius={16} /> : null}
    </View>
  );

  // Virtualised: a student can have hundreds of conversations; only visible rows render.
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.body, { maxWidth: contentMaxWidth }]}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.segment,
                index === 0 && styles.first,
                index === items.length - 1 && styles.last,
              ]}
            >
              <ConversationRow conversation={item} onLongPress={setSelected} />
            </View>
          )}
          ListEmptyComponent={
            conversations.data?.length === 0 ? (
              <EmptyState
                icon="chat-processing-outline"
                title={query ? t('documents.noResults') : t('chat.emptyTitle')}
                message={t('chat.empty')}
              />
            ) : null
          }
        />
      </View>
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
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1, width: '100%', alignSelf: 'center' },
    header: { gap: spacing.lg, paddingBottom: spacing.lg },
    list: { padding: spacing.lg, paddingBottom: 120 },
    // Rows keep the outlined-card look of the old grouped list.
    segment: {
      overflow: 'hidden',
      borderColor: colors.border,
      borderLeftWidth: 1,
      borderRightWidth: 1,
    },
    first: { borderTopWidth: 1, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
    last: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
    },
  });
