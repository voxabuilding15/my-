import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/shared/ui';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <EmptyState icon="compass-off-outline" title={t('errors.notFound')} />
      <Link href="/" style={{ alignSelf: 'center' }}>
        <AppText color="primaryText" variant="bodyStrong">
          {t('errors.goHome')}
        </AppText>
      </Link>
    </Screen>
  );
}
