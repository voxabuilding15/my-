import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { DeckList } from '@/features/flashcards';
import { NotesList } from '@/features/notes';
import { QuizList } from '@/features/quizzes';
import { Chip, Screen, ScreenHeader, SegmentedControl } from '@/shared/ui';

type Tab = 'flashcards' | 'quizzes' | 'notes';
const TABS: Tab[] = ['flashcards', 'quizzes', 'notes'];

export function StudyScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [selected, setSelected] = useState<Tab>('flashcards');
  // Other screens deep-link to a tab (e.g. a document's "Quiz" tool); the route parameter wins.
  const tab: Tab =
    params.tab && (TABS as string[]).includes(params.tab) ? (params.tab as Tab) : selected;
  const setTab = (value: Tab) => {
    setSelected(value);
    if (params.tab) router.setParams({ tab: value });
  };

  return (
    <Screen scroll>
      <ScreenHeader title={t('study.title')} />
      <View style={styles.links}>
        <Chip
          icon="bookmark-outline"
          label={t('study.bookmarks')}
          onPress={() => router.push('/bookmarks')}
        />
        <Chip
          icon="translate"
          label={t('study.translator')}
          onPress={() => router.push('/translator')}
        />
      </View>
      <SegmentedControl<Tab>
        testID="study-tabs"
        value={tab}
        onChange={setTab}
        options={TABS.map((value) => ({ value, label: t(`study.${value}`) }))}
      />
      {tab === 'flashcards' ? <DeckList /> : tab === 'quizzes' ? <QuizList /> : <NotesList />}
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({ links: { flexDirection: 'row', gap: spacing.sm } });
