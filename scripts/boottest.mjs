// Dev tool: boots a URL with no window and logs loading steps, for finding crashes during start-up.
// Usage: node scripts/boottest.mjs <url>
import { chromium } from 'playwright-core';
const url = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);
page.on('console', (m) => { if (m.type() === 'error') log('console error:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => log('PAGE ERROR', e.message));
page.on('crash', () => log('CRASHED'));
await page.goto(url);
let last = '';
for (let i = 0; i < 600; i++) {
  try {
    const s = await page.evaluate(() => ({ ready: window.__ll?.ready === true, text: document.getElementById('loading')?.innerText?.slice(0, 80) ?? '' }));
    if (s.text !== last) { log(s.text.replace(/\s+/g, ' ')); last = s.text; }
    if (s.ready) { log('READY'); break; }
  } catch (e) { log('lost page:', e.message.slice(0, 80)); break; }
  await new Promise((f) => setTimeout(f, 500));
}
await browser.close();
