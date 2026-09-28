import { emailSchema, unmetPasswordRules } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { Button, Divider, FormMessage, Screen, TextField } from '@/shared/ui';

import type { SignUpInput } from '../../domain/auth-repository';
import { useAuth } from '../auth-provider';
import { AuthHeader } from '../components/auth-header';
import { ConsentCheckbox } from '../components/consent-checkbox';
import { GoogleButton } from '../components/google-button';
import { PasswordRules } from '../components/password-rules';

type FieldErrors = Partial<Record<'name' | 'email' | 'consent', string>>;

export function SignUpScreen() {
  const { t } = useTranslation();
  const { repository } = useAuth();
  const toMessage = useErrorMessage();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showRules, setShowRules] = useState(false);

  const signUp = useMutation({
    mutationFn: (input: SignUpInput) => repository.signUp(input),
    onSuccess: () => router.replace({ pathname: '/verify-email', params: { sent: '1' } }),
  });
  const google = useMutation({ mutationFn: () => repository.signInWithProvider('google') });
  const error =
    signUp.error ??
    (google.error && errorCode(google.error) !== 'sign_in_cancelled' ? google.error : null);

  const submit = () => {
    const trimmedName = name.trim();
    const parsedEmail = emailSchema.safeParse(email);
    const next: FieldErrors = {};
    if (trimmedName.length < 1 || trimmedName.length > 80) next.name = t('errors.validation.name');
    if (!parsedEmail.success) next.email = t('errors.validation.email');
    if (!consent) next.consent = t('auth.signUp.consentRequired');
    setErrors(next);
    setShowRules(true);
    if (
      Object.keys(next).length > 0 ||
      !parsedEmail.success ||
      unmetPasswordRules(password).length > 0
    )
      return;
    signUp.mutate({ displayName: trimmedName, email: parsedEmail.data, password });
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} />
      <FormMessage tone="error" message={toMessage(error)} />
      <TextField
        testID="name"
        label={t('auth.fields.name')}
        value={name}
        onChangeText={setName}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
        maxLength={80}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        testID="email"
        label={t('auth.fields.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
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
        onChangeText={(value) => {
          setPassword(value);
          setShowRules(true);
        }}
        password
        showPasswordLabel={t('auth.fields.showPassword')}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={72}
      />
      {showRules ? <PasswordRules password={password} /> : null}
      <ConsentCheckbox checked={consent} onChange={setConsent} />
      <FormMessage tone="error" message={errors.consent} />
      <Button
        testID="sign-up-submit"
        label={t('auth.signUp.submit')}
        onPress={submit}
        loading={signUp.isPending}
      />
      <Divider label={t('auth.or')} />
      <GoogleButton onPress={() => google.mutate()} loading={google.isPending} />
      <Button
        variant="ghost"
        label={`${t('auth.signUp.haveAccount')} ${t('auth.signUp.signInLink')}`}
        onPress={() => router.replace('/sign-in')}
      />
    </Screen>
  );
}
