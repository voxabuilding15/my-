import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useLayout } from '@/core/layout/use-layout';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { useStyles, type Theme } from '@/core/theme';
import { useAuth, VerifyEmailBanner } from '@/features/auth';
import { ConversationRow, useConversations } from '@/features/chat';
import { DocumentCard, useDocuments } from '@/features/documents';
import { useDecks } from '@/features/flashcards';
import {
  AppText,
  Appear,
  Button,
  Card,
  Icon,
  IconButton,
  MockModeBanner,
  Screen,
} from '@/shared/ui';

import { ContinueCard, DueCardsCard, ProgressCard, QuickActions } from './components/home-cards';
import { useProgress } from './hooks/use-progress';

export function HomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const { columns } = useLayout();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const documents = useDocuments();
  const decks = useDecks();
  const progress = useProgress();
  const dailyGoal = usePreferencesStore((state) => state.dailyGoalMinutes);
  const conversations = useConversations();

  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const opened = documents.data
    ?.filter((d) => d.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''));
  const continueDocument = documents.data
    ? (opened?.find((d) => (d.lastPage ?? 0) < d.pageCount) ?? opened?.[0] ?? null)
    : undefined;
  const due = decks.data?.reduce((sum, deck) => sum + deck.dueCount + deck.newCount, 0);
  const recentDocuments = (opened ?? []).slice(0, 6);
  const recentChats = (conversations.data ?? []).slice(0, 3);
  const wide = columns > 1;

  const refresh = async () => {
    setRefreshing(true);
    await client.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <View style={styles.fill}>
          {firstName ? (
            <AppText color="textSecondary">{t('home.hello', { name: firstName })}</AppText>
          ) : null}
          <AppText variant="display" accessibilityRole="header">
            {t('home.greeting')}
          </AppText>
        </View>
        {progress.data ? (
          <View
            style={styles.streak}
            accessibilityLabel={t('home.streak', { count: progress.data.currentStreak })}
          >
            <Icon name="fire" size={20} color="streak" />
            <AppText variant="bodyStrong" color="streak">
              {progress.data.currentStreak}
            </AppText>
          </View>
        ) : null}
        <IconButton
          icon="cog-outline"
          accessibilityLabel={t('home.settings')}
          onPress={() => router.push('/settings')}
        />
      </View>

      <MockModeBanner />
      <VerifyEmailBanner />

      <View style={[styles.grid, wide && styles.gridWide]}>
        <Appear index={0} style={wide ? styles.half : undefined}>
          <ContinueCard document={continueDocument} />
        </Appear>
        <Appear index={1} style={wide ? styles.half : undefined}>
          <DueCardsCard due={due} />
        </Appear>
      </View>

      <Appear index={2}>
        <QuickActions />
      </Appear>

      <Appear index={3}>
        <ProgressCard
          progress={progress.data && { ...progress.data, dailyGoalMinutes: dailyGoal }}
        />
      </Appear>

      {recentDocuments.length > 0 ? (
        <Appear index={4} style={styles.section}>
          <SectionTitle
            title={t('home.recentDocuments')}
            onSeeAll={() => router.push('/documents')}
          />
          <View style={styles.cards}>
            {recentDocuments.slice(0, wide ? 6 : 3).map((document) => (
              <DocumentCard key={document.id} document={document} />
            ))}
          </View>
        </Appear>
      ) : null}

      {recentChats.length > 0 ? (
        <Appear index={5} style={styles.section}>
          <SectionTitle title={t('home.recentChats')} onSeeAll={() => router.push('/chat')} />
          <Card variant="outlined" style={styles.list}>
            {recentChats.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </Card>
        </Appear>
      ) : null}
    </Screen>
  );
}

function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" accessibilityRole="header" style={styles.fill}>
        {title}
      </AppText>
      <View>
        <Button variant="ghost" label={t('common.seeAll')} onPress={onSeeAll} />
      </View>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fill: { flex: 1 },
    streak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
      backgroundColor: colors.streakSubtle,
    },
    grid: { gap: spacing.lg },
    gridWide: { flexDirection: 'row', alignItems: 'stretch' },
    half: { flex: 1 },
    section: { gap: spacing.sm },
    sectionHeader: { flexDirection: 'row', alignItems: 'center' },
    cards: { gap: spacing.sm },
    list: { padding: 0, overflow: 'hidden', gap: 0 },
  });
