import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useStyles, useTheme, type Theme } from '@/core/theme';

import { Icon } from './icon';

type SearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  testID?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  clearLabel,
  testID,
}: SearchBarProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.bar}>
      <Icon name="magnify" size={22} color="textSecondary" />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.input}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={12}
          onPress={() => onChangeText('')}
        >
          <Icon name="close-circle" size={20} color="textSecondary" />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing, typography }: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceContainer,
    },
    input: {
      flex: 1,
      ...typography.body,
      color: colors.text,
      paddingVertical: spacing.sm,
      textAlign: 'auto',
    },
  });
