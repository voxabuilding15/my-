import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, useState, type ComponentType, type ReactNode } from 'react';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from 'react-router';

import { AuthProvider, useAuth, type StaffRole } from '@/auth/auth-context';
import { ChallengeScreen, EnrollScreen, NoAccessScreen, SignInScreen } from '@/auth/auth-screens';
import { Layout } from '@/components/layout';
import { NAV } from '@/components/nav';
import { Spinner } from '@/components/ui';
import { SupabaseContext } from '@/lib/api';

/** Each page is its own chunk: staff download only what they open. */
const page = <K extends string>(load: () => Promise<Record<K, unknown>>, name: K) => {
  const Page = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return <Page />;
};

const business = () => import('@/pages/business-pages');
const moderation = () => import('@/pages/moderation-pages');

const PAGES: Record<string, ReactNode> = {
  '/': page(() => import('@/pages/overview-page'), 'OverviewPage'),
  '/health': page(() => import('@/pages/health-page'), 'HealthPage'),
  '/errors': page(() => import('@/pages/errors-page'), 'ErrorsPage'),
  '/documents': page(() => import('@/pages/documents-page'), 'DocumentsPage'),
  '/storage': page(() => import('@/pages/storage-page'), 'StoragePage'),
  '/users': page(() => import('@/pages/users-page'), 'UsersPage'),
  '/subscriptions': page(business, 'SubscriptionsPage'),
  '/revenue': page(business, 'RevenuePage'),
  '/ai-usage': page(business, 'AiUsagePage'),
  '/analytics': page(business, 'EngagementPage'),
  '/flags': page(() => import('@/pages/flags-page'), 'FlagsPage'),
  '/config': page(() => import('@/pages/config-page'), 'ConfigPage'),
  '/announcements': page(() => import('@/pages/announcements-page'), 'AnnouncementsPage'),
  '/reports': page(moderation, 'ReportsPage'),
  '/audit': page(moderation, 'AuditPage'),
};
const userDetail = page(() => import('@/pages/user-detail-page'), 'UserDetailPage');

/** Routes the role may open; others redirect to the overview (the database refuses them anyway). */
export function routesFor(role: StaffRole): RouteObject[] {
  const allowed = NAV.flatMap((group) => group.items).filter((item) => item.roles.includes(role));
  const children: RouteObject[] = allowed.map((item) =>
    item.to === '/'
      ? { index: true, element: PAGES['/'] }
      : { path: item.to.slice(1), element: PAGES[item.to] },
  );
  if (allowed.some((item) => item.to === '/users'))
    children.push({ path: 'users/:id', element: userDetail });
  children.push({ path: '*', element: <Navigate to="/" replace /> });
  return [{ path: '/', element: <Layout />, children }];
}

function StaffRouter({ role, memory }: { role: StaffRole; memory?: string[] }) {
  const [router] = useState(() =>
    memory
      ? createMemoryRouter(routesFor(role), { initialEntries: memory })
      : createBrowserRouter(routesFor(role)),
  );
  return <RouterProvider router={router} />;
}

function Gate({ memory }: { memory?: string[] }) {
  const auth = useAuth();
  switch (auth.status) {
    case 'loading':
      return <Spinner label="Checking your session" />;
    case 'signed_out':
      return <SignInScreen />;
    case 'needs_enrollment':
      return <EnrollScreen />;
    case 'needs_challenge':
      return <ChallengeScreen factorId={auth.factorId} />;
    case 'no_access':
      return <NoAccessScreen />;
    case 'ready':
      // Keyed by role so a role change rebuilds the allowed routes.
      return <StaffRouter key={auth.role} role={auth.role} {...(memory ? { memory } : {})} />;
  }
}

export function App({ client, memory }: { client: SupabaseClient; memory?: string[] }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => !(error as { forbidden?: boolean }).forbidden && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <SupabaseContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Gate {...(memory ? { memory } : {})} />
        </AuthProvider>
      </QueryClientProvider>
    </SupabaseContext.Provider>
  );
}
