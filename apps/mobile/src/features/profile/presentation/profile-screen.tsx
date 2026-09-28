import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/shared/ui';

export function ProfileScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title">{t('profile.title')}</AppText>
      <EmptyState icon="account-circle-outline" title={t('common.comingSoon')} />
    </Screen>
  );
}
