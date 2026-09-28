import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';

import { useLayout } from '@/core/layout/use-layout';
import { useTheme } from '@/core/theme';
import type { IconName } from '@/shared/ui';

const TABS = [
  { name: 'index', label: 'tabs.home', icon: 'home-variant', iconOutline: 'home-variant-outline' },
  { name: 'documents', label: 'tabs.documents', icon: 'bookshelf', iconOutline: 'bookshelf' },
  {
    name: 'chat',
    label: 'tabs.chat',
    icon: 'chat-processing',
    iconOutline: 'chat-processing-outline',
  },
  { name: 'study', label: 'tabs.study', icon: 'cards', iconOutline: 'cards-outline' },
  {
    name: 'profile',
    label: 'tabs.profile',
    icon: 'account-circle',
    iconOutline: 'account-circle-outline',
  },
] as const satisfies readonly {
  name: string;
  label: string;
  icon: IconName;
  iconOutline: IconName;
}[];

/** Bottom navigation bar on phones; Material navigation rail on tablets (start edge, RTL-aware). */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { useRail } = useLayout();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarPosition: useRail ? (I18nManager.isRTL ? 'right' : 'left') : 'bottom',
        tabBarVariant: useRail ? 'material' : 'uikit',
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: typography.label.fontFamily, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons
                name={focused ? tab.icon : tab.iconOutline}
                color={color}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
