import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ReminderSettings } from '@/core/storage/preferences-store';

const CHANNEL_ID = 'study-reminders';

export type ReminderPermission = 'granted' | 'denied';

/** Local, on-device study reminders (no server needed). Replaces any previous schedule. */
export async function applyStudyReminders(
  settings: ReminderSettings,
  content: { title: string; body: string },
): Promise<ReminderPermission> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled || settings.days.length === 0) return 'granted';

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: content.title,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Promise.all(
    settings.days.map((day) =>
      Notifications.scheduleNotificationAsync({
        content: { title: content.title, body: content.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          channelId: CHANNEL_ID,
          weekday: day + 1, // expo-notifications: 1 = Sunday
          hour: settings.hour,
          minute: settings.minute,
        },
      }),
    ),
  );
  return 'granted';
}
