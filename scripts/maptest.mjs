// Dev tool: boots each map with no window, walks and rows a little, takes pictures, measures the cost.
// Usage: node scripts/maptest.mjs <outDir> <url> [quality]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2];
const url = process.argv[3];
const quality = process.argv[4];
const only = process.env.LL_MAPS ? process.env.LL_MAPS.split(',') : ['cove', 'philippines', 'canada'];
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const results = [];
const check = (n, ok, d = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); console.log(results.at(-1)); };

for (const map of only) {
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('WebSocket connection')) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  if (quality) await page.addInitScript((q) => localStorage.setItem('longlight.quality', q), quality);
  const t0 = Date.now();
  await page.goto(`${url}#map=${map}`);
  await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 300000, polling: 300 });
  const bootS = ((Date.now() - t0) / 1000).toFixed(1);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: path.join(outDir, `${map}-${n}.png`) });
  // Measure flat out, with no frame limit, and with the picture quality fixed.
  await page.evaluate(() => { __ll.game.save.fpsCap = 0; __ll.game.save.adapt = false; __ll.game.save.quietAway = false; });
  await page.evaluate(() => { const b = document.getElementById('titleBtns'); });
  await wait(1200);
  await shot('title');
  await page.keyboard.press('KeyX');
  await wait(5200);
  check(`${map}: game starts`, (await page.evaluate(() => __ll.game.mode)) === 'walk');
  const a = await page.evaluate(() => [__ll.game.px, __ll.game.pz]);
  await page.keyboard.down('KeyW');
  await wait(2500);
  await page.keyboard.up('KeyW');
  const b = await page.evaluate(() => [__ll.game.px, __ll.game.pz]);
  check(`${map}: can walk`, Math.hypot(b[0] - a[0], b[1] - a[1]) > 3);
  await page.keyboard.press('KeyQ');
  await wait(4000);
  const c = await page.evaluate(() => [__ll.game.px, __ll.game.pz]);
  check(`${map}: the path works`, Math.hypot(c[0] - b[0], c[1] - b[1]) > 3);
  await page.keyboard.press('KeyQ');
  // Sunset from the jetty, then out on the water, then noon.
  await page.evaluate(() => { __ll.setHour(18.15); __ll.place(-12, 0, 1.57); __ll.game.yaw = 1.57; __ll.game.pitch = 0.12; });
  await wait(4500);
  await shot('sunset-jetty');
  const fps = async () => page.evaluate(async () => {
    const r = __ll.game.renderer.info;
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 2500) { await new Promise((f) => requestAnimationFrame(f)); n += 1; }
    return { fps: Math.round(n / 2.5), tris: r.render.triangles, calls: r.render.calls, res: `${__ll.game.pipe.w}x${__ll.game.pipe.h}` };
  });
  console.log(`  ${map} on the jetty:`, JSON.stringify(await fps()));
  await page.evaluate(() => { __ll.setHour(12.2); __ll.game.yaw = 1.2; });
  await wait(3500);
  await shot('noon-jetty');
  await page.evaluate(() => { __ll.board(); });
  await wait(1800);
  await page.evaluate(() => { __ll.boatAt(-130, 20, 1.57); __ll.setHour(17.6); __ll.game.yaw = 1.3; __ll.game.pitch = 0.08; });
  await wait(3500);
  await shot('boat');
  console.log(`  ${map} in the boat:`, JSON.stringify(await fps()));
  check(`${map}: boat afloat`, Math.abs(await page.evaluate(() => __ll.game.boat.y)) < 0.5);
  await page.evaluate(() => { __ll.game.ui.hooks.setRowSpeed(1); __ll.setHour(13); __ll.boatAt(-60, 40, 0.6); __ll.game.yaw = -1.9; __ll.game.pitch = 0.05; });
  await wait(3000);
  await shot('shore');
  // The buildings and the things that only belong here.
  await page.evaluate(async () => {
    const g = __ll.game;
    if (g.inBoat) g.leaveBoat();
    await new Promise((f) => setTimeout(f, 1900));
    __ll.setHour(11);
    __ll.place(99, -18, -1.2);
    g.yaw = -1.25;
    g.pitch = 0.02;
  });
  await wait(2500);
  await shot('house');
  await page.evaluate(() => { const g = __ll.game; __ll.place(42, 14, 1.9); g.yaw = 1.9; g.pitch = 0.12; __ll.setHour(9.5); });
  await wait(2500);
  await shot('beach');
  await page.evaluate(() => { const g = __ll.game; __ll.board(); });
  await wait(1800);
  // The picture on the picker.
  await page.evaluate(() => { __ll.setHour(17.9); __ll.boatAt(-40, 12, 1.4); __ll.game.yaw = 1.6; __ll.game.pitch = 0.06; document.getElementById('ui').style.display = 'none'; });
  await wait(3500);
  await shot('card');
  await page.evaluate(() => { document.getElementById('ui').style.display = ''; });
  check(`${map}: no errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`  ${map} loaded in ${bootS}s`);
  await ctx.close();
}
await browser.close();
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
