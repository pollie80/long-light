// Dev tool: a full cove. Eight real browser pages on the real connection service, then a ninth.
// Usage: node scripts/crowdtest.mjs <outDir> <url>
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2];
const url = process.argv[3];
const FRIENDS = 7;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
});
const errors = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  console.log(results.at(-1));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 30000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
    return true;
  } catch {
    return false;
  }
};

async function open(u, label, size) {
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${label}: ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => errors.push(`${label} PAGEERROR ${e.message}`));
  await page.goto(u);
  await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 400000, polling: 500 });
  return page;
}
// Friends' pages stop drawing to spare the one graphics card; the 1 s timer keeps them connected and sending.
const stopDrawing = (page) => page.evaluate(() => { window.requestAnimationFrame = () => 0; });
const small = { width: 320, height: 180 };

const host = await open(url, 'host', { width: 1280, height: 720 });
await host.locator('#tFriends').click();
await host.locator('#fName').fill('Host');
await host.locator('#fStart').click();
await until(host, () => /#join=/.test(document.querySelector('#fLink').value));
const code = /#join=(\w+)/.exec(await host.locator('#fLink').inputValue())?.[1];
check('invite link made', !!code, code);
await shot('01-friends-panel-empty');
await host.keyboard.press('Escape');
await host.locator('#tPlay').click();
await until(host, () => __ll.game.mode === 'walk');

const friends = [];
for (let i = 0; i < FRIENDS; i++) {
  const p = await open(`${url}#join=${code}`, `friend${i + 1}`, small);
  await p.locator('#jName').fill(`Friend ${i + 1}`);
  friends.push(p);
  console.log(`friend ${i + 1} loaded`);
}
// All through the same link, all at the same moment.
await Promise.all(friends.map((p) => p.evaluate(() => document.querySelector('#jGo').click())));
const allIn = await until(host, (n) => __ll.game.net.players.size === n, FRIENDS, 60000);
check(`${FRIENDS} friends join through one link at once`, allIn, String(await host.evaluate(() => __ll.game.net.players.size)));
const views = await Promise.all(friends.map((p) => until(p, (n) => __ll.game.net.players.size === n, FRIENDS, 30000)));
check('each friend knows about everyone else', views.every(Boolean), views.join(','));
const slots = await Promise.all(friends.map((p) => p.evaluate(() => __ll.game.net.slot)));
check('every friend gets a boat place of their own', new Set(slots).size === FRIENDS && !slots.includes(0), slots.join(','));
const names = await host.evaluate(() => [...__ll.game.net.players.values()].map((p) => p.name).sort());
check('names arrive', names.length === FRIENDS && names.every((n) => /^Friend \d$/.test(n)), names.join(', '));

await until(friends[FRIENDS - 1], () => __ll.game.mode === 'walk', null, 40000);
await Promise.all(friends.map(stopDrawing));
await wait(2500);

// Line them up along the jetty and look.
await Promise.all(friends.map((p, i) => p.evaluate((k) => {
  const g = __ll.game;
  g.mode = 'walk';
  g.px = -9 - k * 1.5;
  g.pz = k % 2 ? 0.5 : -0.5;
  g.py = 1.06;
  g.fisher.root.position.set(g.px, g.py, g.pz);
  g.facing = -Math.PI / 2;
  g.fisher.root.rotation.set(0, g.facing, 0);
  g.fisher.root.updateMatrixWorld(true);
}, i)));
await host.evaluate(() => { __ll.place(-4, 0, 1.57); __ll.setHour(18.3); __ll.game.yaw = 1.57; __ll.game.pitch = 0.16; });
await wait(4500);
const figures = await host.evaluate(() => [...__ll.game.remotes.values()].filter((r) => r.fisher.root.visible).length);
check('host sees all seven figures', figures === FRIENDS, String(figures));
const tags = await host.evaluate(() => document.querySelectorAll('.nameTag').length);
check('and seven name tags', tags === FRIENDS, String(tags));
await host.screenshot({ path: path.join(outDir, '02-full-cove.png') });
const stats = await host.evaluate(() => __ll.stats());
console.log('host with a full cove:', stats.fps, 'fps,', stats.res);
await host.evaluate(() => { __ll.game.pipe.renderScale = 1; __ll.game.resize(); });
await wait(1500);
await host.screenshot({ path: path.join(outDir, '03-full-cove-sharp.png') });

// One seat left? No: a ninth is told plainly.
const ninth = await open(`${url}#join=${code}`, 'ninth', small);
await ninth.evaluate(() => document.querySelector('#jGo').click());
const told = await until(ninth, () => document.querySelector('#jStatus').classList.contains('bad'), null, 30000);
const why = await ninth.locator('#jStatus').textContent();
check('a ninth person is told the cove is full', told && /full/.test(why), why);
check('and nobody else is disturbed', (await host.evaluate(() => __ll.game.net.players.size)) === FRIENDS);

// Someone goes; their place opens up for the one who was waiting.
await friends[2].evaluate(() => __ll.game.ui.hooks.leaveCove());
check('when one leaves, everyone hears', await until(host, (n) => __ll.game.net.players.size === n, FRIENDS - 1) && await until(friends[0], (n) => __ll.game.net.players.size === n, FRIENDS - 1));
await ninth.evaluate(() => document.querySelector('#jGo').click());
check('the waiting person can now get in', await until(host, (n) => __ll.game.net.players.size === n, FRIENDS, 40000));
const freed = await ninth.evaluate(() => __ll.game.net.slot);
check('and takes the free boat place', freed === slots[2], `${freed} (was ${slots[2]})`);

check('no errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);

function shot(n) {
  return host.screenshot({ path: path.join(outDir, n + '.png') });
}
