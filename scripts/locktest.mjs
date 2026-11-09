// Dev tool: real browser window. Checks the mouse capture (including recovering after refusals), mouse
// sensitivity, and silence when the game is not in front. Usage: node scripts/locktest.mjs <fileUrl>
import { chromium } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';

const url = process.argv[2];
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-headful'), {
  channel: 'chrome', headless: false, viewport: null,
  args: ['--window-size=1280,760', '--autoplay-policy=no-user-gesture-required'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => {
  // Lets a test make Chrome refuse the next few lock requests, as it does just after Esc.
  window.__refuse = 0;
  window.__requests = 0;
  const orig = Element.prototype.requestPointerLock;
  Element.prototype.requestPointerLock = function (...a) {
    window.__requests += 1;
    if (window.__refuse > 0) {
      window.__refuse -= 1;
      return Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'));
    }
    return orig.apply(this, a);
  };
});
// The real lock: test browsers get a stand-in unless they ask, so the other tests never trap the mouse.
await page.goto(url.includes('?') ? url.replace('?', '?reallock&') : url.replace(/(#|$)/, '?reallock$1'));
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
await page.bringToFront();
const results = [];
const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`);
const wait = (ms) => page.waitForTimeout(ms);
const locked = () => page.evaluate(() => !!document.pointerLockElement);
const click = async (x = 640, y = 380) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
};

await wait(800);
await click();
await wait(5400);
check('mouse captured when the game starts', await locked());
check('cursor hidden while captured', await page.evaluate(() => document.body.classList.contains('captured')));

// Sensitivity: same movement, double the setting, double the turn.
const turn = async () => {
  const before = await page.evaluate(() => __ll.game.cam.yaw);
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 0 })));
  await wait(120);
  return Math.abs((await page.evaluate(() => __ll.game.cam.yaw)) - before);
};
await page.evaluate(() => { __ll.game.save.sensitivity = 1; __ll.game.input.sensitivity = 1; });
const t1 = await turn();
await page.evaluate(() => { __ll.game.input.sensitivity = 2; });
const t2 = await turn();
await page.evaluate(() => { __ll.game.input.sensitivity = 1; });
check('sensitivity scales the turn', t1 > 0.05 && Math.abs(t2 / t1 - 2) < 0.25, `${t1.toFixed(3)} then ${t2.toFixed(3)} rad`);

// Menu frees the mouse, and going back recaptures it even when Chrome refuses at first.
await page.evaluate(() => __ll.game.openMenu());
await wait(500);
check('menu frees the mouse', !(await locked()));
check('cursor shown in the menu', !(await page.evaluate(() => document.body.classList.contains('captured'))));
const box = await page.locator('#mResume').boundingBox();
await page.evaluate(() => { window.__refuse = 3; window.__requests = 0; });
await click(box.x + box.width / 2, box.y + box.height / 2);
await wait(2600);
const req = await page.evaluate(() => window.__requests);
check('recaptures after Chrome refuses three times', await locked(), `${req} requests`);

const before = await page.evaluate(() => __ll.game.cam.yaw);
await page.evaluate(() => { __ll.game.openMenu(); });
await wait(300);
await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 300, movementY: 0 })));
await wait(150);
check('moving the mouse in the menu does not turn the view', Math.abs((await page.evaluate(() => __ll.game.cam.yaw)) - before) < 0.001);
await page.evaluate(() => __ll.game.closeMenus());
await click();
await wait(600);

// Mute when away.
const level = () => page.evaluate(() => +__ll.game.audio.gateLevel.toFixed(3));
check('sound on while in front', (await level()) > 0.9, String(await level()));
check('silent when away is the default', await page.evaluate(() => __ll.game.save.muteAway === true || JSON.parse(localStorage.getItem('longlight.save.v1') ?? '{}').muteAway !== false));
await page.evaluate(() => { window.__hf = document.hasFocus; document.hasFocus = () => false; });
await wait(700);
check('silent when the window is not in front', (await level()) < 0.02, String(await level()));
await page.evaluate(() => { document.hasFocus = window.__hf; });
await wait(1300);
check('sound returns on coming back', (await level()) > 0.9, String(await level()));
await page.evaluate(() => { __ll.game.save.muteAway = false; document.hasFocus = () => false; });
await wait(700);
check('option to keep playing works', (await level()) > 0.9, String(await level()));
await page.evaluate(() => { __ll.game.save.muteAway = true; document.hasFocus = window.__hf; });

// Favicon reached the built file.
const icon = await page.evaluate(() => document.querySelector('link[rel="icon"]')?.href?.slice(0, 22));
check('favicon is embedded', !!icon && icon.startsWith('data:image/png'), icon ?? 'none');

console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
