import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/shared/ui';

export function DocumentsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title">{t('documents.title')}</AppText>
      <EmptyState
        icon="file-document-multiple-outline"
        title={t('common.comingSoon')}
        message={t('documents.empty')}
      />
    </Screen>
  );
}
