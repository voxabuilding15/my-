import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, type Theme } from '@/core/theme';
import { AppText, Button, FormMessage, MockModeBanner, Screen } from '@/shared/ui';

import { useAuth } from '../auth-provider';
import { GoogleButton } from '../components/google-button';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { repository } = useAuth();
  const toMessage = useErrorMessage();
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const google = useMutation({ mutationFn: () => repository.signInWithProvider('google') });
  const googleError =
    google.error && errorCode(google.error) !== 'sign_in_cancelled' ? google.error : null;

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
        <AppText variant="display" accessibilityRole="header">
          {t('auth.welcome.title')}
        </AppText>
        <AppText color="textSecondary">{t('auth.welcome.subtitle')}</AppText>
        <MockModeBanner />
      </View>
      <View style={styles.actions}>
        {deleted ? <FormMessage tone="success" message={t('deleteAccount.done')} /> : null}
        <FormMessage tone="error" message={toMessage(googleError)} />
        <GoogleButton onPress={() => google.mutate()} loading={google.isPending} />
        <Button
          testID="go-sign-up"
          variant="primary"
          label={t('auth.welcome.signUpWithEmail')}
          onPress={() => router.push('/sign-up')}
        />
        <Button
          testID="go-sign-in"
          variant="ghost"
          label={t('auth.welcome.haveAccount')}
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    content: { flexGrow: 1, justifyContent: 'space-between' },
    hero: { gap: spacing.md, marginTop: spacing.xxl },
    logo: { width: 72, height: 72, marginBottom: spacing.lg },
    actions: { gap: spacing.md },
  });
