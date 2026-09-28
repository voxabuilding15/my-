import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useStyles, type Theme } from '@/core/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function Screen({ children, scroll = false, edges = ['top'], contentStyle }: ScreenProps) {
  const styles = useStyles(makeStyles);
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]}>{children}</ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
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
