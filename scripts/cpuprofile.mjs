// Dev tool: a 3-second CPU profile while playing, top functions by self time. Usage: node scripts/cpuprofile.mjs <url>
import { chromium } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';

const [url] = process.argv.slice(2);
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-perf-profile'), {
  channel: 'chrome', headless: true, viewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
await page.keyboard.press('KeyX');
await page.waitForTimeout(5500);
await page.evaluate(() => { __ll.place(-12, 0, 1.57); __ll.setHour(17.4); });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
await page.waitForTimeout(3000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]);
  const k = `${n.callFrame.functionName || '(anon)'} :${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, ms] of top) console.log(ms.toFixed(0).padStart(6), 'ms', k);
await browser.close();
