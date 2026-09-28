import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatBytes, formatRelative } from '@/core/i18n/format';
import { useStyles, type Theme } from '@/core/theme';
import { AppText, Card, Icon, IconButton, ProgressBar } from '@/shared/ui';

import { readingProgress, type DocumentSummary } from '../../domain/document';
import { DocumentKindIcon } from './document-kind';

type Props = { document: DocumentSummary; onMore?: (document: DocumentSummary) => void };

export function DocumentCard({ document, onMore }: Props) {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const progress = readingProgress(document);
  const meta = [
    t('documents.pages', { count: document.pageCount }),
    formatBytes(document.sizeBytes, i18n.language),
    document.lastOpenedAt ? formatRelative(document.lastOpenedAt, i18n.language) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card
      testID={`document-${document.id}`}
      variant="outlined"
      onPress={() => router.push({ pathname: '/documents/[id]', params: { id: document.id } })}
      accessibilityLabel={`${document.title}, ${meta}`}
      style={styles.card}
    >
      <View style={styles.row}>
        <DocumentKindIcon kind={document.kind} />
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={2} style={styles.title}>
              {document.title}
            </AppText>
            {document.isFavorite ? <Icon name="star" size={16} color="warning" /> : null}
          </View>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
          {progress > 0 ? <ProgressBar progress={progress} height={4} /> : null}
        </View>
        {onMore ? (
          <IconButton
            testID={`more-${document.id}`}
            icon="dots-vertical"
            color="textSecondary"
            accessibilityLabel={t('documents.more', { title: document.title })}
            onPress={() => onMore(document)}
          />
        ) : null}
      </View>
    </Card>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    card: { paddingVertical: spacing.md, paddingEnd: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    text: { flex: 1, gap: spacing.xs },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    title: { flex: 1 },
  });
