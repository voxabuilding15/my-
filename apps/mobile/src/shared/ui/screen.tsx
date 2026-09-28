import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useLayout } from '@/core/layout/use-layout';
import { useStyles, useTheme, type Theme } from '@/core/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  /** Keeps focused inputs above the keyboard (forms). Implies scroll. */
  keyboard?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh (scroll screens). */
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

/** Safe-area screen container; content is centred at a readable width on tablets. */
export function Screen({
  children,
  scroll = false,
  keyboard = false,
  edges = ['top'],
  contentStyle,
  refreshing,
  onRefresh,
}: ScreenProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { contentMaxWidth } = useLayout();
  const width = { maxWidth: contentMaxWidth };
  const body =
    scroll || keyboard ? (
      <ScrollView
        contentContainerStyle={[styles.content, width, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.content, styles.fill, width, contentStyle]}>{children}</View>
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
    content: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.lg,
    },
  });
