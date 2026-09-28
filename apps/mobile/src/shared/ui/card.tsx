import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { PressableScale } from './pressable-scale';

type CardProps = PropsWithChildren<{
  variant?: 'elevated' | 'filled' | 'outlined';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function Card({
  variant = 'outlined',
  onPress,
  accessibilityLabel,
  style,
  testID,
  children,
}: CardProps) {
  const styles = useStyles(makeStyles);
  const cardStyle = [styles.base, styles[variant], style];
  if (!onPress) {
    return (
      <View style={cardStyle} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={cardStyle}
    >
      {children}
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii, spacing, elevation }: Theme) =>
  StyleSheet.create({
    base: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
    elevated: { backgroundColor: colors.surfaceElevated, ...elevation.level2 },
    filled: { backgroundColor: colors.surface },
    outlined: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
