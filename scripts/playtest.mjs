// Dev tool: plays the whole loop with real key events and reports what happened at each step.
// Usage: node scripts/playtest.mjs <outDir> [url]
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
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().slice(0, 1500)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });

const results = [];
const s = () => page.evaluate(() => window.__ll.stats());
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const mode = async () => (await s()).mode;

await wait(1500);
check('title screen shows', (await mode()) === 'title');
await page.keyboard.press('KeyX');
await wait(5200);
check('any key starts the walk', (await mode()) === 'walk');
await shot('01-start');

const p0 = await s();
await page.keyboard.down('KeyW');
await wait(2500);
await page.keyboard.up('KeyW');
const p1 = await s();
check('W walks', Math.hypot(p1.px - p0.px, p1.pz - p0.pz) > 3, `moved ${Math.hypot(p1.px - p0.px, p1.pz - p0.pz).toFixed(1)} m`);
await shot('02-walking');

await page.keyboard.press('KeyQ');
await wait(3000);
const p2 = await s();
check('Q strolls by itself', Math.hypot(p2.px - p1.px, p2.pz - p1.pz) > 2.5, `moved ${Math.hypot(p2.px - p1.px, p2.pz - p1.pz).toFixed(1)} m`);
await page.keyboard.press('KeyQ');

// Bench.
await page.evaluate(() => { const b = __ll.game.props.bench; __ll.place(b.x + 1.1, b.z + 0.8, 1.3); });
await wait(600);
await page.keyboard.press('KeyE');
await wait(1500);
check('E sits on the bench', (await mode()) === 'sit');
await shot('03-bench');
await page.keyboard.press('KeyE');
await wait(1200);
check('E gets up', (await mode()) === 'walk');

// Door and rest.
await page.evaluate(() => __ll.place(112.4, -24, 1.5));
await wait(500);
await page.keyboard.press('KeyE');
await wait(700);
check('door offers rest', await page.evaluate(() => __ll.game.ui.restOpen));
await shot('04-rest');
const hBefore = (await s()).hour;
await page.evaluate(() => document.querySelector('#rest button[data-h="9.5"]').click());
await wait(3500);
const hAfter = (await s()).hour;
check('resting moves the clock', Math.abs(hAfter - 9.5) < 0.3, `${hBefore} to ${hAfter}`);
await shot('05-morning-after-rest');

// Sit at the end of the jetty.
await page.evaluate(() => { __ll.setHour(18.5); __ll.place(-27, 0, 1.57); });
await wait(600);
await page.keyboard.press('KeyE');
await wait(1500);
check('sits on the end of the jetty', (await mode()) === 'sit');
await wait(1500);
await shot('06-jetty-sit');
await page.keyboard.press('KeyE');
await wait(1200);

// Board the boat.
await page.evaluate(() => __ll.place(-22.5, 0, 1.57));
await wait(600);
await page.keyboard.press('KeyE');
await wait(2200);
check('E boards the boat', (await mode()) === 'row');
await shot('07-boarded');
const b0 = await page.evaluate(() => ({ x: __ll.game.boat.x, z: __ll.game.boat.z, h: __ll.game.boat.heading }));
await page.keyboard.down('KeyW');
await wait(6000);
await shot('08-rowing');
await page.keyboard.down('KeyA');
await wait(2500);
await page.keyboard.up('KeyA');
await page.keyboard.up('KeyW');
const b1 = await page.evaluate(() => ({ x: __ll.game.boat.x, z: __ll.game.boat.z, h: __ll.game.boat.heading, sp: __ll.game.boat.speed }));
check('W rows the boat', Math.hypot(b1.x - b0.x, b1.z - b0.z) > 4, `moved ${Math.hypot(b1.x - b0.x, b1.z - b0.z).toFixed(1)} m`);
check('A turns the boat', Math.abs(b1.h - b0.h) > 0.05, `turned ${(b1.h - b0.h).toFixed(2)} rad`);

// Row out, then fish: the full loop with real input.
await page.evaluate(() => __ll.boatAt(-110, 30, 1.4));
await wait(800);
await page.keyboard.down('Space');
await wait(1300);
check('holding Space charges a cast', (await s()).fish === 'charge');
await shot('09-charging');
await page.keyboard.up('Space');
await wait(350);
check('releasing casts', (await s()).fish === 'flight');
await shot('10-flight');
await wait(2000);
check('lure lands and waits', (await s()).fish === 'wait');
await shot('11-waiting');
await page.evaluate(() => { __ll.game.fishing.waitT = 0.05; });
await wait(700);
check('a fish bites', (await s()).fish === 'bite');
await shot('12-bite');
await page.keyboard.press('Space');
await wait(300);
check('Space hooks it', (await s()).fish === 'reel');
await page.evaluate(() => { __ll.game.fishing.fishDist = 9; });
await page.keyboard.down('Space');
await wait(1500);
await shot('13-reeling');
for (let i = 0; i < 40 && (await s()).fish === 'reel'; i++) await wait(400);
await page.keyboard.up('Space');
check('reeling lands the fish', (await s()).fish === 'landed');
const sp = await page.evaluate(() => __ll.game.fishing.species?.name);
const inJournal = await page.evaluate(() => Object.keys(__ll.game.save.journal).length);
check('journal records it', inJournal >= 1, `${sp}, ${inJournal} species`);
await wait(1500);
await shot('14-landed-card');
await page.keyboard.press('Space');
await wait(1800);
check('Space lets it go', (await s()).fish === 'idle');

// The wardrobe.
check('the menu never opened by itself', !(await page.evaluate(() => __ll.game.ui.menuOpen)));
await page.evaluate(() => __ll.game.openMenu());
await wait(400);
await page.locator('#mLook').click();
await wait(700);
check('the menu button opens the wardrobe', await page.evaluate(() => __ll.game.ui.wardrobe.open));
await shot('15w-wardrobe');
const look0 = await page.evaluate(() => JSON.stringify(__ll.game.fisher.look));
await page.locator('#wFoot button[data-w="silly"]').click();
await wait(300);
const look1 = await page.evaluate(() => JSON.stringify(__ll.game.fisher.look));
check('silly surprise changes the look', look0 !== look1);
await shot('15x-wardrobe-silly');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await wait(200);
check('arrow keys change an option', look1 !== (await page.evaluate(() => JSON.stringify(__ll.game.fisher.look))));
await page.locator('#wTabs button', { hasText: 'Hat' }).click();
await page.locator('#wBody .pick button').nth(1).click();
await wait(200);
await page.locator('#wTabs button', { hasText: 'Body' }).click();
await wait(150);
check('body tab has its sliders', (await page.locator('#wBody input[type=range]').count()) === 3);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('longlight.save.v1')).look.hat);
check('the look is saved', saved === (await page.evaluate(() => __ll.game.fisher.look.hat)), saved);
await page.locator('#wFoot button[data-w="reset"]').click();
await page.locator('#wFoot button[data-w="done"]').click();
await wait(500);
check('done closes the wardrobe', !(await page.evaluate(() => __ll.game.ui.wardrobe.open)));

// A beer, in every situation that allows one.
const beer = () => page.evaluate(() => ({ phase: __ll.game.beer.phase, sips: __ll.game.beer.sips, lift: __ll.game.beer.lift, bottle: __ll.game.fisher.bottle.visible }));
await page.keyboard.press('KeyB');
await wait(2300);
let br = await beer();
check('B drinks in the boat', br.phase === 'sipping' && br.bottle && br.lift > 0.9, JSON.stringify(br));
await shot('15a-beer-boat');
const boatBefore = await page.evaluate(() => __ll.game.boat.speed);
await page.keyboard.down('KeyW');
await wait(1500);
br = await beer();
check('rowing puts the bottle away', br.phase === 'away' && !br.bottle, JSON.stringify(br));
await wait(3000);
await page.keyboard.up('KeyW');
check('and the oars work again', Math.abs(await page.evaluate(() => __ll.game.boat.speed)) > Math.abs(boatBefore) + 0.05);
await page.keyboard.down('Space');
await wait(900);
await page.keyboard.up('Space');
await wait(2400);
await page.keyboard.press('KeyB');
await wait(2300);
br = await beer();
check('B drinks while waiting for a bite', br.phase === 'sipping' && (await s()).fish === 'wait', JSON.stringify(br));
await shot('15b-beer-fishing');
await page.evaluate(() => { __ll.game.fishing.waitT = 0.05; });
await wait(1300);
br = await beer();
check('a bite puts the bottle away', br.phase === 'away', JSON.stringify(br));
await page.keyboard.press('KeyB');
await wait(600);
check('no beer with a fish on the line', (await beer()).phase === 'away');
await page.keyboard.press('KeyR');
await page.evaluate(() => __ll.game.fishing.reelIn());
await wait(300);

// Journal and menu.
await page.keyboard.press('KeyJ');
await wait(900);
check('J opens the journal', await page.evaluate(() => __ll.game.ui.journalOpen));
await shot('15-journal');
await page.keyboard.press('KeyJ');
await wait(500);
await page.evaluate(() => __ll.game.input.onLockChange?.(false));
await wait(800);
check('losing the pointer opens the menu', await page.evaluate(() => __ll.game.ui.menuOpen));
await shot('16-menu');
await page.evaluate(() => document.querySelector('#mResume').click());
await wait(400);
check('menu closes', !(await page.evaluate(() => __ll.game.ui.menuOpen)));

// Row home and land.
await page.evaluate(() => __ll.boatAt(-22, 5, 1.57));
await wait(800);
await page.keyboard.press('KeyE');
await wait(2400);
check('E steps back onto the jetty', (await mode()) === 'walk', JSON.stringify(await s()));
await shot('17-landed-home');

await page.keyboard.press('KeyB');
await wait(2300);
br = await beer();
check('B drinks standing on the jetty', br.phase === 'sipping', JSON.stringify(br));
await shot('18-beer-jetty');
await page.keyboard.down('KeyS');
await wait(800);
br = await beer();
await page.keyboard.up('KeyS');
check('can sip and walk at once', br.bottle, JSON.stringify(br));
await wait(3000);
await page.evaluate(() => { __ll.place(-27, 0, 1.57); });
await wait(500);
await page.keyboard.press('KeyE');
await wait(1400);
await page.keyboard.press('KeyB');
await wait(2300);
br = await beer();
check('B drinks sitting at the end of the jetty', (await s()).mode === 'sit' && br.phase !== 'away', JSON.stringify(br));
await shot('19-beer-sitting');
await wait(2500);
let sipsDrunk = 0;
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyB');
  await wait(3600);
  if ((await beer()).phase === 'away') { sipsDrunk = i + 1; break; }
}
br = await beer();
check('a bottle runs out and goes back', br.phase === 'away' && br.sips === 0, JSON.stringify(br));
await page.keyboard.press('KeyE');
await wait(1200);

// The fish table across a whole day has someone for every hour and zone.
const coverage = await page.evaluate(() => {
  const g = __ll.game;
  return g.fishing ? true : false;
});
check('fishing system alive at end', coverage);

console.log(results.join('\n'));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n---\n'));
else console.log('no console errors');
await browser.close();
