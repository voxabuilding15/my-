import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

type CodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label: string;
  error?: boolean;
  autoFocus?: boolean;
  testID?: string;
};

/**
 * One invisible input drawn as separate boxes: paste, OTP autofill and deletion all work natively.
 * Digits always read left-to-right, also in Arabic.
 *
 * The input covers the whole row of boxes (transparent text, no caret, no underline) instead of
 * being shrunk or faded out: a 1×1, zero-opacity input had no usable bounds, so TalkBack could
 * not focus it and UI automation (Maestro) could not find it by its test ID.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  label,
  error = false,
  autoFocus = true,
  testID,
}: CodeInputProps) {
  const styles = useStyles(makeStyles);
  const input = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View
        style={styles.row}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {Array.from({ length }, (_, index) => {
          const active = index === Math.min(value.length, length - 1);
          return (
            <View
              key={index}
              style={[styles.box, active && styles.active, error && styles.invalid]}
            >
              <AppText variant="title">{value[index] ?? ''}</AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        underlineColorAndroid="transparent"
        selectionColor="transparent"
        style={styles.input}
      />
    </Pressable>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', direction: 'ltr', justifyContent: 'center', gap: spacing.sm },
    box: {
      width: 48,
      height: 56,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    active: { borderColor: colors.primary, borderWidth: 2 },
    invalid: { borderColor: colors.danger },
    input: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      color: 'transparent',
      backgroundColor: 'transparent',
      padding: 0,
    },
  });
