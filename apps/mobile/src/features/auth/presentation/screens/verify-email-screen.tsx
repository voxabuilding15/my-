import { AppError, EMAIL_CODE_LENGTH } from '@studexa/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorCode, useErrorMessage } from '@/core/i18n/error-message';
import { AppText, Button, CodeInput, FormMessage, Screen } from '@/shared/ui';

import { useAuth, useCurrentUser } from '../auth-provider';
import { AuthHeader } from '../components/auth-header';
import { ResendCodeButton } from '../components/resend-code-button';
import { useCountdown } from '../hooks/use-countdown';

const retryAfter = (error: unknown): number | null => {
  const seconds =
    error instanceof AppError
      ? (error.details as { retryAfterSeconds?: unknown })?.retryAfterSeconds
      : null;
  return typeof seconds === 'number' ? seconds : null;
};

export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { repository } = useAuth();
  const user = useCurrentUser();
  const toMessage = useErrorMessage();
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const [code, setCode] = useState('');
  const countdown = useCountdown(sent === '1' ? 60 : 0);
  const autoSent = useRef(false);

  const resend = useMutation({
    mutationFn: () => repository.sendVerificationCode(),
    onSuccess: ({ retryAfterSeconds }) => countdown.start(retryAfterSeconds),
    onError: (error) => countdown.start(retryAfter(error) ?? 0),
  });
  const confirm = useMutation({
    mutationFn: (value: string) => repository.confirmVerificationCode(value),
    onError: () => setCode(''),
  });

  // Arriving from the banner (not straight from sign-up): send a code right away.
  useEffect(() => {
    if (sent !== '1' && !user.emailVerified && !autoSent.current) {
      autoSent.current = true;
      resend.mutate();
    }
  }, [sent, user.emailVerified, resend]);

  const onChange = (value: string) => {
    setCode(value);
    if (value.length === EMAIL_CODE_LENGTH && !confirm.isPending) confirm.mutate(value);
  };

  if (user.emailVerified) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AuthHeader title={t('auth.verify.title')} />
        <FormMessage tone="success" message={t('auth.verify.success')} />
        <Button label={t('common.continue')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const attemptsRemaining = (confirm.error as AppError | null)?.details as
    { attemptsRemaining?: number } | undefined;
  const confirmMessage =
    confirm.error &&
    errorCode(confirm.error) === 'invalid_code' &&
    attemptsRemaining?.attemptsRemaining !== undefined
      ? `${toMessage(confirm.error)} ${t('auth.verify.attemptsLeft', { count: attemptsRemaining.attemptsRemaining })}`
      : toMessage(confirm.error);

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader
        title={t('auth.verify.title')}
        subtitle={t('auth.verify.subtitle', { email: user.email })}
      />
      <FormMessage tone="error" message={confirmMessage ?? toMessage(resend.error)} />
      {resend.isSuccess && !confirm.error ? (
        <FormMessage tone="info" message={t('auth.verify.sent')} />
      ) : null}
      <CodeInput
        testID="code"
        label={t('auth.fields.code')}
        value={code}
        onChange={onChange}
        error={Boolean(confirm.error)}
      />
      <Button
        testID="verify-submit"
        label={t('auth.verify.submit')}
        onPress={() => confirm.mutate(code)}
        disabled={code.length !== EMAIL_CODE_LENGTH}
        loading={confirm.isPending}
      />
      <ResendCodeButton
        remaining={countdown.remaining}
        loading={resend.isPending}
        onPress={() => resend.mutate()}
      />
      <Button variant="ghost" label={t('auth.verify.later')} onPress={() => router.replace('/')} />
      <AppText variant="caption" color="textSecondary" align="center">
        {user.email}
      </AppText>
    </Screen>
  );
}
