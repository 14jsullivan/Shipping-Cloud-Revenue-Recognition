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
  // Every bar, line and dot must sit inside its chart frame (catches axis ranges that stop short of the data).
  const checkCharts = async (where) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('svg.chart')].flatMap((svg) => {
      const h = svg.viewBox.baseVal.height;
      return [...svg.querySelectorAll('path,circle')].filter((el) => { const b = el.getBBox(); return b.height + b.width > 0 && (b.y < -1 || b.y + b.height > h + 1); })
        .map(() => svg.closest('.card')?.querySelector('h2')?.textContent || 'chart');
    }));
    if (bad.length) errors.push(`[${tag}/${where}] marks drawn outside chart: ${[...new Set(bad)].join(', ')}`);
  };
  const shot = async (name) => { await checkCharts(name); return page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true }); };
  await page.waitForSelector('#where .cc', { timeout: 15000 });
  await shot('issues');
  if (tag === 'desktop') {
    await page.hover('svg.chart .hit >> nth=12');
    await page.screenshot({ path: `${out}/${tag}-tooltip.png` });
    // Five-step path: totals over time -> carriers -> what was billed -> where it concentrates -> who fixes it
    await page.waitForSelector('.hl h2');
    const steps34 = () => Promise.all([page.waitForSelector('#bridge .wf', { timeout: 15000 }), page.waitForSelector('#where .cc', { timeout: 15000 })]);
    await steps34();
    await shot('diagnose');
    await page.click('[data-v1="table"]');
    await page.waitForSelector('table.piv tbody tr');
    await shot('step1-table');
    await page.click('table.piv tbody tr.click >> nth=0');
    await page.waitForTimeout(200);
    await page.click('[data-rm="range"]');
    await page.click('[data-v1="chart"]');
    await page.click('[data-v2="time"]');
    await page.waitForSelector('table.mx.piv');
    await shot('step2-time');
    await page.click('table.mx.piv th[data-dx-car] >> nth=1');
    await page.click('[data-v2="type"]');
    await page.click('td[data-dx-cell] >> nth=3');
    await shot('step2-type');
    await page.click('[data-v2="bars"]');
    await page.click('.drow[data-dx-car] >> nth=0 >> .dbar .r');
    await page.waitForSelector('.hl.o');
    await steps34();
    await shot('carrier-over');
    await page.click('[data-dx-dir="u"] >> nth=0');
    await page.click('tr[data-dx-t] >> nth=0');
    await steps34();
    // Drill into a bridge line: carrier measurements, exact charges, SKUs and shipments
    await page.click('#bridge .wf-r.click >> nth=0');
    await page.waitForSelector('#drawer.on .mtrs', { timeout: 15000 });
    await page.screenshot({ path: `${out}/${tag}-line.png` });
    await page.click('[data-ltab="ships"]');
    await page.waitForSelector('#drawer table.ln tbody tr');
    await page.click('[data-close]');
    await page.click('[data-wdim="zone"]');
    await shot('where-zone');
    await page.click('[data-wdim="surcharge"]');
    await page.waitForSelector('#where .cc-r:not(.cc-h)');
    await page.click('[data-wdim="merchant"]');
    await page.click('#where .cc-r.click >> nth=0');
    await page.waitForSelector('#drawer.on table.t', { timeout: 15000 });
    await page.click('[data-close]');
    await page.click('[data-dx-kind="se"]');
    await page.click('tr[data-dx-rep] >> nth=0');
    await page.waitForTimeout(300);
    await shot('diagnose-rep');
    await page.click('[data-dx-reset]');
    // Global filters, drill-down and the merchant drawer
    await page.click('[data-dd="carrier"]');
    await page.click('#pop [data-opt] >> nth=0');
    await page.keyboard.press('Escape');
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
    await page.click('tr[data-act="merchant"] >> nth=0');
    await page.waitForSelector('#drawer.on table.t', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tag}-drawer.png` });
    await page.click('[data-status="working"]');
    await page.fill('[data-form="note"]', 'Re-billing UPS weight corrections');
    await page.click('[data-save]');
    await page.waitForTimeout(400);
    await page.click('[data-close]');
  }
  // Summary: last 60 days, one line per issue, its drill-down, and the direction switch on every tab
  await page.click('[data-tab="top"]');
  await page.waitForSelector('.sr .line', { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Checking package weights'), null, { timeout: 20000 });
  if (!(await page.$('.sumhead .st')) || !(await page.$('.bl li')) || !(await page.$('.sr .by'))) errors.push(`[${tag}] Summary is missing its totals, AI briefing or notes`);
  if (await page.$('#bar [data-preset]')) errors.push(`[${tag}] Summary still shows period presets`);
  // One line per issue in the form "Brand, carrier, type, on N shipments, costing $X."
  const lines = await page.evaluate(() => [...document.querySelectorAll('.sr .line')].map((e) => e.innerText));
  const bad = lines.filter((t) => !/, on [\d,]+ shipments, (costing|collecting) \$[\d,]+/.test(t));
  if (!lines.length || bad.length) errors.push(`[${tag}] Summary line is not in brand, carrier, type, shipments, cost form: ${(bad[0] || '').slice(0, 120)}`);
  // Plain language only: no symbols, arrows, separators or invoice codes
  const odd = await page.evaluate(() => [...document.querySelectorAll('.sr .line, .sr .cf, .sr .tf, .bl li')].map((e) => e.innerText).filter((t) => /[·×→|+—]|[A-Z]{5,}_|\$-?\d+(\.\d)?K\b/.test(t)));
  if (odd.length) errors.push(`[${tag}] Summary text has symbols or codes: ${odd[0].slice(0, 120)}`);
  await shot('top');
  await page.click('[data-top="u:0"]');
  await page.waitForSelector('#drawer.on .mtrs', { timeout: 15000 });
  await page.click('[data-close]');
  // Labels never charged to the merchant explain themselves: return label used, not used yet, or shipping label
  await page.click('[data-top="u:5"]');
  await page.waitForSelector('#drawer.on .brk .lf', { timeout: 15000 });
  if (await page.$('#drawer .mtrs')) errors.push(`[${tag}] Return label drill-down still shows weight and box meters`);
  await page.click('[data-close]');
  if (!(await page.$('.pendnote'))) errors.push(`[${tag}] Summary is missing the unused return labels note`);
  await page.click('[data-view="u"]');
  await page.waitForTimeout(500);
  if (await page.$('[data-topdir="o"]')) errors.push(`[${tag}] Under-billed view still shows over-billed issues`);
  await shot('top-under');
  await page.click('[data-tab="issues"]');
  await page.waitForSelector('#where .cc', { timeout: 15000 });
  await shot('issues-under');
  await page.click('[data-view="both"]');
  // Export shipments (PLD): both directions, last 30 days, downloads one CSV row per shipment with pass-through status
  if (tag === 'desktop') {
    await page.click('[data-tab="issues"]');
    await page.click('[data-pld]');
    await page.waitForSelector('#drawer.on [data-pld-run]');
    await page.click('[data-pld-dir="b"]');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-pld-run]')]);
    const csv = await new Promise((res, rej) => { let t = ''; dl.createReadStream().then((st) => { st.on('data', (c) => (t += c)); st.on('end', () => res(t)); st.on('error', rej); }); });
    const lines = csv.split('\n'), head = lines[0];
    if (lines.length < 100 || !/Passed on to merchant\?/.test(head) || !/Why not passed on/.test(head)) errors.push(`[${tag}] Shipment export is missing rows or columns`);
    if (/undefined/.test(csv)) errors.push(`[${tag}] Shipment export has undefined values`);
    await shot('export');
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
