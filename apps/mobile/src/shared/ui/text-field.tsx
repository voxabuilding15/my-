import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useStyles, useTheme, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null | undefined;
  hint?: string;
  /** Adds a show/hide toggle and hides the value by default. */
  password?: boolean;
  showPasswordLabel?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, password = false, showPasswordLabel = 'Show password', ...inputProps },
  ref,
) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.container}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <View style={[styles.field, focused && styles.focused, error ? styles.invalid : null]}>
        <TextInput
          ref={ref}
          {...inputProps}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          secureTextEntry={password && !revealed}
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPasswordLabel}
            accessibilityState={{ checked: revealed }}
            hitSlop={12}
            onPress={() => setRevealed((value) => !value)}
          >
            <Icon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="textSecondary"
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const makeStyles = ({ colors, radii, spacing, typography }: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    focused: { borderColor: colors.primary },
    invalid: { borderColor: colors.danger },
    input: {
      flex: 1,
      ...typography.body,
      color: colors.text,
      paddingVertical: spacing.sm,
      textAlign: 'auto',
    },
  });
