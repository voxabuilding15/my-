import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorMessage } from '@/core/i18n/error-message';
import { useAuth, useCurrentUser } from '@/features/auth';
import { AppText, Button, FormMessage, Screen, TextField } from '@/shared/ui';

export function EditProfileScreen() {
  const { t } = useTranslation();
  const { repository } = useAuth();
  const user = useCurrentUser();
  const toMessage = useErrorMessage();
  const [name, setName] = useState(user.displayName ?? '');
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 80;

  const save = useMutation({
    mutationFn: () => repository.updateDisplayName(trimmed),
    onSuccess: () => router.back(),
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AppText variant="title" accessibilityRole="header">
        {t('profile.editName')}
      </AppText>
      <FormMessage tone="error" message={toMessage(save.error)} />
      <TextField
        testID="name"
        label={t('auth.fields.name')}
        value={name}
        onChangeText={setName}
        error={valid ? null : t('errors.validation.name')}
        maxLength={80}
        autoComplete="name"
        autoFocus
      />
      <Button
        testID="save-name"
        label={t('common.save')}
        onPress={() => save.mutate()}
        disabled={!valid}
        loading={save.isPending}
      />
    </Screen>
  );
}
