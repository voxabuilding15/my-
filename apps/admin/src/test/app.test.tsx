import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/app';
import { resolveAuthState } from '@/auth/auth-context';

import { createFakeClient } from './fake-client';

const session = { user: { id: 'staff-1', email: 'staff@studexa.app' } };

describe('resolveAuthState', () => {
  it('walks sign-in → two-factor setup → challenge → access', async () => {
    expect((await resolveAuthState(createFakeClient().client)).status).toBe('signed_out');
    expect(
      (
        await resolveAuthState(
          createFakeClient({ session, rpc: { staff_role: () => null } }).client,
        )
      ).status,
    ).toBe('needs_enrollment');
    expect(
      await resolveAuthState(
        createFakeClient({
          session,
          rpc: { staff_role: () => null },
          factors: [{ id: 'f1', status: 'verified' }],
        }).client,
      ),
    ).toMatchObject({ status: 'needs_challenge', factorId: 'f1' });
    expect(
      (
        await resolveAuthState(
          createFakeClient({ session, rpc: { staff_role: () => null }, aal: 'aal2' }).client,
        )
      ).status,
    ).toBe('no_access');
    expect(
      await resolveAuthState(
        createFakeClient({ session, rpc: { staff_role: () => 'support' }, aal: 'aal2' }).client,
      ),
    ).toMatchObject({
      status: 'ready',
      role: 'support',
    });
  });
});

const overview = {
  users_total: 12500,
  signups_7d: 340,
  active_users_today: 2100,
  active_users_7d_avg: 1900,
  premium_active: 625,
  ai_requests_today: 8800,
  ai_cost_today_usd: 41.2,
  ai_cost_30d_usd: 1120,
  revenue_30d_usd: 2480.5,
  errors_24h: 12,
  documents_processing: 3,
  documents_failed_7d: 4,
  jobs_queued: 3,
  jobs_dead: 0,
};

describe('dashboard', () => {
  it('shows the sign-in form when signed out', async () => {
    render(<App client={createFakeClient().client} memory={['/']} />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('asks for the authenticator code when a factor exists', async () => {
    const { client } = createFakeClient({
      session,
      rpc: { staff_role: () => null },
      factors: [{ id: 'f1', status: 'verified' }],
    });
    render(<App client={client} memory={['/']} />);
    expect(
      await screen.findByRole('heading', { name: 'Two-factor verification' }),
    ).toBeInTheDocument();
  });

  it('shows the overview and only the pages a support role may use', async () => {
    const { client } = createFakeClient({
      session,
      rpc: { staff_role: () => 'support', admin_overview: () => overview },
    });
    render(<App client={client} memory={['/']} />);
    // First test in the file: it also pays for loading the lazily imported pages.
    expect(await screen.findByText('12,500', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('$2,480.50')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Users');
    expect(nav).not.toHaveTextContent('Revenue');
  });

  it('lets an admin toggle a feature flag', async () => {
    const { client, calls } = createFakeClient({
      session,
      rpc: {
        staff_role: () => 'admin',
        admin_overview: () => overview,
        admin_timeseries: () => [],
      },
      tables: {
        feature_flags: [
          {
            key: 'ai.mind_map',
            description: 'Mind map tool',
            enabled: true,
            rollout_percent: 100,
            platforms: ['android'],
            min_app_version: null,
            tiers: null,
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });
    render(<App client={client} memory={['/flags']} />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle ai.mind_map' }));
    await waitFor(() => {
      const update = calls.find(
        (c) => c.target === 'feature_flags' && c.chain[0]?.[0] === 'update',
      );
      expect(update?.chain[0]).toEqual(['update', [{ enabled: false }]]);
      expect(update?.chain[1]).toEqual(['match', [{ key: 'ai.mind_map' }]]);
    });
  });

  it('keeps analysts away from user pages', async () => {
    const { client } = createFakeClient({
      session,
      rpc: {
        staff_role: () => 'analyst',
        admin_overview: () => overview,
        admin_timeseries: () => [],
      },
    });
    render(<App client={client} memory={['/users/abc']} />);
    // Unknown routes for the role fall back to the overview.
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });
});
