import type { TextStyle } from 'react-native';

/** Brand blue taken from the Studexa mark. */
const BRAND = '#0066FF';

const light = {
  background: '#FFFFFF',
  surface: '#F5F7FB',
  surfaceElevated: '#FFFFFF',
  border: '#E3E7EF',
  text: '#0B1220',
  textSecondary: '#5B6475',
  textDisabled: '#A3AAB8',
  primary: BRAND,
  primaryPressed: '#0052CC',
  /** Brand color for text/icons on the background; meets WCAG AA in both schemes. */
  primaryText: BRAND,
  primarySubtle: '#E6F0FF',
  onPrimary: '#FFFFFF',
  success: '#12A150',
  warning: '#D98A00',
  danger: '#E5484D',
  overlay: 'rgba(11, 18, 32, 0.4)',
};

export type ColorTokens = typeof light;

const dark: ColorTokens = {
  background: '#0A0A0C',
  surface: '#141519',
  surfaceElevated: '#1C1D22',
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
  warning: '#FFB224',
  danger: '#FF6369',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const palettes = { light, dark } as const;
export type ColorScheme = keyof typeof palettes;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
} as const satisfies Record<string, TextStyle>;
export type TypographyVariant = keyof typeof typography;

export const motion = { fast: 150, normal: 250, slow: 400 } as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  motion: typeof motion;
};

export function buildTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: palettes[scheme], spacing, radii, typography, motion };
}
