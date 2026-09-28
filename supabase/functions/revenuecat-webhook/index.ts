import { getBillingEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { createAdminClient, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import { type BillingResult, createRevenueCatWebhookHandler } from './handler.ts';

const env = getBillingEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);

const handler = createRevenueCatWebhookHandler({
  secret: env.REVENUECAT_WEBHOOK_SECRET,
  applyEvent: (event) => rpc<BillingResult>(admin, 'apply_billing_event', { p_event: event }),
});

Deno.serve(withHttp('revenuecat-webhook', handler));
