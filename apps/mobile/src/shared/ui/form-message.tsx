import { StyleSheet, View } from 'react-native';

import { useStyles, type ColorTokens, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, { icon: IconName; color: keyof ColorTokens }> = {
  error: { icon: 'alert-circle-outline', color: 'danger' },
  success: { icon: 'check-circle-outline', color: 'success' },
  info: { icon: 'information-outline', color: 'primaryText' },
};

export function FormMessage({ tone, message }: { tone: Tone; message: string | null | undefined }) {
  const styles = useStyles(makeStyles);
  if (!message) return null;
  const { icon, color } = TONES[tone];
  return (
    <View style={styles.box} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Icon name={icon} size={20} color={color} />
      <AppText style={styles.text} color={color}>
        {message}
      </AppText>
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
    },
    text: { flex: 1 },
  });
