import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/core/theme';
import { Button } from '@/shared/ui';

export function GoogleButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Button
      testID="google-sign-in"
      variant="secondary"
      label={t('auth.welcome.continueWithGoogle')}
      onPress={onPress}
      loading={loading}
      icon={<MaterialCommunityIcons name="google" size={20} color={colors.text} />}
    />
  );
}
