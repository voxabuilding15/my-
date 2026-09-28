import type { Citation } from '@studexa/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Chip } from '@/shared/ui';

import { citedPages } from '../../domain/ai-tools';

/** "Sources: p. 2 · p. 5" — each chip opens the reader at that page. */
export function CitationChips({
  citations,
  documentId,
}: {
  citations: readonly Citation[];
  documentId: string | null;
}) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const pages = citedPages(citations);
  if (pages.length === 0) return null;
  return (
    <View style={styles.row} testID="citations">
      <AppText variant="label" color="textSecondary">
        {t('ai.sources')}
      </AppText>
      {pages.map((page) => (
        <Chip
          key={page}
          icon="file-document-outline"
          label={t('chat.sourcePage', { page })}
          {...(documentId
            ? {
                onPress: () =>
                  router.push({
                    pathname: '/documents/[id]/read',
                    params: { id: documentId, page: String(page) },
                  }),
              }
            : {})}
        />
      ))}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  });
