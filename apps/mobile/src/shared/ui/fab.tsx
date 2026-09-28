import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

type FabProps = { icon: IconName; label: string; onPress: () => void; testID?: string };

/** Extended floating action button, anchored to the end edge (mirrors in RTL). */
export function Fab({ icon, label, onPress, testID }: FabProps) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.fab, { bottom: 16 + insets.bottom }]}
    >
      <Icon name={icon} color="onPrimary" />
      <AppText variant="bodyStrong" color="onPrimary">
        {label}
      </AppText>
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii, spacing, elevation }: Theme) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      end: spacing.lg,
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.lg,
      backgroundColor: colors.primary,
      ...elevation.level3,
    },
  });
