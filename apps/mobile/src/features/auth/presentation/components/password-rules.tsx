import { PASSWORD_RULES, unmetPasswordRules } from '@studexa/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Icon } from '@/shared/ui';

/** Live checklist mirroring the server's password policy. */
export function PasswordRules({ password }: { password: string }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const unmet = new Set(unmetPasswordRules(password));
  return (
    <View
      style={styles.list}
      accessibilityRole="summary"
      accessibilityLabel={t('auth.passwordRules.title')}
    >
      {PASSWORD_RULES.map((rule) => {
        const met = !unmet.has(rule);
        return (
          <View key={rule} style={styles.row} accessibilityState={{ checked: met }}>
            <Icon
              name={met ? 'check-circle' : 'circle-outline'}
              size={16}
              color={met ? 'success' : 'textDisabled'}
            />
            <AppText variant="caption" color={met ? 'text' : 'textSecondary'}>
              {t(`auth.passwordRules.${rule}`)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    list: { gap: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  });
