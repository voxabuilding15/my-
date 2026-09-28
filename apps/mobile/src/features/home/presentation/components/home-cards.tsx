import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import {
  AppText,
  Button,
  Card,
  Icon,
  ProgressBar,
  ProgressRing,
  Skeleton,
  type IconName,
} from '@/shared/ui';

import { readingProgress, type DocumentSummary } from '@/features/documents';
import type { StudyProgress } from '../../domain/progress';
import { WeekChart } from './week-chart';

export function ContinueCard({ document }: { document: DocumentSummary | null | undefined }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  if (document === undefined) return <CardSkeleton />;
  if (!document) {
    return (
      <Card variant="filled" style={styles.hero}>
        <Icon name="file-document-plus-outline" size={32} color="primaryText" />
        <AppText variant="heading">{t('home.continueLearning')}</AppText>
        <AppText color="textSecondary">{t('home.startFirst')}</AppText>
        <Button
          label={t('home.addDocument')}
          onPress={() => router.push({ pathname: '/documents', params: { add: '1' } })}
        />
      </Card>
    );
  }
  const page = document.lastPage ?? 1;
  return (
    <Card variant="elevated" style={styles.hero} testID="continue-card">
      <AppText variant="label" color="primaryText">
        {t('home.continueLearning').toUpperCase()}
      </AppText>
      <AppText variant="heading" numberOfLines={2}>
        {document.title}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {t('home.pageOf', { page, total: document.pageCount })}
      </AppText>
      <ProgressBar
        progress={readingProgress(document)}
        accessibilityLabel={t('documents.percentRead', {
          percent: Math.round(readingProgress(document) * 100),
        })}
      />
      <Button
        testID="continue-reading"
        label={t('home.continueReading')}
        icon={<Icon name="book-open-page-variant-outline" size={20} color="onPrimary" />}
        onPress={() =>
          router.push({
            pathname: '/documents/[id]/read',
            params: { id: document.id, page: String(page) },
          })
        }
      />
    </Card>
  );
}

export function DueCardsCard({ due }: { due: number | undefined }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  if (due === undefined) return <CardSkeleton />;
  return (
    <Card variant="filled" style={[styles.tile, styles.flashcards]}>
      <View style={styles.row}>
        <View style={[styles.iconBadge, styles.flashcardsBadge]}>
          <Icon name="cards-outline" color="flashcards" />
        </View>
        <View style={styles.fill}>
          <AppText variant="heading" testID="due-count">
            {due > 0 ? t('home.cardsDue', { count: due }) : t('home.allCaughtUp')}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {t('study.flashcards')}
          </AppText>
        </View>
      </View>
      {due > 0 ? (
        <Button
          testID="review-now"
          variant="secondary"
          label={t('home.reviewNow')}
          onPress={() => router.push('/flashcards/review')}
        />
      ) : null}
    </Card>
  );
}

export function ProgressCard({ progress }: { progress: StudyProgress | undefined }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  if (!progress) return <CardSkeleton tall />;
  const goalProgress = progress.todayMinutes / progress.dailyGoalMinutes;
  return (
    <Card variant="outlined">
      <AppText variant="heading" accessibilityRole="header">
        {t('home.yourProgress')}
      </AppText>
      <View style={styles.row}>
        <ProgressRing
          progress={goalProgress}
          size={84}
          color={goalProgress >= 1 ? 'success' : 'primary'}
          accessibilityLabel={t('home.todayGoal', {
            minutes: progress.todayMinutes,
            goal: progress.dailyGoalMinutes,
          })}
        >
          <AppText variant="bodyStrong">{progress.todayMinutes}</AppText>
          <AppText variant="label" color="textSecondary">
            / {progress.dailyGoalMinutes}
          </AppText>
        </ProgressRing>
        <View style={[styles.fill, styles.stats]}>
          <View style={styles.row}>
            <Icon name="fire" color="streak" />
            <AppText variant="bodyStrong" color="streak">
              {t('home.streak', { count: progress.currentStreak })}
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary">
            {goalProgress >= 1
              ? t('home.goalReached')
              : t('home.todayGoal', {
                  minutes: progress.todayMinutes,
                  goal: progress.dailyGoalMinutes,
                })}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {t('home.bestStreak', { count: progress.longestStreak })}
          </AppText>
        </View>
      </View>
      <AppText variant="label" color="textSecondary">
        {t('home.thisWeek').toUpperCase()}
      </AppText>
      <WeekChart
        minutes={progress.weekMinutes}
        goal={progress.dailyGoalMinutes}
        today={new Date()}
      />
    </Card>
  );
}

type QuickAction = { key: string; icon: IconName; label: string; onPress: () => void };

export function QuickActions() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const actions: QuickAction[] = [
    {
      key: 'scan',
      icon: 'camera-outline',
      label: t('home.quickScan'),
      onPress: () => router.push({ pathname: '/documents', params: { add: 'camera' } }),
    },
    {
      key: 'upload',
      icon: 'upload-outline',
      label: t('home.quickUpload'),
      onPress: () => router.push({ pathname: '/documents', params: { add: '1' } }),
    },
    {
      key: 'translate',
      icon: 'translate',
      label: t('home.quickTranslate'),
      onPress: () => router.push('/translator'),
    },
    {
      key: 'note',
      icon: 'note-plus-outline',
      label: t('home.quickNote'),
      onPress: () => router.push({ pathname: '/notes/[id]', params: { id: 'new' } }),
    },
  ];
  return (
    <View style={styles.quickRow} accessibilityLabel={t('home.quickActions')}>
      {actions.map((action) => (
        <Card
          key={action.key}
          variant="filled"
          style={styles.quick}
          onPress={action.onPress}
          accessibilityLabel={action.label}
          testID={`quick-${action.key}`}
        >
          <Icon name={action.icon} color="primaryText" />
          <AppText variant="caption" align="center" numberOfLines={1}>
            {action.label}
          </AppText>
        </Card>
      ))}
    </View>
  );
}

function CardSkeleton({ tall = false }: { tall?: boolean }) {
  const styles = useStyles(makeStyles);
  return (
    <Card variant="filled" style={styles.skeleton}>
      <Skeleton width="40%" height={14} />
      <Skeleton width="80%" height={20} />
      <Skeleton height={tall ? 120 : 44} radius={12} />
    </Card>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    hero: { gap: spacing.md },
    tile: { gap: spacing.md, justifyContent: 'space-between' },
    flashcards: { backgroundColor: colors.flashcardsSubtle },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    fill: { flex: 1 },
    stats: { gap: spacing.xs },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flashcardsBadge: { backgroundColor: colors.surfaceElevated },
    quickRow: { flexDirection: 'row', gap: spacing.sm },
    quick: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.md,
      gap: spacing.xs,
    },
    skeleton: { gap: spacing.md },
  });
