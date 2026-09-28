import { StyleSheet } from 'react-native';

import { useStyles, type ColorTokens, type Theme } from '@/core/theme';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  color?: keyof ColorTokens;
  variant?: 'standard' | 'tonal';
  size?: number;
  disabled?: boolean;
  testID?: string;
};

/** 48dp touch target (Material minimum) regardless of icon size. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color = 'text',
  variant = 'standard',
  size = 24,
  disabled = false,
  testID,
}: IconButtonProps) {
  const styles = useStyles(makeStyles);
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      pressedScale={0.9}
      style={[styles.button, variant === 'tonal' && styles.tonal, disabled && styles.disabled]}
    >
      <Icon name={icon} size={size} color={color} />
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii }: Theme) =>
  StyleSheet.create({
    button: {
      width: 48,
      height: 48,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tonal: { backgroundColor: colors.surfaceContainer },
    disabled: { opacity: 0.4 },
  });
