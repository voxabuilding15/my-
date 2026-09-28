import { randomUUID } from 'node:crypto';

import { createProviderRegistry, createVoyageProvider } from '@studexa/ai';

import { createOcr } from './ai.ts';
import { loadConfig } from './config.ts';
import { createWorkerServer } from './server.ts';
import { createDocumentStore, createJobQueue, createServiceClient } from './supabase.ts';
import { createReporter, flushTelemetry, log } from './telemetry.ts';
import { drainQueue } from './worker.ts';

const config = loadConfig();
const client = createServiceClient(config);
const instance = `${config.K_REVISION}:${randomUUID().slice(0, 8)}`;
const store = createDocumentStore(client);
const queue = createJobQueue(client, 'document-processor', instance, config.K_REVISION);
const report = createReporter(config, client);
const services = {
  ocr: config.ANTHROPIC_API_KEY
    ? createOcr(
        client,
        createProviderRegistry({ anthropicApiKey: config.ANTHROPIC_API_KEY })('anthropic'),
      )
    : null,
  embeddings: config.VOYAGE_API_KEY
    ? createVoyageProvider({ apiKey: config.VOYAGE_API_KEY })
    : null,
};

const server = createWorkerServer({
  secret: config.WORKER_SECRET,
  log,
  run: () =>
    drainQueue(
      store,
      queue,
      {
        workerId: instance,
        concurrency: config.WORKER_CONCURRENCY,
        leaseSeconds: config.JOB_LEASE_SECONDS,
        budgetMs: config.RUN_BUDGET_SECONDS * 1000,
      },
      report,
      services,
    ),
});

server.listen(config.PORT, () => log('info', 'server.started', { port: config.PORT, instance }));

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight work, flush Sentry.
process.on('SIGTERM', () => {
  log('info', 'server.stopping');
  server.close(() => void flushTelemetry().finally(() => process.exit(0)));
});
