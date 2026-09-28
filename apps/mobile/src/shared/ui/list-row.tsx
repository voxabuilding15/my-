import { I18nManager, Pressable, StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type ListRowProps = {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  testID?: string;
};

export function ListRow({
  icon,
  label,
  value,
  onPress,
  destructive = false,
  testID,
}: ListRowProps) {
  const styles = useStyles(makeStyles);
  const color = destructive ? 'danger' : 'text';
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={destructive ? 'danger' : 'textSecondary'} />
      <View style={styles.text}>
        <AppText color={color}>{label}</AppText>
        {value ? (
          <AppText variant="caption" color="textSecondary">
            {value}
          </AppText>
        ) : null}
      </View>
      {onPress ? (
        <Icon
          name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'}
          size={20}
          color="textDisabled"
        />
      ) : null}
    </Pressable>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surfaceElevated,
    },
    pressed: { backgroundColor: colors.surface },
    text: { flex: 1, gap: spacing.xxs },
  });
