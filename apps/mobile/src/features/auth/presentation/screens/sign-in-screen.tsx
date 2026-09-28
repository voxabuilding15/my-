import { emailSchema } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { Button, Divider, FormMessage, Screen, TextField } from '@/shared/ui';

import { useAuth } from '../auth-provider';
import { AuthHeader } from '../components/auth-header';
import { GoogleButton } from '../components/google-button';

export function SignInScreen() {
  const { t } = useTranslation();
  const { repository } = useAuth();
  const toMessage = useErrorMessage();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      repository.signInWithPassword(input.email, input.password),
  });
  const google = useMutation({ mutationFn: () => repository.signInWithProvider('google') });
  const error =
    signIn.error ??
    (google.error && errorCode(google.error) !== 'sign_in_cancelled' ? google.error : null);

  const submit = () => {
    const parsed = emailSchema.safeParse(email);
    setEmailError(parsed.success ? null : t('errors.validation.email'));
    if (!parsed.success || !password) return;
    google.reset();
    signIn.mutate({ email: parsed.data, password });
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')} />
      <FormMessage tone="error" message={toMessage(error)} />
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        testID="password"
        label={t('auth.fields.password')}
        value={password}
        onChangeText={setPassword}
        password
        showPasswordLabel={t('auth.fields.showPassword')}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button
        variant="ghost"
        label={t('auth.signIn.forgot')}
        onPress={() =>
          router.push({ pathname: '/forgot-password', params: email ? { email } : {} })
        }
      />
      <Button
        testID="sign-in-submit"
        label={t('auth.signIn.submit')}
        onPress={submit}
        loading={signIn.isPending}
      />
      <Divider label={t('auth.or')} />
      <GoogleButton onPress={() => google.mutate()} loading={google.isPending} />
      <Button
        variant="ghost"
        label={`${t('auth.signIn.noAccount')} ${t('auth.signIn.signUpLink')}`}
        onPress={() => router.replace('/sign-up')}
      />
    </Screen>
  );
}
