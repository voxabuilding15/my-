import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { usePrefersReducedMotion, useStyles, type Theme } from '@/core/theme';

function Dot({ index }: { index: number }) {
  const styles = useStyles(makeStyles);
  const reduceMotion = usePrefersReducedMotion();
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    if (!reduceMotion) {
      opacity.set(
        withDelay(
          index * 160,
          withRepeat(
            withSequence(withTiming(1, { duration: 320 }), withTiming(0.3, { duration: 320 })),
            -1,
          ),
        ),
      );
    }
  }, [index, opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, animated]} />;
}

export function TypingIndicator({ label }: { label: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.bubble} accessibilityLabel={label} accessibilityLiveRegion="polite">
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} />
      ))}
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    bubble: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary },
  });
