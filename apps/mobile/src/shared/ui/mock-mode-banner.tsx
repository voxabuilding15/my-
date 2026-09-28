import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { env } from '@/core/config/env';
import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export function MockModeBanner() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  if (!env.useMocks) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="flask-outline" size={16} color="warning" />
      <AppText variant="caption" color="warning">
        {t('common.mockMode')}
      </AppText>
    </View>
  );
}

const makeStyles = ({ colors, spacing, radii }: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.warning,
    },
  });
