import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing, usePrefersReducedMotion, useStyles, type Theme } from '@/core/theme';
import { AppText } from '@/shared/ui';

type FlipCardProps = {
  front: string;
  back: string;
  flipped: boolean;
  frontLabel: string;
  backLabel: string;
};

/** Two-sided card with a 3D flip (cross-fade when reduce motion is on). */
export function FlipCard({ front, back, flipped, frontLabel, backLabel }: FlipCardProps) {
  const styles = useStyles(makeStyles);
  const reduceMotion = usePrefersReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.set(
      withTiming(flipped ? 180 : 0, {
        duration: reduceMotion ? 0 : duration.long,
        easing: easing.standard,
      }),
    );
  }, [flipped, reduceMotion, rotation]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.value}deg` }],
    opacity: interpolate(rotation.value, [89, 90], [1, 0], 'clamp'),
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.value - 180}deg` }],
    opacity: interpolate(rotation.value, [90, 91], [0, 1], 'clamp'),
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.face, frontStyle]}
        accessibilityElementsHidden={flipped}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
      >
        <AppText variant="label" color="textSecondary">
          {frontLabel.toUpperCase()}
        </AppText>
        <AppText variant="title" align="center" testID="card-front">
          {front}
        </AppText>
      </Animated.View>
      <Animated.View
        style={[styles.face, styles.back, backStyle]}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
      >
        <AppText variant="label" color="flashcards">
          {backLabel.toUpperCase()}
        </AppText>
        <AppText variant="heading" align="center" testID="card-back">
          {back}
        </AppText>
      </Animated.View>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing, elevation }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, minHeight: 280 },
    face: {
      ...StyleSheet.absoluteFill,
      borderRadius: radii.xl,
      padding: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      backfaceVisibility: 'hidden',
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...elevation.level2,
    },
    back: { backgroundColor: colors.flashcardsSubtle, borderColor: colors.flashcardsSubtle },
  });
