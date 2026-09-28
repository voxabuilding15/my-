import type { Rating } from '@studexa/shared';
import { I18nManager } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const THRESHOLD = 110;

/**
 * Swipe a revealed card toward the reading direction's end for "know it" (3) or toward the start
 * for "don't know" (1). The card flies out, `onRate` runs on the JS thread, and the position resets.
 */
export function useSwipeToRate(enabled: boolean, onRate: (rating: Rating) => void) {
  const translateX = useSharedValue(0);
  const direction = I18nManager.isRTL ? -1 : 1;

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .onChange((event) => {
      translateX.set(event.translationX);
    })
    .onEnd(() => {
      const signed = translateX.get() * direction;
      if (signed > THRESHOLD) {
        translateX.set(
          withTiming(600 * direction, { duration: 180 }, () => {
            runOnJS(onRate)(3);
            translateX.set(0);
          }),
        );
      } else if (signed < -THRESHOLD) {
        translateX.set(
          withTiming(-600 * direction, { duration: 180 }, () => {
            runOnJS(onRate)(1);
            translateX.set(0);
          }),
        );
      } else {
        translateX.set(withSpring(0));
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }, { rotate: `${translateX.get() / 25}deg` }],
  }));

  return { gesture, style };
}
