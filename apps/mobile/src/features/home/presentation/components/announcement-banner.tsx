import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { localize, useClientConfig } from '@/core/remote-config';
import { usePreferencesStore } from '@/core/storage/preferences-store';
import { useStyles, type Theme } from '@/core/theme';
import { AppText, Button, Card, IconButton } from '@/shared/ui';

/** The highest-priority active announcement from the admin dashboard, until dismissed. */
export function AnnouncementBanner() {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const { data } = useClientConfig();
  const dismissed = usePreferencesStore((state) => state.dismissedAnnouncements);
  const dismiss = usePreferencesStore((state) => state.dismissAnnouncement);

  const announcement = data?.announcements.find((a) => !a.dismissible || !dismissed.includes(a.id));
  if (!announcement) return null;

  const locale = i18n.language;
  const open = (url: string) => {
    if (url.startsWith('studexa://')) router.push(url.replace('studexa://', '/') as Href);
    else void WebBrowser.openBrowserAsync(url);
  };

  return (
    <Card variant="filled" testID="announcement">
      <View style={styles.row} accessibilityRole="summary">
        <View style={styles.text}>
          <AppText variant="bodyStrong">{localize(announcement.title, locale)}</AppText>
          <AppText color="textSecondary">{localize(announcement.body, locale)}</AppText>
        </View>
        {announcement.dismissible ? (
          <IconButton
            icon="close"
            size={20}
            accessibilityLabel={t('common.dismiss')}
            onPress={() => dismiss(announcement.id)}
          />
        ) : null}
      </View>
      {announcement.cta_label && announcement.cta_url ? (
        <View style={styles.cta}>
          <Button
            variant="secondary"
            label={localize(announcement.cta_label, locale)}
            onPress={() => open(announcement.cta_url ?? '')}
          />
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    text: { flex: 1, gap: spacing.xs },
    cta: { marginTop: spacing.md, alignItems: 'flex-start' },
  });
