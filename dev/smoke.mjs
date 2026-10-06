// Smoke test against the mock SDK: loads every tab, exercises filters, drill-down
// and the merchant drawer, fails on any console error, and saves screenshots.
// Usage: node dev/smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] || fileURLToPath(new URL('./shots', import.meta.url));
mkdirSync(out, { recursive: true });
const port = 4399;
const server = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), String(port)], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const run = async (width, height, tag) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`[${tag}] ${m.text()} ${m.location()?.url || ''}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.kpi .val', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#refresh').classList.contains('spin'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true });
  await shot('issues');
  if (tag === 'desktop') {
    await page.hover('svg.chart .hit >> nth=12');
    await page.screenshot({ path: `${out}/${tag}-tooltip.png` });
    await page.click('[data-bdim="carrier"]');
    await page.click('.drow >> nth=0');
    await page.waitForTimeout(300);
    await shot('filtered-carrier');
    await page.click('[data-dd="merchant"]');
    await page.fill('[data-popq]', 'a');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${tag}-popover.png` });
    await page.keyboard.press('Escape');
    await page.click('[data-clear], [data-rm]');
    await page.click('[data-grain="year"]');
    await page.click('svg.chart [data-drill] >> nth=1');
    await page.waitForTimeout(300);
    await shot('drill-year');
    await page.click('[data-rm="range"]');
    await page.click('[data-grain="month"]');
    await page.click('[data-bdim="merchant"]');
    await page.click('.drow >> nth=0');
    await page.waitForSelector('#drawer.on table.t', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tag}-drawer.png` });
    await page.click('[data-status="working"]');
    await page.fill('[data-form="note"]', 'Re-billing UPS weight corrections');
    await page.click('[data-save]');
    await page.waitForTimeout(400);
    await page.click('[data-close]');
  }
  for (const tab of ['owners', 'recon', 'progress']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(500);
    await shot(tab);
  }
  {
    await page.click('[data-tab="recon"]');
    await page.click('[data-grain="day"]');
    await page.waitForTimeout(300);
    await shot('recon-day');
    await page.click('[data-grain="month"]');
    await page.click('[data-tab="issues"]');
  }
  await page.close();
};
try {
  await run(1440, 900, 'desktop');
  await run(390, 844, 'mobile');
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('smoke ok →', out);
