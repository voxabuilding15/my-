import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/shared/ui';

export function StudyScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title">{t('study.title')}</AppText>
      <EmptyState icon="cards-outline" title={t('common.comingSoon')} message={t('study.empty')} />
    </Screen>
  );
}
