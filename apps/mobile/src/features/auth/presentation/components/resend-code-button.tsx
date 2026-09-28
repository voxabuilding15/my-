import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';

type Props = { remaining: number; loading: boolean; onPress: () => void };

export function ResendCodeButton({ remaining, loading, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <Button
      testID="resend-code"
      variant="ghost"
      label={
        remaining > 0 ? t('auth.verify.resendIn', { seconds: remaining }) : t('auth.verify.resend')
      }
      disabled={remaining > 0}
      loading={loading}
      onPress={onPress}
    />
  );
}
