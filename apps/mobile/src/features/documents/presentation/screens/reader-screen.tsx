import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/core/layout/use-layout';
import { duration, useStyles, type Theme } from '@/core/theme';
import { useLogStudyTime } from '@/features/home';
import { AppText, Button, IconButton, ProgressBar, Skeleton, useSnackbar } from '@/shared/ui';

import {
  useBookmarks,
  useDocument,
  useDocumentMutations,
  useDocumentPages,
} from '../hooks/use-documents';

export function ReaderScreen() {
  const params = useLocalSearchParams<{ id: string; page?: string }>();
  const id = params.id;
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const { contentMaxWidth } = useLayout();
  const document = useDocument(id);
  const pages = useDocumentPages(id);
  const bookmarks = useBookmarks(id);
  const { toggleBookmark, recordProgress } = useDocumentMutations();
  const logStudyTime = useLogStudyTime();
  const [page, setPage] = useState(Math.max(1, Number(params.page) || 1));
  // Unknown until the document loads: navigation waits instead of clamping to a wrong total.
  const total = pages.data?.length ?? document.data?.pageCount;
  const current = pages.data?.[page - 1];
  const bookmarked = bookmarks.data?.some((b) => b.page === page) ?? false;

  useEffect(() => {
    recordProgress.mutate({ id, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- record once per page change
  }, [id, page]);

  // Reading counts toward the daily goal (timer starts on mount, logged on leave).
  useEffect(() => {
    const openedAt = Date.now();
    return () => logStudyTime(Math.round((Date.now() - openedAt) / 1000));
  }, [logStudyTime]);

  const go = (next: number) => total !== undefined && setPage(Math.min(total, Math.max(1, next)));
  const rtl = I18nManager.isRTL;
  const swipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((event) => {
      const forward = rtl ? event.translationX > 80 : event.translationX < -80;
      const backward = rtl ? event.translationX < -80 : event.translationX > 80;
      if (forward) runOnJS(go)(page + 1);
      else if (backward) runOnJS(go)(page - 1);
    });

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('document.page', { page }),
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                testID="bookmark-toggle"
                icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
                color={bookmarked ? 'primaryText' : 'text'}
                accessibilityLabel={
                  bookmarked ? t('document.bookmarkRemove') : t('document.bookmarkAdd')
                }
                onPress={() =>
                  toggleBookmark.mutate(
                    { id, page },
                    { onSuccess: (added) => added && snackbar(t('document.bookmarked')) },
                  )
                }
              />
              <IconButton
                icon="lightbulb-on-outline"
                accessibilityLabel={t('document.explainPage')}
                onPress={() =>
                  router.push({
                    pathname: '/ai/[tool]',
                    params: { tool: 'explain', documentId: id, page: String(page) },
                  })
                }
              />
            </View>
          ),
        }}
      />
      <ProgressBar
        progress={total ? page / total : 0}
        height={3}
        accessibilityLabel={t('document.page', { page })}
      />
      <GestureDetector gesture={swipe}>
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
          {document.data ? (
            <AppText variant="caption" color="textSecondary">
              {document.data.title}
            </AppText>
          ) : null}
          {current ? (
            <Animated.View key={page} entering={FadeIn.duration(duration.medium)}>
              <AppText testID="page-text" style={styles.text} selectable>
                {current.text}
              </AppText>
            </Animated.View>
          ) : (
            <View style={styles.skeleton}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={18} width={i === 4 ? '60%' : '100%'} />
              ))}
            </View>
          )}
        </ScrollView>
      </GestureDetector>
      <View style={styles.pager}>
        <IconButton
          testID="previous-page"
          icon={rtl ? 'chevron-right' : 'chevron-left'}
          variant="tonal"
          disabled={page <= 1}
          accessibilityLabel={t('document.previousPage')}
          onPress={() => go(page - 1)}
        />
        <AppText variant="bodyStrong" accessibilityLiveRegion="polite" testID="page-indicator">
          {total ? `${page} / ${total}` : `${page}`}
        </AppText>
        <IconButton
          testID="next-page"
          icon={rtl ? 'chevron-left' : 'chevron-right'}
          variant="tonal"
          disabled={total === undefined || page >= total}
          accessibilityLabel={t('document.nextPage')}
          onPress={() => go(page + 1)}
        />
      </View>
      {total !== undefined && page >= total ? (
        <View style={styles.finish}>
          <Button variant="ghost" label={t('common.done')} onPress={() => router.back()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    headerActions: { flexDirection: 'row' },
    content: { width: '100%', alignSelf: 'center', padding: spacing.xl, gap: spacing.lg },
    text: {
      ...typography.body,
      fontSize: 18,
      lineHeight: Math.round((typography.body.lineHeight ?? 24) * 1.25),
    },
    skeleton: { gap: spacing.md },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    finish: { paddingHorizontal: spacing.lg },
  });
