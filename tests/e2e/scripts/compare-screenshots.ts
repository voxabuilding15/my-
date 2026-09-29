/**
 * Visual regression: compares this run's screenshots with the committed baselines for the
 * device (tests/e2e/baselines/<device>/). A screen fails when more than 1% of its pixels
 * differ (anti-aliasing tolerated). Missing baselines are reported, not failed: download the
 * run's screenshots artifact and commit them to create or update baselines.
 *
 *   pnpm --filter @studexa/e2e compare <screenshotsDir> <device> <out.json>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const [dir = 'reports/screenshots', device = 'phone', out = 'reports/visual.json'] =
  process.argv.slice(2);
const baselines = join(import.meta.dirname, '..', 'baselines', device);
const diffs = join(dir, 'diffs');
mkdirSync(diffs, { recursive: true });
const MAX_DIFF_RATIO = 0.01;

const results = readdirSync(dir)
  .filter((name) => name.startsWith('screen-') && name.endsWith('.png'))
  .map((name) => {
    const baseline = join(baselines, name);
    if (!existsSync(baseline)) return { name, status: 'no-baseline' as const };
    const actual = PNG.sync.read(readFileSync(join(dir, name)));
    const expected = PNG.sync.read(readFileSync(baseline));
    if (actual.width !== expected.width || actual.height !== expected.height) {
      return { name, status: 'size-changed' as const };
    }
    const diff = new PNG({ width: actual.width, height: actual.height });
    const changed = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, {
      threshold: 0.15,
    });
    const ratio = changed / (actual.width * actual.height);
    if (ratio > MAX_DIFF_RATIO) writeFileSync(join(diffs, name), PNG.sync.write(diff));
    return {
      name,
      status: ratio > MAX_DIFF_RATIO ? ('changed' as const) : ('same' as const),
      ratio,
    };
  });

writeFileSync(out, JSON.stringify({ device, results }, null, 2));
console.table(results);
const failed = results.filter((r) => r.status === 'changed' || r.status === 'size-changed');
if (failed.length > 0) {
  console.error(`${failed.length} screen(s) changed visually; see the diffs artifact.`);
  process.exit(1);
}
