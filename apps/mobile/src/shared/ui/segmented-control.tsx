import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { duration, easing, useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

/** Segmented tabs with a sliding indicator (follows layout direction). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const styles = useStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const segment = width / options.length;

  const indicator = useAnimatedStyle(() => ({
    width: segment,
    transform: [
      {
        translateX: withTiming(index * segment, {
          duration: duration.medium,
          easing: easing.standard,
        }),
      },
    ],
  }));

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={styles.track}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - 8)}
    >
      {width > 0 ? <Animated.View style={[styles.indicator, indicator]} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.segment}
          >
            <AppText variant="label" color={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, radii, elevation }: Theme) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceContainer,
    },
    indicator: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      start: 4,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceElevated,
      ...elevation.level1,
    },
    segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  });
