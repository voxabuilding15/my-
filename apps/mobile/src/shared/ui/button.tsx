import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useStyles, useTheme, type ColorTokens, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { PressableScale } from './pressable-scale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  testID?: string;
};

const LABEL_COLOR: Record<Variant, keyof ColorTokens> = {
  primary: 'onPrimary',
  secondary: 'text',
  ghost: 'primaryText',
  danger: 'onDanger',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  testID,
}: ButtonProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.base, styles[variant], inactive && styles.inactive]}
    >
      {loading ? (
        <ActivityIndicator color={colors[LABEL_COLOR[variant]]} />
      ) : (
        <View style={styles.content}>
          {icon}
          <AppText variant="bodyStrong" color={LABEL_COLOR[variant]}>
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: 52,
      borderRadius: radii.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    primary: { backgroundColor: colors.primary },
    secondary: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.danger },
    inactive: { opacity: 0.5 },
  });
