import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { duration, easing, usePrefersReducedMotion } from '@/core/theme';

type AppearProps = PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>;

/** Staggered fade-and-rise entrance for list and dashboard sections. */
export function Appear({ index = 0, style, children }: AppearProps) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <Animated.View
      style={style}
      {...(reduceMotion
        ? {}
        : {
            entering: FadeInDown.duration(duration.medium)
              .delay(Math.min(index, 8) * 50)
              .easing(easing.emphasizedDecelerate),
          })}
    >
      {children}
    </Animated.View>
  );
}
