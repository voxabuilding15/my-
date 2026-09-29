import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useErrorMessage } from '@/core/i18n/error-message';
import { useLayout } from '@/core/layout/use-layout';
import { useStyles, useTheme, type Theme } from '@/core/theme';
import { AiUsageHint, AnswerLanguageButton, ReportAnswerSheet } from '@/features/ai-tools';
import { AppText, Chip, FormMessage, IconButton, Skeleton } from '@/shared/ui';

import { MessageBubble } from '../components/message-bubble';
import { TypingIndicator } from '../components/typing-indicator';
import { useConversations, useMessages, useSendMessage } from '../hooks/use-chat';

export function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { contentMaxWidth } = useLayout();
  const toMessage = useErrorMessage();
  const conversation = useConversations().data?.find((c) => c.id === id);
  const messages = useMessages(id);
  const { send, isSending, streaming, error } = useSendMessage(id);
  const [draft, setDraft] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages.data?.length, streaming]);

  const submit = (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    send(trimmed);
    setDraft('');
  };

  const title = conversation?.title || conversation?.documentTitle || t('chat.general');
  const suggestions = [t('chat.suggestion1'), t('chat.suggestion2'), t('chat.suggestion3')];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Stack.Screen options={{ title, headerRight: () => <AnswerLanguageButton /> }} />
      {/* Padding on both platforms: Android draws edge-to-edge, so the window no longer
          shrinks for the keyboard and the message bar ended up behind it. */}
      <KeyboardAvoidingView
        testID="chat-keyboard-avoider"
        style={styles.fill}
        behavior="padding"
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={[styles.thread, { maxWidth: contentMaxWidth }]}
        >
          {conversation?.documentTitle ? (
            <AppText variant="caption" color="chat" align="center">
              {t('chat.groundedIn', { title: conversation.documentTitle })}
            </AppText>
          ) : null}
          {messages.isPending ? <Skeleton height={80} radius={16} /> : null}
          {messages.data?.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              documentId={conversation?.documentId ?? null}
              onReport={
                message.role === 'assistant' && !message.id.startsWith('local-')
                  ? () => setReportId(message.id)
                  : undefined
              }
            />
          ))}
          {streaming !== null ? (
            streaming ? (
              <MessageBubble
                message={{ role: 'assistant', content: streaming, citations: [] }}
                streaming
              />
            ) : (
              <TypingIndicator label={t('chat.thinking')} />
            )
          ) : null}
          <FormMessage tone="error" message={toMessage(error)} />
          {messages.data?.length === 0 && streaming === null ? (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <Chip
                  key={suggestion}
                  icon="creation"
                  label={suggestion}
                  onPress={() => submit(suggestion)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.usage, { maxWidth: contentMaxWidth }]}>
          <AiUsageHint metric="chat_messages" />
        </View>
        <View style={[styles.composer, { maxWidth: contentMaxWidth }]}>
          <TextInput
            testID="chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('chat.inputPlaceholder')}
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <IconButton
            testID="send-message"
            icon="send"
            color={draft.trim() ? 'primaryText' : 'textDisabled'}
            accessibilityLabel={t('chat.send')}
            disabled={!draft.trim() || isSending}
            onPress={() => submit()}
          />
        </View>
      </KeyboardAvoidingView>
      <ReportAnswerSheet
        target={reportId ? { targetType: 'message', targetId: reportId } : null}
        onClose={() => setReportId(null)}
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, radii, spacing, typography }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    fill: { flex: 1 },
    thread: { width: '100%', alignSelf: 'center', padding: spacing.lg, gap: spacing.md },
    suggestions: { gap: spacing.sm, alignItems: 'flex-start' },
    usage: { width: '100%', alignSelf: 'center', paddingHorizontal: spacing.lg },
    composer: {
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      padding: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      ...typography.body,
      color: colors.text,
      maxHeight: 140,
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.xl,
      backgroundColor: colors.surfaceContainer,
      textAlign: 'auto',
    },
  });
