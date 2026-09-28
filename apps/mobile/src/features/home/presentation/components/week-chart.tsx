import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText } from '@/shared/ui';

/** Minutes per day for the last 7 days (oldest first). Bars grow from the bottom; order follows reading direction. */
export function WeekChart({
  minutes,
  goal,
  today,
}: {
  minutes: number[];
  goal: number;
  today: Date;
}) {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const max = Math.max(goal, ...minutes, 1);
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
  const total = minutes.reduce((sum, value) => sum + value, 0);

  return (
    <View
      accessible
      accessibilityLabel={t('home.weekMinutes', { minutes: total })}
      style={styles.chart}
    >
      {minutes.map((value, index) => {
        const date = new Date(today.getTime() - (minutes.length - 1 - index) * 86_400_000);
        const isToday = index === minutes.length - 1;
        return (
          <View key={index} style={styles.column}>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.max(4, (value / max) * 100)}%` },
                  value >= goal ? styles.barGoal : value > 0 ? styles.barSome : styles.barNone,
                ]}
              />
            </View>
            <AppText variant="label" color={isToday ? 'text' : 'textSecondary'}>
              {weekday.format(date)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    chart: { flexDirection: 'row', gap: spacing.sm, height: 112 },
    column: { flex: 1, alignItems: 'center', gap: spacing.xs },
    track: { flex: 1, width: '100%', maxWidth: 28, justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: radii.sm },
    barGoal: { backgroundColor: colors.primary },
    barSome: { backgroundColor: colors.primarySubtle },
    barNone: { backgroundColor: colors.surfaceContainer },
  });
