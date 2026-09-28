import { emailSchema } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorMessage } from '@/core/i18n/error-message';
import { Button, FormMessage, Screen, TextField } from '@/shared/ui';

import { useAuth } from '../auth-provider';
import { AuthHeader } from '../components/auth-header';

type Props = {
  /** Where the code is entered: the signed-out or the signed-in flow. */
  codeRoute: '/reset-password' | '/change-password-code';
  /** Signed-in users changing their password: the code goes to their own address. */
  changing?: boolean;
};

export function ForgotPasswordScreen({ codeRoute, changing = false }: Props) {
  const { t } = useTranslation();
  const { repository, user } = useAuth();
  const toMessage = useErrorMessage();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState((changing ? user?.email : params.email) ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: (address: string) => repository.requestPasswordReset(address),
    onSuccess: (_result, address) =>
      router.push({ pathname: codeRoute, params: { email: address } }),
  });

  const submit = () => {
    const parsed = emailSchema.safeParse(email);
    setEmailError(parsed.success ? null : t('errors.validation.email'));
    if (parsed.success) request.mutate(parsed.data);
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader
        title={changing ? t('auth.forgot.changeTitle') : t('auth.forgot.title')}
        subtitle={changing ? t('auth.forgot.changeSubtitle', { email }) : t('auth.forgot.subtitle')}
      />
      <FormMessage tone="error" message={toMessage(request.error)} />
      {changing ? null : (
        <TextField
          testID="email"
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={submit}
          autoFocus
        />
      )}
      <Button
        testID="send-code"
        label={t('auth.forgot.submit')}
        onPress={submit}
        loading={request.isPending}
      />
    </Screen>
  );
}
