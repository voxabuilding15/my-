import { Text, type TextProps } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/core/theme';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
  align?: 'auto' | 'center';
};

export function AppText({
  variant = 'body',
  color = 'text',
  align = 'auto',
  style,
  ...rest
}: AppTextProps) {
  const { typography, colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[typography[variant], { color: colors[color], textAlign: align }, style]}
      maxFontSizeMultiplier={1.6}
    />
  );
}
