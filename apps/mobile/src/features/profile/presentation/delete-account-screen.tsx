import { AppError } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, type Theme } from '@/core/theme';
import { hasPassword, useAuth, useCurrentUser } from '@/features/auth';
import { AppText, Button, Checkbox, FormMessage, Icon, Screen, TextField } from '@/shared/ui';

const ITEMS = ['documents', 'chats', 'study', 'profile'] as const;

export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { repository } = useAuth();
  const user = useCurrentUser();
  const toMessage = useErrorMessage();
  const [confirmed, setConfirmed] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [password, setPassword] = useState('');
  const [originalUserId] = useState(user.id);

  const deleteAccount = useMutation({
    mutationFn: () => repository.deleteAccount(),
    onSuccess: () => router.replace({ pathname: '/welcome', params: { deleted: '1' } }),
    onError: (error) => {
      if (errorCode(error) === 'reauthentication_required') setNeedsReauth(true);
    },
  });

  const reauthenticate = useMutation({
    mutationFn: async () => {
      const signedIn = hasPassword(user)
        ? await repository.signInWithPassword(user.email, password)
        : await repository.signInWithProvider('google');
      // Guard against confirming with another Google account and deleting the wrong user.
      if (signedIn.id !== originalUserId) {
        await repository.signOut('local');
        throw new AppError('forbidden', 'different_account');
      }
    },
    onSuccess: () => {
      setNeedsReauth(false);
      deleteAccount.mutate();
    },
  });

  const reauthError =
    reauthenticate.error instanceof AppError && reauthenticate.error.message === 'different_account'
      ? t('deleteAccount.differentAccount')
      : toMessage(reauthenticate.error);

  if (needsReauth) {
    return (
      <Screen keyboard edges={['top', 'bottom']}>
        <AppText variant="title" accessibilityRole="header">
          {t('deleteAccount.reauthTitle')}
        </AppText>
        <AppText color="textSecondary">
          {hasPassword(user) ? t('deleteAccount.reauthPassword') : t('deleteAccount.reauthGoogle')}
        </AppText>
        <FormMessage tone="error" message={reauthError} />
        {hasPassword(user) ? (
          <TextField
            testID="reauth-password"
            label={t('auth.fields.password')}
            value={password}
            onChangeText={setPassword}
            password
            showPasswordLabel={t('auth.fields.showPassword')}
            autoComplete="current-password"
            autoFocus
          />
        ) : null}
        <Button
          testID="reauth-submit"
          variant="danger"
          label={t('deleteAccount.reauthSubmit')}
          onPress={() => reauthenticate.mutate()}
          disabled={hasPassword(user) && !password}
          loading={reauthenticate.isPending || deleteAccount.isPending}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppText variant="title" accessibilityRole="header">
        {t('deleteAccount.title')}
      </AppText>
      <AppText>{t('deleteAccount.body')}</AppText>
      <View style={styles.list}>
        {ITEMS.map((item) => (
          <View key={item} style={styles.item}>
            <Icon name="close-circle-outline" size={18} color="danger" />
            <AppText style={styles.itemText}>{t(`deleteAccount.items.${item}`)}</AppText>
          </View>
        ))}
      </View>
      <FormMessage tone="info" message={t('deleteAccount.subscription')} />
      <FormMessage
        tone="error"
        message={
          errorCode(deleteAccount.error) === 'reauthentication_required'
            ? null
            : toMessage(deleteAccount.error)
        }
      />
      <Checkbox
        testID="confirm-delete"
        checked={confirmed}
        onChange={setConfirmed}
        accessibilityLabel={t('deleteAccount.confirm')}
      >
        <AppText>{t('deleteAccount.confirm')}</AppText>
      </Checkbox>
      <Button
        testID="delete-submit"
        variant="danger"
        label={t('deleteAccount.submit')}
        onPress={() => deleteAccount.mutate()}
        disabled={!confirmed}
        loading={deleteAccount.isPending}
      />
    </Screen>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    list: { gap: spacing.sm },
    item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    itemText: { flex: 1 },
  });
