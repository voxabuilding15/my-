import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRelative } from '@/core/i18n/format';
import { useStyles, type Theme } from '@/core/theme';
import { AppText, Icon } from '@/shared/ui';

import type { Conversation } from '../../domain/chat';

type Props = { conversation: Conversation; onLongPress?: (conversation: Conversation) => void };

export function ConversationRow({ conversation, onLongPress }: Props) {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const title = conversation.title || conversation.documentTitle || t('chat.general');
  return (
    <Pressable
      testID={`conversation-${conversation.id}`}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })}
      onLongPress={onLongPress ? () => onLongPress(conversation) : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Icon name={conversation.documentId ? 'file-document-outline' : 'creation'} color="chat" />
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.fill}>
            {title}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {formatRelative(conversation.lastMessageAt, i18n.language)}
          </AppText>
        </View>
        {conversation.documentTitle ? (
          <AppText variant="caption" color="chat" numberOfLines={1}>
            {conversation.documentTitle}
          </AppText>
        ) : null}
        {conversation.preview ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {conversation.preview}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
      backgroundColor: colors.surfaceElevated,
    },
    pressed: { backgroundColor: colors.surface },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.chatSubtle,
    },
    text: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fill: { flex: 1 },
  });
