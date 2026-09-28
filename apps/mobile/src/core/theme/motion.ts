import { Easing, useReducedMotion, type WithTimingConfig } from 'react-native-reanimated';

/** Material 3 motion: durations and easing curves. */
export const duration = {
  short: 150,
  medium: 300,
  long: 450,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  emphasizedAccelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

export const timing = (
  ms: number = duration.medium,
  curve = easing.standard,
): WithTimingConfig => ({
  duration: ms,
  easing: curve,
});

// Some test environments mock Reanimated without this hook; the choice is fixed at module load,
// so hook order stays stable across renders.
const useReducedMotionOrFalse: () => boolean =
  typeof useReducedMotion === 'function' ? useReducedMotion : () => false;

/** Respect the system "reduce motion" setting: callers skip or shorten animations. */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotionOrFalse();
}
