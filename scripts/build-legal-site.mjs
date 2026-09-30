#!/usr/bin/env node
/**
 * Renders the legal site (site/) with the values in site/legal.config.json.
 *
 *   node scripts/build-legal-site.mjs --out <dir>   write the publishable site
 *   node scripts/build-legal-site.mjs --check       list values still to be filled (exit 1 if any)
 *
 * Empty values render as highlighted placeholders and keep the draft notice, so an unfinished
 * page can be published for review but never looks final. Unknown tokens fail the build.
 */
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(root, 'site');
const config = JSON.parse(readFileSync(join(siteDir, 'legal.config.json'), 'utf8'));

/** Text values, and how each is labelled while it is still empty. */
const FIELDS = {
  publisherName: 'PUBLISHER NAME',
  postalAddress: 'POSTAL ADDRESS',
  country: 'COUNTRY',
  contactEmail: 'CONTACT EMAIL',
  effectiveDate: 'EFFECTIVE DATE',
  lastUpdated: 'LAST UPDATED',
  databaseRegion: 'DATABASE REGION',
  backupRetentionDays: 'BACKUP RETENTION, e.g. 7–30',
  liabilityCap: 'AMOUNT, e.g. €100',
};

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const value = (key) => String(config[key] ?? '').trim();
const placeholder = (label) => `<mark class="placeholder">[${escape(label)}]</mark>`;

const missing = [
  ...Object.keys(FIELDS).filter((key) => !value(key)),
  ...(config.aiProviderTermsVerified ? [] : ['aiProviderTermsVerified']),
  ...(config.legalReviewDone ? [] : ['legalReviewDone']),
];

const tokens = {
  ...Object.fromEntries(
    Object.entries(FIELDS).map(([key, label]) => [
      key,
      value(key) ? escape(value(key)) : placeholder(label),
    ]),
  ),
  contactEmail: value('contactEmail')
    ? `<a href="mailto:${escape(value('contactEmail'))}">${escape(value('contactEmail'))}</a>`
    : placeholder(FIELDS.contactEmail),
  aiTermsNote: config.aiProviderTermsVerified
    ? ''
    : ` ${placeholder("VERIFY against each provider's current terms before publishing")}`,
  draftNotice:
    missing.length > 0
      ? '<p class="draft">Draft pending legal review. Highlighted items must be completed by the publisher before launch.</p>'
      : '',
};

if (process.argv.includes('--check')) {
  if (missing.length === 0) {
    console.log('legal pages: every value is filled in');
    process.exit(0);
  }
  console.log(`legal pages: still to complete in site/legal.config.json: ${missing.join(', ')}`);
  process.exit(1);
}

const outIndex = process.argv.indexOf('--out');
const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
if (!out) {
  console.error('usage: build-legal-site.mjs --out <dir> | --check');
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(siteDir, out, { recursive: true, filter: (path) => !path.endsWith('legal.config.json') });

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });

for (const file of htmlFiles(out)) {
  const rendered = readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in tokens)) throw new Error(`${relative(out, file)}: unknown token ${match}`);
    return tokens[key];
  });
  writeFileSync(file, rendered);
}
console.log(
  `legal site written to ${out}${missing.length ? ` (draft: ${missing.length} value(s) missing)` : ''}`,
);
