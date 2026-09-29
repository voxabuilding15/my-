/**
 * Worker benchmarks and memory-leak check (no network or database: an in-memory store).
 *
 *   pnpm --filter @studexa/document-processor bench
 *
 * 1. Throughput: extraction + chunking time and peak memory for 10–500-page PDFs.
 * 2. Leak check: 300 documents processed back to back must not grow the heap (after GC).
 *
 * Writes bench/results.json and exits non-zero when the leak budget is exceeded.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processDocument } from '../src/process-document.ts';
import type { DocumentStore } from '../src/ports.ts';

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) {
  console.error('Run with node --expose-gc');
  process.exit(2);
}

/** Minimal text PDF (same generator as the integration fixtures). */
function makePdf(pageCount: number, linesPerPage = 40): Uint8Array {
  const objects: string[] = [];
  const kids: number[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let p = 0; p < pageCount; p++) {
    const pageId = 4 + p * 2;
    kids.push(pageId);
    const text = Array.from(
      { length: linesPerPage },
      (_, l) =>
        `(Page ${p + 1} line ${l + 1}: enzymes, osmosis and photosynthesis in chapter ${p % 12}.) Tj T*`,
    ).join('\n');
    const stream = `BT /F1 11 Tf 14 TL 56 780 Td\n${text}\nET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}

function memoryStore(file: Uint8Array): DocumentStore & { savedPages: number } {
  const store = {
    savedPages: 0,
    get: async (documentId: string) => ({
      documentId,
      userId: 'u1',
      kind: 'pdf' as const,
      mimeType: 'application/pdf',
      status: 'processing' as const,
      storagePath: 'u1/d/original.pdf',
      maxPages: null,
      fullContextMaxTokens: 100_000,
      chunkTargetTokens: 800,
      chunkOverlapTokens: 100,
    }),
    download: async () => file,
    reuse: async () => false,
    save: async (_id: string, extraction: { pages: unknown[] }) => {
      store.savedPages += extraction.pages.length;
    },
  };
  return store as unknown as DocumentStore & { savedPages: number };
}

const heapMb = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

async function throughput() {
  const results = [];
  for (const pages of [10, 100, 250, 500]) {
    const file = makePdf(pages);
    const store = memoryStore(file);
    heapMb();
    const rssBefore = process.memoryUsage().rss;
    let peakRss = rssBefore;
    const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 5);
    const started = performance.now();
    await processDocument(store, `doc-${pages}`);
    const ms = performance.now() - started;
    clearInterval(sampler);
    results.push({
      pages,
      fileMb: +(file.byteLength / 1024 / 1024).toFixed(2),
      ms: Math.round(ms),
      pagesPerSecond: Math.round((pages / ms) * 1000),
      peakRssDeltaMb: Math.round((peakRss - rssBefore) / 1024 / 1024),
    });
  }
  return results;
}

async function leakCheck() {
  const file = makePdf(50);
  const run = async (count: number) => {
    for (let i = 0; i < count; i++) await processDocument(memoryStore(file), `leak-${i}`);
  };
  await run(30); // warm-up
  const before = heapMb();
  await run(300);
  const after = heapMb();
  return {
    documents: 300,
    pagesEach: 50,
    beforeMb: +before.toFixed(1),
    afterMb: +after.toFixed(1),
    growthMb: +(after - before).toFixed(1),
  };
}

const LEAK_BUDGET_MB = 10;

const results = { throughput: await throughput(), leak: await leakCheck(), node: process.version };
console.table(results.throughput);
console.log('leak check', results.leak);
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'results.json'),
  JSON.stringify(results, null, 2),
);
if (results.leak.growthMb > LEAK_BUDGET_MB) {
  console.error(
    `Heap grew ${results.leak.growthMb} MB over 300 documents (budget ${LEAK_BUDGET_MB} MB)`,
  );
  process.exit(1);
}
