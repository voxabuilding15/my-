import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, RichText } from '@/shared/ui';

import type { ChatMessage } from '../../domain/chat';

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: Pick<ChatMessage, 'role' | 'content' | 'citations'>;
  streaming?: boolean;
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
        {message.citations.length ? (
          <View style={styles.citations}>
            {message.citations.map((page) => (
              <View key={page} style={styles.citation}>
                <AppText variant="label" color="chat">
                  {t('chat.sourcePage', { page })}
                </AppText>
              </View>
            ))}
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
    citations: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    citation: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
      backgroundColor: colors.chatSubtle,
    },
  });
