import { TRANSLATION_LANGUAGES, type TranslationLanguage } from '@studexa/shared';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAnswerLanguage } from '@/core/ai';
import { env } from '@/core/config/env';
import { useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, type Theme } from '@/core/theme';
import { useSaveNote } from '@/features/notes';
import {
  AppText,
  Button,
  Card,
  Chip,
  FormMessage,
  Icon,
  IconButton,
  RichText,
  Screen,
  Skeleton,
  useSnackbar,
} from '@/shared/ui';

import { DOCUMENT_TOOLS, type DocumentTool } from '../../domain/ai-tools';
import { AiUsageHint } from '../components/ai-usage-hint';
import { AnswerLanguageButton } from '../components/answer-language-button';
import { CitationChips } from '../components/citation-chips';
import { ReportAnswerSheet } from '../components/report-answer-sheet';
import { useAiTool } from '../hooks/use-ai-tool';
import { useSpeech } from '../hooks/use-speech';

const QUICK_LANGUAGES: TranslationLanguage[] = ['en', 'ar', 'fr', 'es', 'de', 'ja', 'zh'];

export function AiToolScreen() {
  const params = useLocalSearchParams<{ tool: string; documentId: string; page?: string }>();
  const tool: DocumentTool = (DOCUMENT_TOOLS as readonly string[]).includes(params.tool)
    ? (params.tool as DocumentTool)
    : 'summarize';
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const toMessage = useErrorMessage();
  const ai = useAiTool();
  const speech = useSpeech();
  const saveNote = useSaveNote();
  const [answerLanguage] = useAnswerLanguage();
  const [language, setLanguage] = useState<TranslationLanguage>(
    i18n.language === 'en' ? 'fr' : 'en',
  );
  const [reporting, setReporting] = useState(false);

  const run = (regenerate = false, target: TranslationLanguage = language) =>
    ai.run({
      action: tool,
      documentId: params.documentId,
      language: answerLanguage,
      ...(params.page ? { page: Number(params.page) } : {}),
      ...(tool === 'translate' ? { targetLanguage: target } : {}),
      ...(regenerate ? { regenerate } : {}),
    });

  // Runs on open, and again when the answer language changes.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only for a new answer language
  }, [answerLanguage]);

  return (
    <Screen edges={['bottom']} contentStyle={styles.screen}>
      <Stack.Screen
        options={{
          title: t(`tools.${tool}`),
          ...(tool === 'translate' ? {} : { headerRight: () => <AnswerLanguageButton /> }),
        }}
      />
      {tool === 'translate' ? (
        <View style={styles.languages}>
          <AppText variant="label" color="textSecondary">
            {t('tools.translateTo').toUpperCase()}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {QUICK_LANGUAGES.map((code) => (
              <Chip
                key={code}
                label={TRANSLATION_LANGUAGES[code]}
                selected={code === language}
                onPress={() => {
                  setLanguage(code);
                  run(false, code);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView style={styles.fill} contentContainerStyle={styles.result}>
        <FormMessage tone="error" message={toMessage(ai.error)} />
        {ai.text ? (
          <Card variant="outlined" testID="ai-result">
            <RichText markdown={ai.text} />
            {ai.isRunning ? <AppText color="textSecondary">▍</AppText> : null}
          </Card>
        ) : ai.isRunning ? (
          <Card variant="filled" style={styles.loading}>
            <View style={styles.row}>
              <Icon name="creation" color="primaryText" />
              <AppText color="textSecondary" accessibilityLiveRegion="polite">
                {t('tools.generating')}
              </AppText>
            </View>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={16} width={i === 3 ? '55%' : '100%'} />
            ))}
          </Card>
        ) : null}
        {ai.result ? (
          <View style={styles.meta}>
            <CitationChips citations={ai.result.citations} documentId={params.documentId} />
            {ai.result.coveredUntilPage ? (
              <AppText variant="caption" color="textSecondary">
                {t('ai.coveredUntil', { page: ai.result.coveredUntilPage })}
              </AppText>
            ) : null}
            <View style={styles.row}>
              <AppText variant="caption" color="textSecondary" style={styles.fill}>
                {env.useMocks ? t('tools.sample') : ai.result.cached ? t('ai.stored') : ''}
              </AppText>
              {ai.result.outputId ? (
                <IconButton
                  testID="report-answer"
                  icon="flag-outline"
                  size={20}
                  color="textSecondary"
                  accessibilityLabel={t('ai.report.action')}
                  onPress={() => setReporting(true)}
                />
              ) : null}
            </View>
          </View>
        ) : null}
        <AiUsageHint />
      </ScrollView>

      {ai.isDone ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={speech.speaking ? t('tools.stopReading') : t('tools.readAloud')}
            icon={<Icon name={speech.speaking ? 'stop' : 'volume-high'} size={20} />}
            onPress={() =>
              speech.speaking
                ? speech.stop()
                : speech.speak(ai.text, tool === 'translate' ? language : undefined)
            }
          />
          <View style={styles.row}>
            <View style={styles.fill}>
              <Button
                variant="secondary"
                label={t('common.copy')}
                onPress={async () => {
                  await Clipboard.setStringAsync(ai.text);
                  snackbar(t('common.copied'));
                }}
              />
            </View>
            <View style={styles.fill}>
              <Button
                testID="save-note"
                variant="secondary"
                label={t('tools.saveAsNote')}
                loading={saveNote.isPending}
                onPress={() =>
                  saveNote.mutate(
                    {
                      title: t(`tools.${tool}`),
                      content: ai.text,
                      isPinned: false,
                      documentId: params.documentId,
                    },
                    { onSuccess: () => snackbar(t('tools.savedAsNote')) },
                  )
                }
              />
            </View>
          </View>
          <Button variant="ghost" label={t('tools.regenerate')} onPress={() => run(true)} />
        </View>
      ) : null}
      <ReportAnswerSheet
        target={
          reporting && ai.result?.outputId
            ? { targetType: 'ai_output', targetId: ai.result.outputId }
            : null
        }
        onClose={() => setReporting(false)}
      />
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    screen: { paddingBottom: spacing.sm },
    fill: { flex: 1 },
    languages: { gap: spacing.sm },
    chips: { gap: spacing.sm },
    result: { gap: spacing.md, paddingBottom: spacing.lg },
    loading: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    actions: { gap: spacing.sm },
    meta: { gap: spacing.sm },
  });
