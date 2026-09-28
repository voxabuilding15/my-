// Bundles the service (and @studexa/shared, which ships TypeScript source) into dist/.
// Runtime dependencies stay external and are installed in the container image.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: { '@studexa/shared': '../../packages/shared/src/index.ts' },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
