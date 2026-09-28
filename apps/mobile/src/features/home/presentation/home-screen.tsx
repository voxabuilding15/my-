import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { useAuth, VerifyEmailBanner } from '@/features/auth';
import { AppText, MockModeBanner, Screen } from '@/shared/ui';

export function HomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  return (
    <Screen scroll>
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
        <AppText variant="title">{t('common.appName')}</AppText>
      </View>
      <MockModeBanner />
      <VerifyEmailBanner />
      <View style={styles.hero}>
        {firstName ? (
          <AppText color="textSecondary">{t('home.hello', { name: firstName })}</AppText>
        ) : null}
        <AppText variant="display">{t('home.greeting')}</AppText>
        <AppText color="textSecondary">{t('home.subtitle')}</AppText>
      </View>
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    logo: { width: 32, height: 32 },
    hero: { gap: spacing.xs, marginTop: spacing.lg },
  });
