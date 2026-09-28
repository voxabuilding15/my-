import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, useStyles, useTheme, type ColorTokens, type Theme } from '@/core/theme';

type ProgressBarProps = {
  progress: number;
  color?: keyof ColorTokens;
  height?: number;
  accessibilityLabel?: string;
};

export function ProgressBar({
  progress,
  color = 'primary',
  height = 8,
  accessibilityLabel,
}: ProgressBarProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  const value = useSharedValue(0);

  useEffect(() => {
    value.set(
      withTiming(clamped, {
        duration: duration.long,
        easing: easing.emphasizedDecelerate,
      }),
    );
  }, [clamped, value]);

  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: colors[color], borderRadius: height / 2 }, fill]}
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    track: { width: '100%', backgroundColor: colors.surfaceContainer, overflow: 'hidden' },
    fill: { height: '100%' },
  });
