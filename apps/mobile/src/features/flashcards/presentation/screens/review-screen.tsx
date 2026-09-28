import { previewReview, scheduleReview, type Rating } from '@studexa/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useLayout } from '@/core/layout/use-layout';
import { useStyles, type ColorTokens, type Theme } from '@/core/theme';
import { useLogStudyTime } from '@/features/home';
import {
  AppText,
  Button,
  EmptyState,
  Icon,
  PressableScale,
  ProgressBar,
  Screen,
  Skeleton,
} from '@/shared/ui';

import { FlipCard } from '../components/flip-card';
import { useDueCards, useReviewCard } from '../hooks/use-flashcards';
import { useSwipeToRate } from '../hooks/use-swipe-to-rate';

const BUTTONS: {
  rating: Rating;
  label: 'dontKnow' | 'hard' | 'know' | 'easy';
  color: keyof ColorTokens;
}[] = [
  { rating: 1, label: 'dontKnow', color: 'danger' },
  { rating: 2, label: 'hard', color: 'warning' },
  { rating: 3, label: 'know', color: 'success' },
  { rating: 4, label: 'easy', color: 'primaryText' },
];

export function ReviewScreen() {
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { contentMaxWidth } = useLayout();
  const queue = useDueCards(deckId);
  const review = useReviewCard();
  const logStudyTime = useLogStudyTime();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Session clock: fixed when the session opens; interval previews are relative to it.
  const [sessionStart] = useState(() => new Date());
  const shownAt = useRef<number | null>(null);

  const cards = queue.data ?? [];
  const card = cards[index];
  const done = queue.data !== undefined && index >= cards.length;
  const preview = card ? previewReview(card.schedule, sessionStart) : null;

  const formatInterval = (rating: Rating) => {
    if (!preview) return '';
    const result = preview[rating];
    const minutes = Math.round((result.dueAt.getTime() - sessionStart.getTime()) / 60_000);
    return result.scheduledDays > 0
      ? t('flashcards.inDays', { count: result.scheduledDays })
      : t('flashcards.inMinutes', { count: Math.max(1, minutes) });
  };

  const answer = (rating: Rating) => {
    if (!card) return;
    const now = Date.now();
    review.mutate({
      cardId: card.id,
      rating,
      // Scheduled from the actual answer time, not the preview's session clock.
      result: scheduleReview(card.schedule, rating, new Date(now)),
      durationMs: now - (shownAt.current ?? sessionStart.getTime()),
    });
    setFlipped(false);
    shownAt.current = now;
    const next = index + 1;
    setIndex(next);
    if (next >= cards.length) logStudyTime(Math.round((now - sessionStart.getTime()) / 1000));
  };

  const swipe = useSwipeToRate(flipped, (rating) => answer(rating));

  if (queue.isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton height={320} radius={24} />
      </Screen>
    );
  }

  if (cards.length === 0 || done) {
    return (
      <Screen edges={['bottom']} contentStyle={styles.center}>
        <Stack.Screen options={{ title: t('study.flashcards') }} />
        <EmptyState
          icon={cards.length ? 'party-popper' : 'check-circle-outline'}
          title={cards.length ? t('flashcards.doneTitle') : t('flashcards.nothingDue')}
          {...(cards.length ? { message: t('flashcards.doneBody', { count: cards.length }) } : {})}
        />
        <Button testID="review-done" label={t('common.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      edges={['bottom']}
      contentStyle={[styles.screen, { maxWidth: Math.min(contentMaxWidth, 640) }]}
    >
      <Stack.Screen
        options={{ title: t('flashcards.progress', { done: index + 1, total: cards.length }) }}
      />
      <ProgressBar
        progress={index / cards.length}
        color="flashcards"
        accessibilityLabel={t('flashcards.progress', { done: index, total: cards.length })}
      />

      <GestureDetector gesture={swipe.gesture}>
        <Animated.View style={[styles.cardArea, swipe.style]}>
          <PressableScale
            testID="flip-card"
            style={styles.fill}
            accessibilityRole="button"
            accessibilityLabel={
              flipped ? card!.back : `${card!.front}. ${t('flashcards.showAnswer')}`
            }
            pressedScale={0.99}
            onPress={() => setFlipped((value) => !value)}
          >
            <FlipCard
              front={card!.front}
              back={card!.back}
              flipped={flipped}
              frontLabel={t('flashcards.card')}
              backLabel={t('flashcards.answer')}
            />
          </PressableScale>
        </Animated.View>
      </GestureDetector>

      {flipped ? (
        <View style={styles.answers}>
          {BUTTONS.map((button) => (
            <PressableScale
              key={button.rating}
              testID={`rate-${button.rating}`}
              accessibilityRole="button"
              accessibilityLabel={`${t(`flashcards.${button.label}`)}, ${formatInterval(button.rating)}`}
              onPress={() => answer(button.rating)}
              style={styles.answer}
            >
              <AppText variant="label" color={button.color} align="center">
                {t(`flashcards.${button.label}`)}
              </AppText>
              <AppText variant="caption" color="textSecondary" align="center">
                {formatInterval(button.rating)}
              </AppText>
            </PressableScale>
          ))}
        </View>
      ) : (
        <View style={styles.answers}>
          <View style={styles.fill}>
            <Button
              testID="show-answer"
              label={t('flashcards.showAnswer')}
              icon={<Icon name="rotate-3d-variant" size={20} color="onPrimary" />}
              onPress={() => setFlipped(true)}
            />
          </View>
        </View>
      )}
      <AppText variant="caption" color="textSecondary" align="center">
        {t('flashcards.swipeHint')}
      </AppText>
    </Screen>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    screen: { flex: 1 },
    center: { justifyContent: 'center' },
    fill: { flex: 1 },
    cardArea: { flex: 1 },
    answers: { flexDirection: 'row', gap: spacing.sm },
    answer: {
      flex: 1,
      minHeight: 64,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
