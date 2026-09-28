import { StyleSheet } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

type ChipProps = {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress?: () => void;
  testID?: string;
};

/** Material 3 filter/assist chip. */
export function Chip({ label, selected = false, icon, onPress, testID }: ChipProps) {
  const styles = useStyles(makeStyles);
  return (
    <PressableScale
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      {selected ? (
        <Icon name="check" size={16} color="primaryText" />
      ) : icon ? (
        <Icon name={icon} size={16} color="textSecondary" />
      ) : null}
      <AppText variant="caption" color={selected ? 'primaryText' : 'text'}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    selected: { backgroundColor: colors.primarySubtle, borderColor: colors.primarySubtle },
  });
