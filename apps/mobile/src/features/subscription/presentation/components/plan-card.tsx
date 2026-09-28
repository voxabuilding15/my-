import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Button, Card, Icon, ProgressBar, Skeleton } from '@/shared/ui';

import { usePlanStatus } from '../hooks/use-subscription';

const METRICS = ['ai_requests', 'uploads', 'quizzes', 'flashcard_decks'] as const;

/** Current plan and usage meters (limits come from the server's plan_limits). */
export function PlanCard() {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const status = usePlanStatus();
  if (!status.data) return <Skeleton height={180} radius={16} />;
  const premium = status.data.tier === 'premium';

  return (
    <Card
      variant={premium ? 'filled' : 'outlined'}
      style={premium ? styles.premium : undefined}
      testID="plan-card"
    >
      <View style={styles.row}>
        <Icon
          name={premium ? 'crown' : 'account-school-outline'}
          color={premium ? 'warning' : 'primaryText'}
        />
        <AppText variant="heading" style={styles.fill}>
          {premium ? t('subscription.premium') : t('subscription.free')}
        </AppText>
      </View>
      {premium && status.data.renewsAt ? (
        <AppText variant="caption" color="textSecondary">
          {t('subscription.renews', {
            date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
              new Date(status.data.renewsAt),
            ),
          })}
        </AppText>
      ) : null}
      <AppText variant="label" color="textSecondary">
        {t('subscription.usage').toUpperCase()}
      </AppText>
      {METRICS.map((metric) => {
        const meter = status.data.usage.find((u) => u.metric === metric);
        if (!meter) return null;
        const label = t(`subscription.metrics.${metric}`);
        const value =
          meter.quota === null
            ? t('subscription.unlimited')
            : t('subscription.usageOf', { used: meter.used, quota: meter.quota });
        return (
          <View key={metric} style={styles.meter}>
            <View style={styles.row}>
              <AppText variant="caption" style={styles.fill}>
                {label}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {value}
              </AppText>
            </View>
            {meter.quota !== null ? (
              <ProgressBar
                progress={meter.used / meter.quota}
                height={6}
                color={meter.used >= meter.quota ? 'danger' : 'primary'}
                accessibilityLabel={`${label}: ${value}`}
              />
            ) : null}
          </View>
        );
      })}
      {premium ? null : (
        <Button
          testID="upgrade"
          label={t('subscription.upgrade')}
          icon={<Icon name="crown-outline" size={20} color="onPrimary" />}
          onPress={() => router.push('/paywall')}
        />
      )}
    </Card>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    premium: { backgroundColor: colors.warningSubtle },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fill: { flex: 1 },
    meter: { gap: spacing.xs },
  });
