import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { usePlanStatus } from '@/features/subscription';
import { AppText, Button } from '@/shared/ui';

/** Free plan only: how many AI uses remain today, with a way to get more. */
export function AiUsageHint({
  metric = 'ai_requests',
}: {
  metric?: 'ai_requests' | 'chat_messages' | 'quizzes' | 'flashcard_decks';
}) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const status = usePlanStatus();
  const meter = status.data?.usage.find((u) => u.metric === metric);
  if (status.data?.tier !== 'free' || !meter || meter.quota === null) return null;
  const remaining = Math.max(0, meter.quota - meter.used);
  return (
    <View style={styles.row} testID="ai-usage">
      <AppText
        variant="caption"
        color={remaining === 0 ? 'danger' : 'textSecondary'}
        style={styles.text}
      >
        {t('ai.remaining', {
          label: t(`subscription.metrics.${metric}`),
          remaining,
          quota: meter.quota,
        })}
      </AppText>
      {remaining <= 3 ? (
        <Button variant="ghost" label={t('ai.getMore')} onPress={() => router.push('/paywall')} />
      ) : null}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    text: { flex: 1 },
  });
