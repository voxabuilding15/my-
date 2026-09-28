import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { CitationChips } from '@/features/ai-tools';
import { AppText, IconButton, RichText } from '@/shared/ui';

import type { ChatMessage } from '../../domain/chat';

export function MessageBubble({
  message,
  streaming = false,
  documentId = null,
  onReport,
}: {
  message: Pick<ChatMessage, 'role' | 'content' | 'citations'>;
  streaming?: boolean;
  documentId?: string | null;
  /** Shown on stored assistant answers. */
  onReport?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const mine = message.role === 'user';
  return (
    <View style={[styles.row, mine ? styles.mine : styles.theirs]}>
      <View style={[styles.bubble, mine ? styles.userBubble : styles.aiBubble]}>
        {mine ? (
          <AppText color="onPrimary">{message.content}</AppText>
        ) : (
          <RichText markdown={message.content || ' '} />
        )}
        {streaming ? <AppText color="textSecondary">▍</AppText> : null}
        {!mine && !streaming ? (
          <View style={styles.footer}>
            <View style={styles.fill}>
              <CitationChips citations={message.citations} documentId={documentId} />
            </View>
            {onReport ? (
              <IconButton
                icon="flag-outline"
                size={18}
                color="textSecondary"
                accessibilityLabel={t('ai.report.action')}
                onPress={onReport}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row' },
    mine: { justifyContent: 'flex-end' },
    theirs: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '88%',
      borderRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    userBubble: { backgroundColor: colors.primary, borderBottomEndRadius: radii.sm / 2 },
    aiBubble: { backgroundColor: colors.surface, borderBottomStartRadius: radii.sm / 2 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    fill: { flex: 1 },
  });
