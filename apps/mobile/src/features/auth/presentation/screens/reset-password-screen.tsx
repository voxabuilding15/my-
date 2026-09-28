import { EMAIL_CODE_LENGTH, EMAIL_CODE_POLICY, unmetPasswordRules } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { Button, CodeInput, FormMessage, Screen, TextField } from '@/shared/ui';

import { useAuth } from '../auth-provider';
import { AuthHeader } from '../components/auth-header';
import { PasswordRules } from '../components/password-rules';
import { ResendCodeButton } from '../components/resend-code-button';
import { useCountdown } from '../hooks/use-countdown';

type Step = 'code' | 'password' | 'done';

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { repository, status } = useAuth();
  const toMessage = useErrorMessage();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const countdown = useCountdown(EMAIL_CODE_POLICY.resendAfterSeconds);

  const check = useMutation({
    mutationFn: (value: string) => repository.checkPasswordResetCode(email, value),
    onSuccess: () => setStep('password'),
    onError: () => setCode(''),
  });
  const resend = useMutation({
    mutationFn: () => repository.requestPasswordReset(email),
    onSuccess: ({ retryAfterSeconds }) => {
      countdown.start(retryAfterSeconds);
      check.reset();
    },
  });
  const complete = useMutation({
    mutationFn: () => repository.completePasswordReset(email, code, password),
    onSuccess: () => setStep('done'),
    onError: (error) => {
      // The code was locked or expired meanwhile: start over from the code step.
      if (errorCode(error) === 'code_expired') {
        setCode('');
        setStep('code');
      }
    },
  });

  if (step === 'done') {
    return (
      <Screen edges={['top', 'bottom']}>
        <AuthHeader title={t('auth.reset.passwordTitle')} />
        <FormMessage tone="success" message={t('auth.reset.success')} />
        <Button
          testID="go-sign-in"
          label={t('auth.signIn.submit')}
          // Changing while signed in: this session was revoked server-side, so end it locally
          // (the guard then shows the signed-out screens). Signed out: return to the sign-in form.
          onPress={() =>
            status === 'signed_in' ? void repository.signOut('local') : router.dismissTo('/sign-in')
          }
        />
      </Screen>
    );
  }

  if (step === 'password') {
    const weak = unmetPasswordRules(password).length > 0;
    return (
      <Screen keyboard edges={['top', 'bottom']}>
        <AuthHeader
          title={t('auth.reset.passwordTitle')}
          subtitle={t('auth.reset.passwordSubtitle')}
        />
        <FormMessage tone="error" message={toMessage(complete.error)} />
        <TextField
          testID="new-password"
          label={t('auth.fields.newPassword')}
          value={password}
          onChangeText={setPassword}
          password
          showPasswordLabel={t('auth.fields.showPassword')}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={72}
          autoFocus
        />
        <PasswordRules password={password} />
        <Button
          testID="update-password"
          label={t('auth.reset.submit')}
          onPress={() => complete.mutate()}
          disabled={weak}
          loading={complete.isPending}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader
        title={t('auth.reset.codeTitle')}
        subtitle={t('auth.reset.codeSubtitle', { email })}
      />
      <FormMessage
        tone="error"
        message={toMessage(check.error ?? resend.error ?? complete.error)}
      />
      <CodeInput
        testID="code"
        label={t('auth.fields.code')}
        value={code}
        error={Boolean(check.error)}
        onChange={(value) => {
          setCode(value);
          if (value.length === EMAIL_CODE_LENGTH) check.mutate(value);
        }}
      />
      <Button
        testID="check-code"
        label={t('auth.reset.continue')}
        onPress={() => check.mutate(code)}
        disabled={code.length !== EMAIL_CODE_LENGTH}
        loading={check.isPending}
      />
      <ResendCodeButton
        remaining={countdown.remaining}
        loading={resend.isPending}
        onPress={() => resend.mutate()}
      />
    </Screen>
  );
}
