import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { Icon } from './icon';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel: string;
  children: ReactNode;
  testID?: string;
};

export function Checkbox({
  checked,
  onChange,
  accessibilityLabel,
  children,
  testID,
}: CheckboxProps) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked }}
        // 22 dp box, 48 dp to touch.
        hitSlop={13}
        onPress={() => onChange(!checked)}
        style={[styles.box, checked && styles.checked]}
      >
        {checked ? <Icon name="check" size={16} color="onPrimary" /> : null}
      </Pressable>
      <View style={styles.label}>{children}</View>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    box: {
      width: 22,
      height: 22,
      marginTop: 1,
      borderRadius: radii.sm / 2,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checked: { backgroundColor: colors.primary, borderColor: colors.primary },
    label: { flex: 1 },
  });
