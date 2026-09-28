import { TRANSLATION_LANGUAGES, type TranslationLanguage } from '@studexa/shared';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, useTheme, type Theme } from '@/core/theme';
import {
  AppText,
  BottomSheet,
  Button,
  Card,
  FormMessage,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  useSnackbar,
} from '@/shared/ui';

import { useTranslate } from '../hooks/use-ai-tool';
import { useSpeech } from '../hooks/use-speech';

type Source = TranslationLanguage | 'auto';
const LANGUAGE_CODES = Object.keys(TRANSLATION_LANGUAGES) as TranslationLanguage[];

function LanguageButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.languageButton}
    >
      <AppText variant="bodyStrong" numberOfLines={1} style={styles.fill}>
        {label}
      </AppText>
      <Icon name="chevron-down" size={20} color="textSecondary" />
    </Pressable>
  );
}

export function TranslatorScreen() {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const toMessage = useErrorMessage();
  const translate = useTranslate();
  const speech = useSpeech();
  const [from, setFrom] = useState<Source>('auto');
  const [to, setTo] = useState<TranslationLanguage>(i18n.language === 'ar' ? 'en' : 'ar');
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const swap = () => {
    if (from === 'auto') return;
    setFrom(to);
    setTo(from);
  };

  return (
    <Screen keyboard edges={['bottom']}>
      <ScreenHeader title={t('translator.title')} />
      <View style={styles.languages}>
        <LanguageButton
          testID="from-language"
          label={from === 'auto' ? t('translator.detect') : TRANSLATION_LANGUAGES[from]}
          onPress={() => setPicking('from')}
        />
        <IconButton
          icon="swap-horizontal"
          accessibilityLabel={t('translator.swap')}
          disabled={from === 'auto'}
          onPress={swap}
        />
        <LanguageButton
          testID="to-language"
          label={TRANSLATION_LANGUAGES[to]}
          onPress={() => setPicking('to')}
        />
      </View>
      <Card variant="outlined">
        <TextInput
          testID="translator-input"
          value={text}
          onChangeText={setText}
          placeholder={t('translator.inputPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('translator.inputPlaceholder')}
          multiline
          maxLength={5000}
          style={styles.input}
        />
      </Card>
      <Button
        testID="translate"
        label={t('translator.translate')}
        disabled={!text.trim()}
        loading={translate.isPending}
        onPress={() => translate.mutate({ text: text.trim(), from, to })}
      />
      <FormMessage tone="error" message={toMessage(translate.error)} />
      {translate.data ? (
        <Card variant="filled" testID="translation">
          <AppText selectable>{translate.data}</AppText>
          <View style={styles.row}>
            <IconButton
              icon={speech.speaking ? 'stop' : 'volume-high'}
              accessibilityLabel={t('translator.listen')}
              onPress={() => (speech.speaking ? speech.stop() : speech.speak(translate.data, to))}
            />
            <IconButton
              icon="content-copy"
              accessibilityLabel={t('common.copy')}
              onPress={async () => {
                await Clipboard.setStringAsync(translate.data);
                snackbar(t('common.copied'));
              }}
            />
          </View>
        </Card>
      ) : null}

      <BottomSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={t('translator.chooseLanguage')}
      >
        <ScrollView style={styles.picker}>
          {picking === 'from' ? (
            <Pressable
              accessibilityRole="button"
              style={styles.option}
              onPress={() => {
                setFrom('auto');
                setPicking(null);
              }}
            >
              <AppText>{t('translator.detect')}</AppText>
            </Pressable>
          ) : null}
          {LANGUAGE_CODES.map((code) => (
            <Pressable
              key={code}
              testID={`language-${code}`}
              accessibilityRole="button"
              accessibilityState={{ selected: (picking === 'from' ? from : to) === code }}
              style={styles.option}
              onPress={() => {
                if (picking === 'from') setFrom(code);
                else setTo(code);
                setPicking(null);
              }}
            >
              <AppText>{TRANSLATION_LANGUAGES[code]}</AppText>
              {(picking === 'from' ? from : to) === code ? (
                <Icon name="check" color="primaryText" />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const makeStyles = ({ colors, radii, spacing, typography }: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    languages: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    languageButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceContainer,
    },
    input: {
      ...typography.body,
      color: colors.text,
      minHeight: 140,
      textAlignVertical: 'top',
      textAlign: 'auto',
    },
    row: { flexDirection: 'row', justifyContent: 'flex-end' },
    picker: { maxHeight: 420 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: spacing.sm,
    },
  });
