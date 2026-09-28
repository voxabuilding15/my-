import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Icon } from '@/shared/ui';

import { useAuth } from '../auth-provider';

/** Shown until the email is verified; AI features are refused server-side until then. */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  if (!user || user.emailVerified) return null;
  return (
    <Pressable
      testID="verify-banner"
      accessibilityRole="button"
      onPress={() => router.push('/verify-email')}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <Icon name="email-alert-outline" color="primaryText" />
      <View style={styles.text}>
        <AppText variant="bodyStrong">{t('auth.verifyBanner.title')}</AppText>
        <AppText variant="caption" color="primaryText">
          {t('auth.verifyBanner.action')}
        </AppText>
      </View>
    </Pressable>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.primarySubtle,
    },
    pressed: { opacity: 0.85 },
    text: { flex: 1, gap: spacing.xxs },
  });
