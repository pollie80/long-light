// Dev tool: Ultra at 2560x1440, uncapped, in a few places: frame rate, then GPU time per pass.
// Usage: node scripts/ultraprobe.mjs <url> [label]. Close the game and anything else on the GPU first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';

const [url, label = ''] = process.argv.slice(2);
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-ultra-profile'), {
  channel: 'chrome', headless: true, viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(url);
await page.evaluate(() => {
  localStorage.setItem('longlight.save.v1', JSON.stringify({ fpsCap: 0, adapt: false, resolution: 0 }));
  localStorage.setItem('longlight.quality', 'ultra');
});
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
await page.keyboard.press('KeyX');
await page.waitForTimeout(5500);

const PLACES = [
  ['jetty, sunset', () => { __ll.place(-12, 0, 1.57); __ll.setHour(17.4); }],
  ['boat, dusk', () => { __ll.board(); __ll.boatAt(-60, 20, 1.4); __ll.setHour(19.2); }],
  ['meadow, noon', () => { __ll.place(20, 4, 1.2); __ll.setHour(12); }],
  ['boat, night', () => { __ll.board(); __ll.boatAt(-40, -30, 0.4); __ll.setHour(23); }],
];
const lines = [];
for (const [name, go] of PLACES) {
  await page.evaluate(go);
  await page.waitForTimeout(4000);
  const fps = await page.evaluate(async () => {
    const t0 = performance.now();
    let n = 0;
    await new Promise((res) => {
      const f = () => {
        n++;
        if (performance.now() - t0 < 4000) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
    const fps = Math.round((n / (performance.now() - t0)) * 1000);
    // Counted over ten frames, every pass included.
    const info = __ll.game.renderer.info;
    info.autoReset = false;
    info.reset();
    await new Promise((res) => {
      let k = 0;
      const f = () => (++k >= 10 ? res() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    });
    const calls = info.render.calls / 10;
    const tris = info.render.triangles / 10;
    info.autoReset = true;
    return { fps, res: __ll.stats().res, calls: Math.round(calls), tris };
  });
  const marks = await page.evaluate(async () => {
    const p = __ll.game.pipe;
    p.marks = {};
    p.profiling = true;
    await new Promise((r) => setTimeout(r, 3000));
    p.profiling = false;
    return Object.fromEntries(Object.entries(p.marks).map(([k, v]) => [k, +v.toFixed(2)]));
  });
  const total = Object.values(marks).reduce((a, b) => a + b, 0);
  lines.push(`${name}: ${fps.fps} fps at ${fps.res}, ${fps.calls} draws, ${(fps.tris / 1e6).toFixed(2)} M tris | ${total.toFixed(1)} ms profiled: ${Object.entries(marks).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
console.log(label + '\n' + lines.join('\n'));
await browser.close();
