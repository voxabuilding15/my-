import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['suites/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Suites share one backend; files run one after another, tests inside a file in order.
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/integration.json' },
  },
});
