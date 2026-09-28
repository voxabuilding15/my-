import { useEffect } from 'react';
import { type DimensionValue, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { usePrefersReducedMotion, useStyles, type Theme } from '@/core/theme';

type SkeletonProps = { width?: DimensionValue; height?: number; radius?: number };

/** Loading placeholder with a gentle pulse (static when reduce motion is on). */
export function Skeleton({ width = '100%', height = 16, radius = 8 }: SkeletonProps) {
  const styles = useStyles(makeStyles);
  const reduceMotion = usePrefersReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!reduceMotion) opacity.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
  }, [opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: radius }, animated]}
    />
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({ block: { backgroundColor: colors.surfaceContainer } });
