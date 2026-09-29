#!/usr/bin/env node
/**
 * Performance budget: the size of what the Android app loads at start. Checks the output of
 * `expo export --platform android --dump-sourcemap` (the same Hermes bytecode Gradle puts in
 * the release app) and fails when a budget is exceeded, so growth is a deliberate decision.
 *
 *   node scripts/check-bundle-size.mjs <export dir>
 *
 * Phase 8 baseline (MiB): bytecode 9.02, assets 2.23 (fonts are embedded natively, not
 * shipped twice). Raise a budget only with a reason in the commit message.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MB = 1024 * 1024;
const BUDGETS = {
  bytecode: 9.3 * MB, // _expo/static/js/android/*.hbc
  assets: 2.5 * MB, // images and icon font bundled with the JS
};

function total(dir, match = () => true) {
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) bytes += total(path, match);
    else if (match(name)) bytes += stat.size;
  }
  return bytes;
}

const root = process.argv[2];
if (!root) {
  console.error('usage: check-bundle-size.mjs <export dir>');
  process.exit(2);
}
const sizes = {
  bytecode: total(join(root, '_expo', 'static', 'js', 'android'), (n) => n.endsWith('.hbc')),
  assets: total(join(root, 'assets')),
};

let failed = false;
for (const [name, bytes] of Object.entries(sizes)) {
  const ok = bytes <= BUDGETS[name];
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${name.padEnd(8)} ${(bytes / MB).toFixed(2)} MB (budget ${(BUDGETS[name] / MB).toFixed(2)} MB)`,
  );
}
process.exit(failed ? 1 : 0);
