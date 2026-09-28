import DateTimePicker from '@react-native-community/datetimepicker';
import { APP_LOCALES, type AppLocale } from '@studexa/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { restartApp } from '@/core/app/restart';
import { changeLocale, deviceLocale } from '@/core/i18n';
import { openLegalPage, useLegalLinks } from '@/core/legal/legal-links';
import { applyStudyReminders } from '@/core/notifications/study-reminders';
import { usePreferencesStore, type ThemePreference } from '@/core/storage/preferences-store';
import { useStyles, useTheme, type Theme } from '@/core/theme';
import { PlanCard } from '@/features/subscription';
import {
  AppText,
  Chip,
  FormMessage,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  SegmentedControl,
} from '@/shared/ui';

const LANGUAGE_NAMES: Record<AppLocale, string> = { en: 'English', ar: 'العربية', fr: 'Français' };
const GOALS = [10, 20, 30, 45, 60];

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const links = useLegalLinks();
  const prefs = usePreferencesStore();
  const [pickingTime, setPickingTime] = useState(false);
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const reminderTime = new Date(2026, 0, 4, prefs.reminder.hour, prefs.reminder.minute);

  const setLanguage = async (locale: AppLocale | null) => {
    prefs.setLocale(locale);
    const { restartRequired } = await changeLocale(locale ?? deviceLocale());
    if (restartRequired) {
      Alert.alert(t('settings.restartTitle'), t('settings.restartBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.restartNow'), onPress: () => void restartApp() },
      ]);
    }
  };

  const updateReminder = async (next: typeof prefs.reminder) => {
    prefs.setReminder(next);
    const result = await applyStudyReminders(next, {
      title: t('settings.reminderTitle'),
      body: t('settings.reminderBody'),
    });
    setNotificationsDenied(result === 'denied');
    if (result === 'denied') prefs.setReminder({ ...next, enabled: false });
  };

  return (
    <Screen scroll edges={['bottom']}>
      <ScreenHeader title={t('settings.title')} />

      <PlanCard />

      <Section title={t('settings.appearance')}>
        <View style={styles.block}>
          <AppText variant="bodyStrong">{t('settings.theme')}</AppText>
          <SegmentedControl<ThemePreference>
            testID="theme"
            value={prefs.theme}
            onChange={prefs.setTheme}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
          <AppText variant="bodyStrong">{t('settings.language')}</AppText>
          <View style={styles.chips}>
            <Chip
              testID="language-system"
              label={t('settings.languageSystem')}
              selected={prefs.locale === null}
              onPress={() => void setLanguage(null)}
            />
            {APP_LOCALES.map((locale) => (
              <Chip
                key={locale}
                testID={`language-${locale}`}
                label={LANGUAGE_NAMES[locale]}
                selected={prefs.locale === locale}
                onPress={() => void setLanguage(locale)}
              />
            ))}
          </View>
        </View>
      </Section>

      <Section title={t('settings.notifications')}>
        <View style={styles.block}>
          <View style={styles.switchRow}>
            <AppText style={styles.fill}>{t('settings.dailyReminder')}</AppText>
            <Switch
              testID="reminder-switch"
              accessibilityLabel={t('settings.dailyReminder')}
              value={prefs.reminder.enabled}
              onValueChange={(enabled) => void updateReminder({ ...prefs.reminder, enabled })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {notificationsDenied ? (
            <View style={styles.block}>
              <FormMessage tone="info" message={t('settings.notificationsDenied')} />
              <Chip
                label={t('settings.openSystemSettings')}
                onPress={() => void Linking.openSettings()}
              />
            </View>
          ) : null}
          {prefs.reminder.enabled ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickingTime(true)}
                style={styles.switchRow}
              >
                <AppText style={styles.fill}>{t('settings.reminderTime')}</AppText>
                <AppText variant="bodyStrong" color="primaryText">
                  {new Intl.DateTimeFormat(i18n.language, {
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(reminderTime)}
                </AppText>
              </Pressable>
              {pickingTime ? (
                <DateTimePicker
                  value={reminderTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, date) => {
                    setPickingTime(Platform.OS === 'ios');
                    if (date)
                      void updateReminder({
                        ...prefs.reminder,
                        hour: date.getHours(),
                        minute: date.getMinutes(),
                      });
                  }}
                />
              ) : null}
              <AppText>{t('settings.studyDays')}</AppText>
              <View style={styles.chips}>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const selected = prefs.reminder.days.includes(day);
                  return (
                    <Chip
                      key={day}
                      label={weekday.format(new Date(2026, 0, 4 + day))}
                      selected={selected}
                      onPress={() =>
                        void updateReminder({
                          ...prefs.reminder,
                          days: selected
                            ? prefs.reminder.days.filter((d) => d !== day)
                            : [...prefs.reminder.days, day].sort(),
                        })
                      }
                    />
                  );
                })}
              </View>
            </>
          ) : null}
          <AppText variant="bodyStrong">{t('settings.dailyGoal')}</AppText>
          <View style={styles.chips}>
            {GOALS.map((minutes) => (
              <Chip
                key={minutes}
                label={t('settings.goalMinutes', { count: minutes })}
                selected={prefs.dailyGoalMinutes === minutes}
                onPress={() => prefs.setDailyGoal(minutes)}
              />
            ))}
          </View>
        </View>
      </Section>

      <Section title={t('settings.account')}>
        <ListRow
          icon="account-outline"
          label={t('tabs.profile')}
          onPress={() => router.push('/profile')}
        />
        <ListRow
          icon="crown-outline"
          label={t('settings.subscription')}
          onPress={() => router.push('/paywall')}
        />
      </Section>

      <Section title={t('settings.privacy')}>
        <ListRow
          icon="shield-lock-outline"
          label={t('profile.privacy')}
          onPress={() => openLegalPage(links.privacyUrl)}
        />
        <ListRow
          icon="file-document-outline"
          label={t('profile.terms')}
          onPress={() => openLegalPage(links.termsUrl)}
        />
      </Section>
    </Screen>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    block: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceElevated },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.md },
    fill: { flex: 1 },
  });
