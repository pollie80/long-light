// Dev tool: frame time of a build in a few places, uncapped. Usage: node scripts/perfprobe.mjs <url> [label]
import { chromium } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';

const [url, label = ''] = process.argv.slice(2);
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-perf-profile'), {
  channel: 'chrome', headless: true, viewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(url);
await page.evaluate(() => localStorage.setItem('longlight.save.v1', JSON.stringify({ fpsCap: 0, adapt: false })));
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
await page.keyboard.press('KeyX');
await page.waitForTimeout(5500);
const out = [];
const sample = async (name, js) => {
  await page.evaluate(js);
  await page.waitForTimeout(4000);
  const s = await page.evaluate(async () => {
    const t0 = performance.now();
    let n = 0;
    await new Promise((res) => {
      const f = () => {
        n++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
    return { fps: Math.round((n / (performance.now() - t0)) * 1000), stats: window.__ll.stats() };
  });
  out.push(`${name}: ${s.fps} fps (${s.stats.ms} ms js-reported, ${s.stats.res})`);
};
await sample('jetty, evening', () => { __ll.place(-12, 0, 1.57); __ll.setHour(17.4); });
await sample('boat, dusk', () => { __ll.board(); __ll.boatAt(-60, 20, 1.4); __ll.setHour(19.2); });
await sample('meadow, noon', () => { __ll.place(20, 4, 1.2); __ll.setHour(12); });
console.log(label, '\n' + out.join('\n'));
await browser.close();
