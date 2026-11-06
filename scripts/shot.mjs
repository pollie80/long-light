// Dev tool: renders the game on the real GPU and saves stills. Usage:
//   node scripts/shot.mjs <outDir> '<json list of {name, query?, hour?, js?, wait?}>' [width] [height]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const [outDir, shotsJson, w = '1600', h = '900'] = process.argv.slice(2);
const shots = JSON.parse(shotsJson);
fs.mkdirSync(outDir, { recursive: true });
const profile = process.env.LL_PROFILE || path.join(os.tmpdir(), 'long-light-capture-profile');
const browser = await chromium.launchPersistentContext(profile, {
  channel: process.env.LL_CHANNEL || 'chrome',
  headless: true,
  viewport: { width: +w, height: +h },
  args: [`--use-angle=${process.env.LL_ANGLE || 'd3d11'}`, '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('LL:')) logs.push(m.text().slice(0, 2500)); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const url = process.env.LL_URL || 'http://127.0.0.1:5188/';
let lastQuery = null;
const t0 = Date.now();
for (const s of shots) {
  const q = s.query ?? lastQuery ?? '';
  if (q !== lastQuery) {
    await page.goto(url + (q ? '?' + q : ''));
    lastQuery = q;
    await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 200 }).catch((e) => logs.push('NOT READY ' + e.message));
    console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  }
  if (s.js) {
    const r = await page.evaluate(s.js).catch((e) => 'JS ERROR ' + e.message);
    if (r !== undefined) console.log(s.name, 'js ->', typeof r === 'string' ? r : JSON.stringify(r));
  }
  await page.waitForTimeout(s.wait ?? 3200);
  const file = path.join(outDir, s.name + '.png');
  await page.screenshot({ path: file, type: 'png' });
  const stats = await page.evaluate(() => window.__ll?.stats?.() ?? null).catch(() => null);
  console.log(s.name, JSON.stringify(stats));
}
if (logs.length) console.log('LOGS:\n' + [...new Set(logs)].join('\n---\n'));
await browser.close();
