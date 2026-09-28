import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/core/layout/use-layout';
import { duration, easing, usePrefersReducedMotion, useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title?: string | undefined;
}>;

/**
 * Modal bottom sheet: slides in (emphasized decelerate), fades out, drag down to dismiss.
 * Shown as a centred card on tablets.
 */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { useRail } = useLayout();
  const reduceMotion = usePrefersReducedMotion();
  const drag = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange((event) => {
      drag.set(Math.max(0, drag.get() + event.changeY));
    })
    .onEnd((event) => {
      if (drag.get() > 120 || event.velocityY > 800) runOnJS(onClose)();
      else drag.set(withTiming(0, { duration: duration.short }));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => drag.set(0)}
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <Animated.View
          accessibilityViewIsModal
          {...(reduceMotion
            ? {}
            : {
                entering: SlideInDown.duration(duration.medium).easing(easing.emphasizedDecelerate),
              })}
          style={[
            styles.sheet,
            useRail && styles.sheetWide,
            { paddingBottom: 16 + insets.bottom },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {title ? (
            <AppText variant="heading" style={styles.title} accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export type SheetAction = {
  key: string;
  icon: IconName;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/** A list of actions inside a bottom sheet (e.g. a document's rename / favourite / delete). */
export function ActionSheet({
  actions,
  ...sheet
}: Omit<BottomSheetProps, 'children'> & { actions: SheetAction[] }) {
  const styles = useStyles(makeStyles);
  return (
    <BottomSheet {...sheet}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          testID={`action-${action.key}`}
          accessibilityRole="button"
          onPress={() => {
            sheet.onClose();
            action.onPress();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Icon name={action.icon} color={action.destructive ? 'danger' : 'text'} />
          <AppText color={action.destructive ? 'danger' : 'text'}>{action.label}</AppText>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surfaceElevated,
      borderTopStartRadius: radii.xl,
      borderTopEndRadius: radii.xl,
      paddingHorizontal: spacing.lg,
      gap: spacing.xs,
    },
    sheetWide: {
      alignSelf: 'center',
      width: 560,
      marginBottom: spacing.xl,
      borderRadius: radii.xl,
    },
    handleArea: { alignItems: 'center', paddingVertical: spacing.md },
    handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.border },
    title: { marginBottom: spacing.sm },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      minHeight: 56,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
    },
    actionPressed: { backgroundColor: colors.surface },
  });
