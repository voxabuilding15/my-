import type { PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, usePrefersReducedMotion } from '@/core/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = PropsWithChildren<
  Omit<PressableProps, 'style' | 'children'> & {
    style?: StyleProp<ViewStyle>;
    pressedScale?: number;
  }
>;

/** Pressable with Material-style press feedback (subtle scale); static when reduce motion is on. */
export function PressableScale({
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = usePrefersReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (value: number) => {
    if (!reduceMotion)
      scale.set(withTiming(value, { duration: duration.short, easing: easing.standard }));
  };
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        to(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        to(1);
        onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
}
