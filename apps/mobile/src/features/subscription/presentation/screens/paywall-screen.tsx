import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, useTheme, type Theme } from '@/core/theme';
import {
  AppText,
  Appear,
  Button,
  FormMessage,
  Icon,
  PressableScale,
  Screen,
  Skeleton,
  type IconName,
} from '@/shared/ui';

import type { PremiumPackage } from '../../domain/subscription';
import {
  usePlanStatus,
  usePremiumPackages,
  usePurchase,
  useRestorePurchases,
} from '../hooks/use-subscription';

const BENEFITS: {
  icon: IconName;
  key: 'benefitAi' | 'benefitUploads' | 'benefitQuizzes' | 'benefitSupport';
}[] = [
  { icon: 'creation', key: 'benefitAi' },
  { icon: 'cloud-upload-outline', key: 'benefitUploads' },
  { icon: 'cards-outline', key: 'benefitQuizzes' },
  { icon: 'heart-outline', key: 'benefitSupport' },
];

function PackageOption({
  pkg,
  selected,
  onPress,
}: {
  pkg: PremiumPackage;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const billed =
    pkg.period === 'yearly'
      ? t('subscription.perYear', { price: pkg.price })
      : t('subscription.perMonth', { price: pkg.price });
  const details = [
    pkg.period === 'yearly' && pkg.pricePerMonth
      ? t('subscription.equivalent', { price: pkg.pricePerMonth })
      : null,
    pkg.trialDays ? t('subscription.trialThen', { days: pkg.trialDays, price: billed }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale
      testID={`package-${pkg.period}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.package, selected && styles.packageSelected]}
    >
      <View style={styles.fill}>
        <View style={styles.row}>
          <AppText variant="bodyStrong">
            {pkg.period === 'yearly' ? t('subscription.yearly') : t('subscription.monthly')}
          </AppText>
          {pkg.savingsPercent ? (
            <View style={styles.badge}>
              <AppText variant="label" color="success">
                {t('subscription.save', { percent: pkg.savingsPercent })}
              </AppText>
            </View>
          ) : null}
        </View>
        {details ? (
          <AppText variant="caption" color="textSecondary">
            {details}
          </AppText>
        ) : null}
      </View>
      {/* The amount actually charged is the most prominent price (Google Play subscription policy). */}
      <AppText variant="bodyStrong">{billed}</AppText>
    </PressableScale>
  );
}

export function PaywallScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const toMessage = useErrorMessage();
  const status = usePlanStatus();
  const packages = usePremiumPackages();
  const purchase = usePurchase();
  const restore = useRestorePurchases();
  const [chosen, setSelected] = useState<string | null>(null);
  // Default to the first (best value) package until the user picks one.
  const selected = chosen ?? packages.data?.[0]?.id ?? null;

  if (status.data?.tier === 'premium') {
    return (
      <Screen edges={['bottom']} contentStyle={styles.center}>
        <Icon name="crown" size={64} color="warning" />
        <AppText variant="title" align="center">
          {t('subscription.active')}
        </AppText>
        <Button label={t('common.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']}>
      <LinearGradient
        colors={[colors.primary, colors.brandGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Icon name="crown" size={40} color="onPrimary" />
        <AppText variant="display" color="onPrimary" accessibilityRole="header">
          {t('subscription.paywallTitle')}
        </AppText>
        <AppText color="onPrimary">{t('subscription.paywallSubtitle')}</AppText>
      </LinearGradient>

      <View style={styles.benefits}>
        {BENEFITS.map((benefit, index) => (
          <Appear key={benefit.key} index={index} style={styles.row}>
            <View style={styles.benefitIcon}>
              <Icon name={benefit.icon} size={20} color="primaryText" />
            </View>
            <AppText style={styles.fill}>{t(`subscription.${benefit.key}`)}</AppText>
          </Appear>
        ))}
      </View>

      <View style={styles.packages} accessibilityRole="radiogroup">
        {packages.data
          ? packages.data.map((pkg) => (
              <PackageOption
                key={pkg.id}
                pkg={pkg}
                selected={selected === pkg.id}
                onPress={() => setSelected(pkg.id)}
              />
            ))
          : [0, 1].map((i) => <Skeleton key={i} height={72} radius={16} />)}
      </View>

      <FormMessage tone="error" message={toMessage(purchase.error ?? restore.error)} />
      <Button
        testID="subscribe"
        label={t('subscription.subscribe')}
        disabled={!selected}
        loading={purchase.isPending}
        onPress={() => selected && purchase.mutate(selected)}
      />
      <Button
        variant="ghost"
        label={t('subscription.restore')}
        loading={restore.isPending}
        onPress={() => restore.mutate()}
      />
      <AppText variant="caption" color="textSecondary" align="center">
        {t('subscription.renewalNotice')}
      </AppText>
    </Screen>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
    hero: { borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm },
    benefits: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    fill: { flex: 1 },
    benefitIcon: {
      width: 36,
      height: 36,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySubtle,
    },
    packages: { gap: spacing.sm },
    package: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    packageSelected: { borderColor: colors.primary, backgroundColor: colors.primarySubtle },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
      backgroundColor: colors.successSubtle,
    },
  });
