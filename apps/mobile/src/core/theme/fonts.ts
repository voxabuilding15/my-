export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';
export type Script = 'latin' | 'arabic';

/**
 * Family names equal the font file names, which is how Android registers fonts embedded by the
 * expo-font config plugin; runtime loading registers the same names (Expo Go, web, tests).
 * Weights are separate families: setting fontWeight on a custom font makes Android synthesise it.
 */
export const FONT_FAMILIES: Record<Script, Record<FontWeightName, string>> = {
  latin: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  arabic: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
  },
};
