import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/core/network/online';
import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Shown on every screen while offline: saved content stays usable, AI and uploads wait. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  if (online) return null;
  return (
    <View
      // Floats above the tab bar without moving the screen's layout; touches pass through.
      pointerEvents="none"
      style={[styles.banner, { bottom: insets.bottom + 76 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
    >
      <Icon name="cloud-off-outline" size={16} color="warning" />
      <AppText variant="caption" color="text" style={styles.text}>
        {t('common.offline')}
      </AppText>
    </View>
  );
}

const makeStyles = ({ colors, spacing, radii }: Theme) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      alignSelf: 'center',
      maxWidth: 560,
      marginHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      backgroundColor: colors.warningSubtle,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.warning,
    },
    text: { flexShrink: 1, textAlign: 'center' },
  });
