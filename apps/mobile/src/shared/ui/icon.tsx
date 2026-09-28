import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { useTheme, type ColorTokens } from '@/core/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type IconProps = { name: IconName; size?: number; color?: keyof ColorTokens };

export function Icon({ name, size = 24, color = 'text' }: IconProps) {
  const { colors } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={colors[color]} />;
}
