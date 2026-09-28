import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useErrorMessage } from '@/core/i18n/error-message';
import { formatBytes } from '@/core/i18n/format';
import { useLayout } from '@/core/layout/use-layout';
import { useFeatureFlag } from '@/core/remote-config';
import { useStyles, type ColorTokens, type Theme } from '@/core/theme';
import { DOCUMENT_TOOLS, type DocumentTool } from '@/features/ai-tools';
import { useOpenConversation } from '@/features/chat';
import { useDecks } from '@/features/flashcards';
import {
  ActionSheet,
  AppText,
  Appear,
  Button,
  Card,
  EmptyState,
  FormMessage,
  Icon,
  IconButton,
  ListRow,
  ProgressBar,
  Screen,
  Section,
  Skeleton,
  useSnackbar,
  type IconName,
} from '@/shared/ui';

import { readingProgress } from '../../domain/document';
import { DocumentKindIcon } from '../components/document-kind';
import { RenameSheet } from '../components/rename-sheet';
import { useBookmarks, useDocument, useDocumentMutations } from '../hooks/use-documents';

const TOOL_ICONS: Record<DocumentTool, { icon: IconName; color: keyof ColorTokens }> = {
  summarize: { icon: 'text-box-outline', color: 'primaryText' },
  explain: { icon: 'lightbulb-on-outline', color: 'warning' },
  eli10: { icon: 'teddy-bear', color: 'streak' },
  notes: { icon: 'note-text-outline', color: 'notes' },
  mind_map: { icon: 'graph-outline', color: 'quizzes' },
  study_plan: { icon: 'calendar-check-outline', color: 'success' },
  practice_questions: { icon: 'help-circle-outline', color: 'chat' },
  translate: { icon: 'translate', color: 'flashcards' },
};

export function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const mindMap = useFeatureFlag('ai.mind_map');
  const tools = DOCUMENT_TOOLS.filter((tool) => tool !== 'mind_map' || mindMap);
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const toMessage = useErrorMessage();
  const { columns } = useLayout();
  const document = useDocument(id);
  const bookmarks = useBookmarks(id);
  const decks = useDecks();
  const openConversation = useOpenConversation();
  const { setFavorite, rename, remove } = useDocumentMutations();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);

  if (document.isError) {
    return (
      <Screen>
        <FormMessage tone="error" message={toMessage(document.error)} />
      </Screen>
    );
  }
  const doc = document.data;
  const deck = decks.data?.find((d) => d.documentId === id);
  const toolWidth = { width: `${100 / (columns === 1 ? 2 : 4)}%` as const };

  const confirmDelete = () =>
    Alert.alert(t('documents.deleteTitle'), t('documents.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              snackbar(t('documents.deleted'));
              router.back();
            },
          }),
      },
    ]);

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () =>
            doc ? (
              <View style={styles.headerActions}>
                <IconButton
                  testID="favorite"
                  icon={doc.isFavorite ? 'star' : 'star-outline'}
                  color={doc.isFavorite ? 'warning' : 'text'}
                  accessibilityLabel={
                    doc.isFavorite ? t('documents.unfavorite') : t('documents.favorite')
                  }
                  onPress={() => setFavorite.mutate({ id, favorite: !doc.isFavorite })}
                />
                <IconButton
                  icon="dots-vertical"
                  accessibilityLabel={t('documents.more', { title: doc.title })}
                  onPress={() => setMenu(true)}
                />
              </View>
            ) : null,
        }}
      />
      {!doc ? (
        <View style={styles.skeleton}>
          <Skeleton width={64} height={64} radius={16} />
          <Skeleton width="80%" height={28} />
          <Skeleton height={52} radius={12} />
        </View>
      ) : (
        <>
          <Appear style={styles.hero}>
            <DocumentKindIcon kind={doc.kind} size={64} />
            <AppText variant="title" accessibilityRole="header">
              {doc.title}
            </AppText>
            <AppText color="textSecondary">
              {[
                t(`documents.kinds.${doc.kind}`),
                t('documents.pages', { count: doc.pageCount }),
                formatBytes(doc.sizeBytes, i18n.language),
              ].join(' · ')}
            </AppText>
            {readingProgress(doc) > 0 ? (
              <View style={styles.progress}>
                <ProgressBar progress={readingProgress(doc)} />
                <AppText variant="caption" color="textSecondary">
                  {t('documents.percentRead', { percent: Math.round(readingProgress(doc) * 100) })}
                </AppText>
              </View>
            ) : null}
          </Appear>

          <Appear index={1} style={styles.actions}>
            <Button
              testID="read"
              label={
                doc.lastPage && doc.lastPage > 1
                  ? t('document.resume', { page: doc.lastPage })
                  : t('document.read')
              }
              icon={<Icon name="book-open-page-variant-outline" size={20} color="onPrimary" />}
              onPress={() =>
                router.push({
                  pathname: '/documents/[id]/read',
                  params: { id, page: String(doc.lastPage ?? 1) },
                })
              }
            />
            <Button
              testID="ask"
              variant="secondary"
              label={t('document.askQuestions')}
              loading={openConversation.isPending}
              icon={<Icon name="chat-question-outline" size={20} color="text" />}
              onPress={() =>
                openConversation.mutate(id, {
                  onSuccess: (conversation) =>
                    router.push({ pathname: '/chat/[id]', params: { id: conversation.id } }),
                })
              }
            />
          </Appear>

          <Appear index={2}>
            <AppText variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
              {t('document.tools')}
            </AppText>
            <View style={styles.tools}>
              {tools.map((tool) => (
                <View key={tool} style={[styles.toolCell, toolWidth]}>
                  <Card
                    testID={`tool-${tool}`}
                    variant="filled"
                    style={styles.tool}
                    accessibilityLabel={t(`tools.${tool}`)}
                    onPress={() =>
                      router.push({ pathname: '/ai/[tool]', params: { tool, documentId: id } })
                    }
                  >
                    <Icon name={TOOL_ICONS[tool].icon} color={TOOL_ICONS[tool].color} />
                    <AppText variant="caption" numberOfLines={2}>
                      {t(`tools.${tool}`)}
                    </AppText>
                  </Card>
                </View>
              ))}
              <View style={[styles.toolCell, toolWidth]}>
                <Card
                  variant="filled"
                  style={styles.tool}
                  accessibilityLabel={t('document.makeQuiz')}
                  onPress={() => router.push({ pathname: '/study', params: { tab: 'quizzes' } })}
                >
                  <Icon name="head-question-outline" color="quizzes" />
                  <AppText variant="caption">{t('document.makeQuiz')}</AppText>
                </Card>
              </View>
              <View style={[styles.toolCell, toolWidth]}>
                <Card
                  variant="filled"
                  style={styles.tool}
                  accessibilityLabel={t('document.makeFlashcards')}
                  onPress={() =>
                    deck
                      ? router.push({ pathname: '/flashcards/review', params: { deckId: deck.id } })
                      : router.push({ pathname: '/study', params: { tab: 'flashcards' } })
                  }
                >
                  <Icon name="cards-outline" color="flashcards" />
                  <AppText variant="caption">{t('document.makeFlashcards')}</AppText>
                </Card>
              </View>
            </View>
          </Appear>

          <Appear index={3}>
            <Section title={t('document.bookmarks')}>
              {bookmarks.data?.length ? (
                bookmarks.data.map((bookmark) => (
                  <ListRow
                    key={bookmark.id}
                    icon="bookmark-outline"
                    label={t('document.page', { page: bookmark.page })}
                    {...(bookmark.label ? { value: bookmark.label } : {})}
                    onPress={() =>
                      router.push({
                        pathname: '/documents/[id]/read',
                        params: { id, page: String(bookmark.page) },
                      })
                    }
                  />
                ))
              ) : (
                <View style={styles.emptyBookmarks}>
                  <EmptyState icon="bookmark-outline" title={t('document.noBookmarks')} />
                </View>
              )}
            </Section>
          </Appear>
        </>
      )}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={doc?.title}
        actions={[
          {
            key: 'rename',
            icon: 'pencil-outline',
            label: t('common.rename'),
            onPress: () => setRenaming(true),
          },
          {
            key: 'delete',
            icon: 'delete-outline',
            label: t('common.delete'),
            destructive: true,
            onPress: confirmDelete,
          },
        ]}
      />
      <RenameSheet
        visible={renaming}
        title={t('documents.renameTitle')}
        initialTitle={doc?.title ?? ''}
        onClose={() => setRenaming(false)}
        onSubmit={(title) => rename.mutate({ id, title })}
      />
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    headerActions: { flexDirection: 'row' },
    skeleton: { gap: spacing.lg },
    hero: { gap: spacing.sm },
    progress: { gap: spacing.xs, marginTop: spacing.sm },
    actions: { gap: spacing.sm },
    sectionTitle: { marginBottom: spacing.sm },
    tools: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
    toolCell: { padding: spacing.xs },
    tool: { minHeight: 96, justifyContent: 'space-between' },
    emptyBookmarks: { paddingVertical: spacing.lg },
  });
