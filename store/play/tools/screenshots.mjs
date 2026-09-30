/**
 * Store screenshots, rendered from the app itself (web build, demo data):
 *   node store/play/tools/screenshots.mjs <out dir> phone|tablet
 * Needs the web export served on http://localhost:8765 (see store/play/README.md) and Playwright
 * (PLAYWRIGHT_MODULE = path to playwright's index.mjs if it is not resolvable from here).
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const [out, device] = process.argv.slice(2);
const view =
  device === 'tablet'
    ? { width: 800, height: 1280, scale: 2 }
    : { width: 405, height: 720, scale: 8 / 3 };
const b = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

async function session() {
  const p = await b.newPage({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.scale,
  });
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
  await p.getByTestId('onboarding-skip').click();
  await p.waitForTimeout(800);
  await p.getByTestId('go-sign-in').click();
  await p.waitForTimeout(800);
  await p.getByTestId('email').fill('demo@studexa.app');
  await p.getByTestId('password').fill('Studexa2026');
  await p.getByTestId('sign-in-submit').click();
  await p.waitForTimeout(2500);
  return p;
}
async function shot(p, name) {
  await p.evaluate(() => {
    // Store builds never show the demo-data banner.
    for (const el of document.querySelectorAll('div')) {
      const t = el.textContent?.trim() ?? '';
      if (t.endsWith('Demo mode — sample data') && t.length < 40) el.style.display = 'none';
      if (t.startsWith('Sample output.') && t.length < 80) el.style.display = 'none';
    }
    // React Native Web clips the tab labels by a few pixels; Android does not.
    for (const t of document.querySelectorAll('[role=tablist]')) {
      if (!t.dataset.grown) {
        t.dataset.grown = '1';
        t.style.height = t.getBoundingClientRect().height + 10 + 'px';
      }
    }
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}.png` });
}
const tab = (p, name) => p.getByRole('tab', { name: new RegExp(name) }).click();
const text = (p, t) => p.getByText(t, { exact: true }).last();

let p = await session();
await shot(p, '01-home');
await tab(p, 'Library');
await p.waitForTimeout(1200);
await shot(p, '02-library');
await text(p, 'Cell Biology — Chapter 3: The Cell').click();
await p.waitForTimeout(1500);
await text(p, 'Summarize').click();
await p.waitForTimeout(6000);
await shot(p, '03-ai-summary');

p = await session();
await text(p, 'Continue reading').click();
await p.waitForTimeout(1800);
await shot(p, '04-reader');

p = await session();
await tab(p, 'Chat');
await p.waitForTimeout(1000);
await text(p, 'Mitochondria and ATP').click();
await p.waitForTimeout(2000);
await shot(p, '05-chat');

p = await session();
await tab(p, 'Study');
await p.waitForTimeout(1000);
await p
  .getByText(/Review all due/)
  .last()
  .click();
await p.waitForTimeout(1800);
await shot(p, '06-flashcards');

p = await session();
await tab(p, 'Study');
await p.waitForTimeout(1000);
await text(p, 'Quizzes').click();
await p.waitForTimeout(1200);
await text(p, 'The Cell — checkpoint quiz').click();
await p.waitForTimeout(1500);
await text(p, 'Start quiz').click();
await p.waitForTimeout(1200);
await shot(p, '07-quiz');
await b.close();
