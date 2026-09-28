import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/shared/ui';

export function ChatScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title">{t('chat.title')}</AppText>
      <EmptyState
        icon="chat-processing-outline"
        title={t('common.comingSoon')}
        message={t('chat.empty')}
      />
    </Screen>
  );
}
