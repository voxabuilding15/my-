import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/core/storage/preferences-store';

import type { Script } from './fonts';
import { buildTheme, type ColorScheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const preference = usePreferencesStore((state) => state.theme);
  const system = useColorScheme();
  const { i18n } = useTranslation();
  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const script: Script = i18n.language === 'ar' ? 'arabic' : 'latin';

  const theme = useMemo(() => buildTheme(scheme, script), [scheme, script]);
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.border,
      },
      fonts: {
        regular: {
          fontFamily: theme.typography.body.fontFamily ?? 'System',
          fontWeight: 'normal' as const,
        },
        medium: {
          fontFamily: theme.typography.bodyStrong.fontFamily ?? 'System',
          fontWeight: 'normal' as const,
        },
        bold: {
          fontFamily: theme.typography.heading.fontFamily ?? 'System',
          fontWeight: 'normal' as const,
        },
        heavy: {
          fontFamily: theme.typography.title.fontFamily ?? 'System',
          fontWeight: 'normal' as const,
        },
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
