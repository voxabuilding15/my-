const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'],
  },
  {
    // Features depend on core/, shared/ and each other's public index.ts only. The composition
    // root (src/composition) and data adapters (src/data) are infrastructure and may wire internals.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*/*'], message: 'Import a feature through its index.ts.' },
            {
              group: ['@/data/*', '@/composition/*'],
              message: 'Features must not depend on data adapters or the composition root.',
            },
          ],
        },
      ],
    },
  },
]);
