/** Connection details exported by run.sh (local Supabase, mocks, worker). */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run the suites with tests/integration/run.sh`);
  return value;
}

export const env = {
  supabaseUrl: required('SUPABASE_URL'),
  anonKey: required('SUPABASE_ANON_KEY'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  mockUrl: process.env.MOCK_URL ?? 'http://127.0.0.1:54400',
  workerUrl: process.env.WORKER_URL ?? 'http://127.0.0.1:54410',
  workerSecret: required('WORKER_SECRET'),
  /** Dummy secrets from supabase/functions/test.env. */
  revenueCatSecret: 'integration-test-revenuecat-secret-0000000',
  cronSecret: 'integration-test-cron-secret-000000000000000',
};

export const functionsUrl = (name: string) => `${env.supabaseUrl}/functions/v1/${name}`;
