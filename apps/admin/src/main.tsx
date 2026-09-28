import './index.css';

import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { readEnv } from './env';
import { createAdminSupabase } from './lib/supabase';

const env = readEnv();
const root = createRoot(document.getElementById('root')!);

if (!env) {
  root.render(
    <main className="flex min-h-full items-center justify-center p-6 text-center text-sm">
      <p>
        Missing configuration. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>).
      </p>
    </main>,
  );
} else {
  if (env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: env.VITE_SENTRY_DSN,
      environment: env.VITE_ENVIRONMENT,
      tracesSampleRate: 0,
    });
  }
  root.render(
    <StrictMode>
      <Sentry.ErrorBoundary
        fallback={<p className="p-6 text-sm">Something went wrong. Reload the page.</p>}
      >
        <App client={createAdminSupabase(env)} />
      </Sentry.ErrorBoundary>
    </StrictMode>,
  );
}
