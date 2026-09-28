import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useStyles, type Theme } from '@/core/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  /** Keeps focused inputs above the keyboard (forms). Implies scroll. */
  keyboard?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function Screen({
  children,
  scroll = false,
  keyboard = false,
  edges = ['top'],
  contentStyle,
}: ScreenProps) {
  const styles = useStyles(makeStyles);
  const body =
    scroll || keyboard ? (
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
    );
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    fill: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.lg },
  });
