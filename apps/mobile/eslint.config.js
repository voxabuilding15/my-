const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'],
  },
  {
    rules: {
      // Features may only depend on core/, shared/ and their own internals.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*/*'], message: 'Import a feature through its index.ts.' },
          ],
        },
      ],
    },
  },
]);
