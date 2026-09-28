import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

type ScreenHeaderProps = { title: string; subtitle?: string | undefined; actions?: ReactNode };

export function ScreenHeader({ title, subtitle, actions }: ScreenHeaderProps) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText color="textSecondary">{subtitle}</AppText> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    text: { flex: 1, gap: spacing.xxs },
    actions: { flexDirection: 'row', alignItems: 'center' },
  });
