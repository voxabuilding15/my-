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

import { usePrefersReducedMotion, useStyles, type ColorTokens, type Theme } from '@/core/theme';
import { Icon, type IconName } from '@/shared/ui';

type Satellite = { icon: IconName; color: keyof ColorTokens; top: number; start: number };

export type IllustrationSpec = {
  icon: IconName;
  color: keyof ColorTokens;
  surface: keyof ColorTokens;
  satellites: Satellite[];
};

function FloatingBadge({ satellite, index }: { satellite: Satellite; index: number }) {
  const styles = useStyles(makeStyles);
  const reduceMotion = usePrefersReducedMotion();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    offset.set(
      withDelay(
        index * 300,
        withRepeat(
          withSequence(withTiming(-8, { duration: 1400 }), withTiming(0, { duration: 1400 })),
          -1,
        ),
      ),
    );
  }, [index, offset, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  return (
    <Animated.View style={[styles.badge, { top: satellite.top, start: satellite.start }, animated]}>
      <Icon name={satellite.icon} size={24} color={satellite.color} />
    </Animated.View>
  );
}

/** Decorative: layered circles, a hero icon and gently floating badges. */
export function OnboardingIllustration({ spec }: { spec: IllustrationSpec }) {
  const styles = useStyles(makeStyles);
  return (
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.halo, styles[spec.surface as 'primarySubtle']]} />
      <View style={[styles.core, styles.coreSurface]}>
        <Icon name={spec.icon} size={72} color={spec.color} />
      </View>
      {spec.satellites.map((satellite, index) => (
        <FloatingBadge key={satellite.icon} satellite={satellite} index={index} />
      ))}
    </View>
  );
}

const makeStyles = ({ colors, radii, elevation }: Theme) =>
  StyleSheet.create({
    stage: {
      width: 260,
      height: 260,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    halo: { position: 'absolute', width: 260, height: 260, borderRadius: radii.full, opacity: 0.9 },
    primarySubtle: { backgroundColor: colors.primarySubtle },
    chatSubtle: { backgroundColor: colors.chatSubtle },
    flashcardsSubtle: { backgroundColor: colors.flashcardsSubtle },
    core: {
      width: 150,
      height: 150,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      ...elevation.level2,
    },
    coreSurface: { backgroundColor: colors.surfaceElevated },
    badge: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      ...elevation.level2,
    },
  });
