// Dev tool: drives the game with a simulated standard-mapping gamepad (the layout Chrome gives a PS4 pad).
// Usage: node scripts/padtest.mjs <outDir> [url]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const outDir = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:5188/';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-capture-profile'), {
  channel: 'chrome', headless: true, viewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => {
  const mk = () => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  window.__pad = mk();
  navigator.getGamepads = () => [window.__pad, null, null, null];
});
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
const results = [];
const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`);
const s = () => page.evaluate(() => __ll.stats());
const wait = (ms) => page.waitForTimeout(ms);
const button = async (i, ms = 120) => {
  await page.evaluate((b) => { __pad.buttons[b].pressed = true; }, i);
  await wait(ms);
  await page.evaluate((b) => { __pad.buttons[b].pressed = false; }, i);
  await wait(120);
};
const axes = (a) => page.evaluate((v) => { __pad.axes = v; }, a);
const CROSS = 0, CIRCLE = 1, SQUARE = 2, TRIANGLE = 3, OPTIONS = 9;

await wait(1200);
await button(CROSS);
await wait(5200);
check('Cross starts the game', (await s()).mode === 'walk');
await wait(600);
await page.evaluate(() => { __pad.buttons[0].pressed = true; });
await wait(160);
check('Cross jumps on land', await page.evaluate(() => __ll.game.airborne));
await page.evaluate(() => { __pad.buttons[0].pressed = false; });
await wait(1000);

const a0 = await s();
await axes([0, -1, 0, 0]);
await wait(2000);
await axes([0, 0, 0, 0]);
const a1 = await s();
check('left stick walks', Math.hypot(a1.px - a0.px, a1.pz - a0.pz) > 2.5);

const y0 = await page.evaluate(() => __ll.game.yaw);
await axes([0, 0, 1, 0]);
await wait(600);
await axes([0, 0, 0, 0]);
check('right stick looks', Math.abs((await page.evaluate(() => __ll.game.yaw)) - y0) > 0.3);

const b0 = await s();
await button(TRIANGLE);
await wait(2500);
const b1 = await s();
check('Triangle strolls', Math.hypot(b1.px - b0.px, b1.pz - b0.pz) > 2.5);
await button(TRIANGLE);

await page.evaluate(() => __ll.place(-22.5, 0, 1.57));
await wait(500);
await button(SQUARE);
await wait(2200);
check('Square boards the boat', (await s()).mode === 'row');
const c0 = await page.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]);
await axes([0, -1, 0, 0]);
await wait(4000);
await axes([0, 0, 0, 0]);
const c1 = await page.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]);
check('left stick rows', Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 2);

await page.evaluate(() => { __pad.buttons[0].pressed = true; });
await wait(1100);
check('holding Cross charges', (await s()).fish === 'charge');
await page.evaluate(() => { __pad.buttons[0].pressed = false; });
await wait(2600);
check('releasing Cross casts', (await s()).fish === 'wait');
await page.evaluate(() => { __ll.game.fishing.waitT = 0.0001; });
await wait(600);
await button(CROSS);
check('Cross hooks', (await s()).fish === 'reel');
await page.evaluate(() => { __ll.game.fishing.fishDist = 6; __pad.buttons[7].pressed = true; });
for (let i = 0; i < 30 && (await s()).fish === 'reel'; i++) await wait(400);
await page.evaluate(() => { __pad.buttons[7].pressed = false; });
check('R2 reels', (await s()).fish === 'landed');
await wait(600);
await button(CROSS);
await wait(1800);
check('Cross lets go', (await s()).fish === 'idle');

await button(4);
await wait(2300);
check('L1 drinks a beer', (await page.evaluate(() => __ll.game.beer.phase)) === 'sipping');
await axes([0, -1, 0, 0]);
await wait(1200);
await axes([0, 0, 0, 0]);
check('rowing with the stick puts it away', (await page.evaluate(() => __ll.game.beer.phase)) === 'away');

await button(OPTIONS);
await wait(500);
check('Options opens the menu', await page.evaluate(() => __ll.game.ui.menuOpen));
await button(13);
await button(13);
await wait(200);
await page.screenshot({ path: path.join(outDir, 'pad-menu.png') });
await button(CIRCLE);
await wait(400);
check('Circle closes the menu', !(await page.evaluate(() => __ll.game.ui.menuOpen)));
console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
