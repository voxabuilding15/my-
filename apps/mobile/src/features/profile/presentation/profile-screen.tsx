import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { openLegalPage, useLegalLinks } from '@/core/legal/legal-links';
import { checkDeviceIntegrity } from '@/core/security/device-integrity';
import { useStyles, type Theme } from '@/core/theme';
import { hasPassword, useAuth, useCurrentUser, VerifyEmailBanner } from '@/features/auth';
import { AppText, FormMessage, Icon, ListRow, Screen, Section } from '@/shared/ui';

export function ProfileScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { repository } = useAuth();
  const user = useCurrentUser();
  const links = useLegalLinks();
  const integrity = useQuery({
    queryKey: ['device-integrity'],
    queryFn: checkDeviceIntegrity,
    staleTime: Infinity,
  });
  const signOut = useMutation({
    mutationFn: (scope: 'local' | 'global') => repository.signOut(scope),
  });

  const confirmSignOutEverywhere = () =>
    Alert.alert(t('profile.signOutAll'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOutAll'),
        style: 'destructive',
        onPress: () => signOut.mutate('global'),
      },
    ]);

  return (
    <Screen scroll>
      <AppText variant="title" accessibilityRole="header">
        {t('profile.title')}
      </AppText>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <AppText variant="title" color="onPrimary">
            {(user.displayName ?? user.email).trim().charAt(0).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.identityText}>
          <AppText variant="heading">{user.displayName ?? user.email}</AppText>
          <AppText variant="caption" color="textSecondary">
            {user.email}
          </AppText>
          <View style={styles.badge}>
            <Icon
              name={user.emailVerified ? 'check-decagram' : 'alert-circle-outline'}
              size={14}
              color={user.emailVerified ? 'success' : 'warning'}
            />
            <AppText variant="caption" color={user.emailVerified ? 'success' : 'warning'}>
              {user.emailVerified ? t('profile.verified') : t('profile.unverified')}
            </AppText>
          </View>
        </View>
      </View>

      <VerifyEmailBanner />
      {integrity.data === 'rooted' ? (
        <FormMessage tone="info" message={t('profile.rootedNotice')} />
      ) : null}

      <Section title={t('settings.title')}>
        <ListRow
          testID="open-settings"
          icon="cog-outline"
          label={t('settings.title')}
          onPress={() => router.push('/settings')}
        />
        <ListRow
          icon="crown-outline"
          label={t('settings.subscription')}
          onPress={() => router.push('/paywall')}
        />
        <ListRow
          icon="bookmark-outline"
          label={t('bookmarks.title')}
          onPress={() => router.push('/bookmarks')}
        />
        <ListRow
          icon="translate"
          label={t('translator.title')}
          onPress={() => router.push('/translator')}
        />
      </Section>

      <Section title={t('profile.sections.account')}>
        <ListRow
          icon="account-edit-outline"
          label={t('profile.editName')}
          onPress={() => router.push('/edit-profile')}
        />
      </Section>

      <Section title={t('profile.sections.security')}>
        {hasPassword(user) ? (
          <ListRow
            icon="lock-reset"
            label={t('profile.changePassword')}
            onPress={() => router.push('/change-password')}
          />
        ) : (
          <ListRow icon="google" label={t('profile.signedInWithGoogle')} />
        )}
        <ListRow
          testID="sign-out"
          icon="logout"
          label={t('profile.signOut')}
          onPress={() => signOut.mutate('local')}
        />
        <ListRow
          icon="devices"
          label={t('profile.signOutAll')}
          onPress={confirmSignOutEverywhere}
        />
      </Section>

      <Section title={t('profile.sections.legal')}>
        <ListRow
          icon="shield-lock-outline"
          label={t('profile.privacy')}
          onPress={() => openLegalPage(links.privacyUrl)}
        />
        <ListRow
          icon="file-document-outline"
          label={t('profile.terms')}
          onPress={() => openLegalPage(links.termsUrl)}
        />
      </Section>

      <Section title={t('profile.sections.danger')}>
        <ListRow
          testID="delete-account"
          icon="delete-forever-outline"
          label={t('profile.deleteAccount')}
          destructive
          onPress={() => router.push('/delete-account')}
        />
      </Section>
    </Screen>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityText: { flex: 1, gap: spacing.xxs },
    badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  });
