import { LogOut, Menu, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useAuth, useStaff } from '@/auth/auth-context';

import { navFor } from './nav';
import { Badge, cx, Spinner } from './ui';

/** Sidebar on desktop; collapsible drawer on tablets and small windows. */
export function Layout() {
  const { user, role } = useStaff();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-5 overflow-y-auto p-3">
      {navFor(role).map((group) => (
        <div key={group.section}>
          <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {group.section}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                      isActive
                        ? 'bg-brand-subtle font-medium text-brand'
                        : 'text-ink hover:bg-canvas',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <span className="font-semibold">
            Studexa <span className="text-brand">Admin</span>
          </span>
          <button className="lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        {nav}
        <div className="mt-auto border-t border-line p-3 text-sm">
          <div className="truncate" title={user.email}>
            {user.email}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <Badge tone="brand">{role}</Badge>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1 text-muted hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>
      {open ? (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="font-semibold">Studexa Admin</span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 xl:p-8">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
