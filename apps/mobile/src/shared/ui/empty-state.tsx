import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type EmptyStateProps = { icon: IconName; title: string; message?: string };

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.badge}>
        <Icon name={icon} size={32} color="primaryText" />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const makeStyles = ({ colors, spacing, radii }: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
    },
    badge: {
      width: 72,
      height: 72,
      borderRadius: radii.full,
      backgroundColor: colors.primarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
  });
