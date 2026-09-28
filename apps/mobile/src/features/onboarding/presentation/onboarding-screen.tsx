import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { usePreferencesStore } from '@/core/storage/preferences-store';
import { duration, easing, usePrefersReducedMotion, useStyles, type Theme } from '@/core/theme';
import { AppText, Button, Screen } from '@/shared/ui';

import { OnboardingIllustration, type IllustrationSpec } from './onboarding-illustration';

const SLIDES: {
  title: 'slide1Title' | 'slide2Title' | 'slide3Title';
  body: 'slide1Body' | 'slide2Body' | 'slide3Body';
  art: IllustrationSpec;
}[] = [
  {
    title: 'slide1Title',
    body: 'slide1Body',
    art: {
      icon: 'file-document-multiple-outline',
      color: 'primaryText',
      surface: 'primarySubtle',
      satellites: [
        { icon: 'camera-outline', color: 'chat', top: 18, start: 10 },
        { icon: 'file-pdf-box', color: 'danger', top: 190, start: 196 },
        { icon: 'file-word-box', color: 'primaryText', top: 30, start: 200 },
      ],
    },
  },
  {
    title: 'slide2Title',
    body: 'slide2Body',
    art: {
      icon: 'creation',
      color: 'chat',
      surface: 'chatSubtle',
      satellites: [
        { icon: 'chat-processing-outline', color: 'chat', top: 24, start: 12 },
        { icon: 'lightbulb-on-outline', color: 'warning', top: 186, start: 20 },
        { icon: 'translate', color: 'quizzes', top: 40, start: 198 },
      ],
    },
  },
  {
    title: 'slide3Title',
    body: 'slide3Body',
    art: {
      icon: 'cards-outline',
      color: 'flashcards',
      surface: 'flashcardsSubtle',
      satellites: [
        { icon: 'fire', color: 'streak', top: 20, start: 16 },
        { icon: 'check-decagram', color: 'success', top: 192, start: 190 },
        { icon: 'trophy-outline', color: 'quizzes', top: 36, start: 196 },
      ],
    },
  },
];

function Dot({ active }: { active: boolean }) {
  const styles = useStyles(makeStyles);
  const animated = useAnimatedStyle(() => ({
    width: withTiming(active ? 24 : 8, { duration: duration.medium, easing: easing.standard }),
  }));
  return <Animated.View style={[styles.dot, active && styles.dotActive, animated]} />;
}

export function OnboardingScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const reduceMotion = usePrefersReducedMotion();
  const complete = usePreferencesStore((state) => state.completeOnboarding);
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index] ?? SLIDES[0]!;

  const go = (next: number) => {
    if (next < 0 || next >= SLIDES.length) return;
    setForward(next > index);
    setIndex(next);
  };

  // Swiping toward the reading direction's start goes forward (right-to-left in LTR, left-to-right in RTL).
  const rtl = I18nManager.isRTL;
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      const towardStart = rtl ? event.translationX > 60 : event.translationX < -60;
      const towardEnd = rtl ? event.translationX < -60 : event.translationX > 60;
      if (towardStart) runOnJS(go)(index + 1);
      else if (towardEnd) runOnJS(go)(index - 1);
    });

  const enterFromEnd = rtl ? SlideInLeft : SlideInRight;
  const enterFromStart = rtl ? SlideInRight : SlideInLeft;
  const entering = reduceMotion
    ? FadeIn.duration(duration.short)
    : (forward ? enterFromEnd : enterFromStart)
        .duration(duration.long)
        .easing(easing.emphasizedDecelerate);

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.screen}>
      <View style={styles.topBar}>
        {last ? null : (
          <Button
            testID="onboarding-skip"
            variant="ghost"
            label={t('onboarding.skip')}
            onPress={complete}
          />
        )}
      </View>

      <GestureDetector gesture={swipe}>
        <View style={styles.stage}>
          <Animated.View
            key={index}
            entering={entering}
            exiting={FadeOut.duration(duration.short)}
            style={styles.slide}
          >
            <OnboardingIllustration spec={slide.art} />
            <View style={styles.copy}>
              <AppText variant="display" align="center" accessibilityRole="header">
                {t(`onboarding.${slide.title}`)}
              </AppText>
              <AppText color="textSecondary" align="center">
                {t(`onboarding.${slide.body}`)}
              </AppText>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityRole="adjustable"
          accessibilityLabel={`${index + 1} / ${SLIDES.length}`}
        >
          {SLIDES.map((item, i) => (
            <Dot key={item.title} active={i === index} />
          ))}
        </View>
        <Button
          testID="onboarding-next"
          label={last ? t('onboarding.getStarted') : t('onboarding.next')}
          onPress={() => (last ? complete() : go(index + 1))}
        />
      </View>
    </Screen>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    screen: { justifyContent: 'space-between' },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 52 },
    stage: { flex: 1, justifyContent: 'center' },
    slide: { gap: spacing.xxl },
    copy: { gap: spacing.md, paddingHorizontal: spacing.md },
    footer: { gap: spacing.xl },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
    dot: { height: 8, borderRadius: radii.full, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primary },
  });
