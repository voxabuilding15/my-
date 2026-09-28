import type { TextStyle, ViewStyle } from 'react-native';

import { FONT_FAMILIES, type FontWeightName, type Script } from './fonts';

/** Brand blue taken from the Studexa mark. */
const BRAND = '#0066FF';

const light = {
  background: '#FFFFFF',
  surface: '#F5F7FB',
  surfaceContainer: '#EEF1F7',
  surfaceElevated: '#FFFFFF',
  border: '#E3E7EF',
  text: '#0B1220',
  textSecondary: '#5B6475',
  textDisabled: '#A3AAB8',
  primary: BRAND,
  primaryPressed: '#0052CC',
  /** Brand color for text/icons on the background; meets WCAG AA in both schemes. */
  primaryText: '#005AE0',
  primarySubtle: '#E6F0FF',
  onPrimary: '#FFFFFF',
  success: '#0D7940',
  successSubtle: '#E3F6EA',
  warning: '#9A5C00',
  warningSubtle: '#FFF3DC',
  danger: '#CB252B',
  dangerSubtle: '#FDE8E9',
  onDanger: '#FFFFFF',
  /** End colour of brand gradients; white text stays AA on the whole gradient in both schemes. */
  brandGradientEnd: '#4C2BCF',
  overlay: 'rgba(11, 18, 32, 0.4)',
  shadow: '#0B1220',
  // Feature accents (Duolingo-style colour coding), each with an AA-legible "on" colour.
  streak: '#AC5200',
  streakSubtle: '#FFEEDC',
  flashcards: '#00766A',
  flashcardsSubtle: '#DDF5F2',
  quizzes: '#6B3FE0',
  quizzesSubtle: '#EEE8FD',
  notes: '#BD3F0C',
  notesSubtle: '#FDECE3',
  chat: '#0B6CB8',
  chatSubtle: '#E2F1FC',
};

export type ColorTokens = typeof light;

const dark: ColorTokens = {
  background: '#0A0A0C',
  surface: '#141519',
  surfaceContainer: '#1A1B20',
  surfaceElevated: '#1F2026',
  border: '#2A2C33',
  text: '#F4F6FA',
  textSecondary: '#9AA1AE',
  textDisabled: '#5A606B',
  primary: BRAND,
  primaryPressed: '#0052CC',
  primaryText: '#5C9DFF',
  primarySubtle: '#0B1F40',
  onPrimary: '#FFFFFF',
  success: '#3DD68C',
  successSubtle: '#0E2A1C',
  warning: '#FFB224',
  warningSubtle: '#2E2208',
  danger: '#FF6369',
  dangerSubtle: '#3A1215',
  onDanger: '#1A0506',
  brandGradientEnd: '#4C2BCF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
  streak: '#FF9A3D',
  streakSubtle: '#33200C',
  flashcards: '#3FD4C4',
  flashcardsSubtle: '#0B2A27',
  quizzes: '#A98BFF',
  quizzesSubtle: '#221A3D',
  notes: '#FF9466',
  notesSubtle: '#34190E',
  chat: '#5CB8FF',
  chatSubtle: '#0C2436',
};

export const palettes = { light, dark } as const;
export type ColorScheme = keyof typeof palettes;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

type TypeSpec = { size: number; line: number; weight: FontWeightName; tracking?: number };

const TYPE_SCALE = {
  display: { size: 32, line: 40, weight: 'bold', tracking: -0.5 },
  title: { size: 24, line: 32, weight: 'bold', tracking: -0.3 },
  heading: { size: 18, line: 26, weight: 'semibold' },
  body: { size: 16, line: 24, weight: 'regular' },
  bodyStrong: { size: 16, line: 24, weight: 'semibold' },
  caption: { size: 13, line: 18, weight: 'regular' },
  label: { size: 12, line: 16, weight: 'semibold', tracking: 0.4 },
} as const satisfies Record<string, TypeSpec>;

export type TypographyVariant = keyof typeof TYPE_SCALE;
export type Typography = Record<TypographyVariant, TextStyle>;

/** Arabic glyphs need taller lines and no tracking to stay legible. */
function buildTypography(script: Script): Typography {
  const families = FONT_FAMILIES[script];
  const lineFactor = script === 'arabic' ? 1.15 : 1;
  return Object.fromEntries(
    Object.entries(TYPE_SCALE).map(([name, spec]: [string, TypeSpec]) => [
      name,
      {
        fontFamily: families[spec.weight],
        fontSize: spec.size,
        lineHeight: Math.round(spec.line * lineFactor),
        letterSpacing: script === 'arabic' ? 0 : (spec.tracking ?? 0),
      },
    ]),
  ) as Typography;
}

/** Material 3 elevation levels (shadow on iOS, elevation on Android). */
function buildElevation(colors: ColorTokens) {
  const level = (elevation: number, opacity: number, radius: number, y: number): ViewStyle => ({
    shadowColor: colors.shadow,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: y },
    elevation,
  });
  return {
    level0: {} as ViewStyle,
    level1: level(1, 0.06, 3, 1),
    level2: level(3, 0.08, 8, 3),
    level3: level(6, 0.12, 16, 6),
  };
}

export type Theme = {
  scheme: ColorScheme;
  script: Script;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: Typography;
  elevation: ReturnType<typeof buildElevation>;
};

export function buildTheme(scheme: ColorScheme, script: Script = 'latin'): Theme {
  const colors = palettes[scheme];
  return {
    scheme,
    script,
    colors,
    spacing,
    radii,
    typography: buildTypography(script),
    elevation: buildElevation(colors),
  };
}
