import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/core/storage/preferences-store';

import { buildTheme, type ColorScheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const preference = usePreferencesStore((state) => state.theme);
  const system = useColorScheme();
  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surfaceElevated,
        text: theme.colors.text,
        border: theme.colors.border,
      },
    };
  }, [scheme, theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/**
 * Memoised theme-aware styles. Define the factory at module scope and have it return
 * `StyleSheet.create(...)`: `const styles = useStyles(makeStyles)`.
 */
export function useStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
