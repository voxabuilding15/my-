#!/usr/bin/env node
/**
 * Security regression: nothing secret may ship in what users download. Scans the built
 * Android JS bundle and the admin dashboard for server-only variable names, secret key
 * formats and any JWT whose role is not the public "anon" role.
 *
 *   node scripts/check-bundle-secrets.mjs <dir> [<dir> ...]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /ANTHROPIC_API_KEY/,
  /VOYAGE_API_KEY/,
  /REVENUECAT_WEBHOOK_SECRET/,
  /WORKER_SECRET/,
  /CRON_SECRET/,
  /AUTH_CODE_PEPPER/,
  /RESEND_API_KEY/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|hbc|html|json|map|css|txt)$/.test(name)) yield path;
  }
}

const findings = [];
let scanned = 0;
for (const dir of process.argv.slice(2)) {
  for (const file of files(dir)) {
    const text = readFileSync(file, 'latin1');
    scanned++;
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) findings.push(`${file}: matches ${pattern}`);
    }
    for (const [token] of text.matchAll(JWT)) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (payload.role !== 'anon') findings.push(`${file}: JWT with role "${payload.role}"`);
      } catch {
        // Not a JWT after all.
      }
    }
  }
}

if (scanned === 0) {
  console.error('nothing scanned: build the bundles first');
  process.exit(2);
}
if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log(`no secrets in ${scanned} shipped files`);
