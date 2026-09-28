import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

export function Divider({ label }: { label?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityElementsHidden={!label}>
      <View style={styles.line} />
      {label ? (
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
      ) : null}
      <View style={styles.line} />
    </View>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  });
