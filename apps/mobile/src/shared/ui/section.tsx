import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.section}>
      <AppText
        variant="label"
        color="textSecondary"
        style={styles.title}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    title: { paddingHorizontal: spacing.xs },
    card: {
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
