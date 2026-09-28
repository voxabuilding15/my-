import {
  Activity,
  BarChart3,
  Bot,
  CreditCard,
  DollarSign,
  FileText,
  Flag,
  HardDrive,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings2,
  ShieldAlert,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { StaffRole } from '@/auth/auth-context';

export type NavItem = { to: string; label: string; icon: LucideIcon; roles: StaffRole[] };

const ALL: StaffRole[] = ['admin', 'support', 'analyst'];

/** Mirrors the database's role checks, so staff only see pages they can use. */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Monitor',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, roles: ALL },
      { to: '/health', label: 'System health', icon: Activity, roles: ALL },
      { to: '/errors', label: 'Errors', icon: TriangleAlert, roles: ['admin', 'support'] },
      { to: '/documents', label: 'Documents', icon: FileText, roles: ALL },
      { to: '/storage', label: 'Storage', icon: HardDrive, roles: ALL },
    ],
  },
  {
    section: 'Business',
    items: [
      { to: '/users', label: 'Users', icon: Users, roles: ['admin', 'support'] },
      { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard, roles: ALL },
      { to: '/revenue', label: 'Revenue', icon: DollarSign, roles: ['admin', 'analyst'] },
      { to: '/ai-usage', label: 'AI usage', icon: Bot, roles: ['admin', 'analyst'] },
      { to: '/analytics', label: 'Engagement', icon: BarChart3, roles: ['admin', 'analyst'] },
    ],
  },
  {
    section: 'Configure',
    items: [
      { to: '/flags', label: 'Feature flags', icon: Flag, roles: ['admin', 'support', 'analyst'] },
      { to: '/config', label: 'Remote config', icon: Settings2, roles: ['admin'] },
      {
        to: '/announcements',
        label: 'Announcements',
        icon: Megaphone,
        roles: ['admin', 'support', 'analyst'],
      },
      { to: '/reports', label: 'Reports', icon: ShieldAlert, roles: ['admin'] },
      { to: '/audit', label: 'Audit log', icon: ScrollText, roles: ['admin'] },
    ],
  },
];

export const navFor = (role: StaffRole) =>
  NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
