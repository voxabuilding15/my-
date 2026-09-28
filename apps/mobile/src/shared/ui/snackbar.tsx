import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

type SnackbarMessage = {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
};
type ShowSnackbar = (text: string, action?: SnackbarMessage['action']) => void;

const SnackbarContext = createContext<ShowSnackbar | null>(null);

/** Transient feedback ("Note saved", "Deleted · Undo"). Announced to screen readers. */
export function SnackbarProvider({ children }: PropsWithChildren) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback<ShowSnackbar>((text, action) => {
    counter.current += 1;
    setMessage({ id: counter.current, text, ...(action ? { action } : {}) });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), message.action ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View
          key={message.id}
          entering={FadeInDown.duration(250)}
          exiting={FadeOutDown.duration(150)}
          style={[styles.container, { bottom: 88 + insets.bottom }]}
          pointerEvents="box-none"
        >
          <View style={styles.snackbar} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <AppText style={styles.text} color="background">
              {message.text}
            </AppText>
            {message.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  message.action?.onPress();
                  setMessage(null);
                }}
              >
                <AppText variant="bodyStrong" color="primarySubtle">
                  {message.action.label}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): ShowSnackbar {
  const show = useContext(SnackbarContext);
  if (!show) throw new Error('useSnackbar must be used inside <SnackbarProvider>');
  return show;
}

const makeStyles = ({ colors, radii, spacing, elevation }: Theme) =>
  StyleSheet.create({
    container: { position: 'absolute', start: spacing.lg, end: spacing.lg, alignItems: 'center' },
    snackbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      maxWidth: 560,
      width: '100%',
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: colors.text,
      ...elevation.level3,
    },
    text: { flex: 1 },
  });
