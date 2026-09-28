import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/core/theme';
import type { IconName } from '@/shared/ui';

const TABS = [
  { name: 'index', label: 'tabs.home', icon: 'home-variant', iconOutline: 'home-variant-outline' },
  {
    name: 'documents',
    label: 'tabs.documents',
    icon: 'file-document-multiple',
    iconOutline: 'file-document-multiple-outline',
  },
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

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border },
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
