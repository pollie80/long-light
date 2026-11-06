// Dev tool: a short run in a real browser window, to check what headless cannot: sound, pointer lock
// and frame pacing against the real compositor. Usage: node scripts/headful.mjs <fileUrl>
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 800)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
await page.waitForTimeout(1200);
await page.mouse.click(640, 380); // first gesture: starts the game and the sound
await page.waitForTimeout(5500);

const audio = await page.evaluate(async () => {
  const a = __ll.game.audio;
  if (!a.ctx) return { ctx: null };
  const an = a.ctx.createAnalyser();
  an.fftSize = 2048;
  a.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    an.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }
  a.master.disconnect(an);
  return { state: a.ctx.state, peak: +peak.toFixed(4), rate: a.ctx.sampleRate };
});
console.log('audio', JSON.stringify(audio));

const locked = await page.evaluate(() => __ll.game.input.locked);
console.log('pointer locked', locked);

await page.keyboard.down('KeyW');
const frames = await page.evaluate(async () => {
  const times = [];
  await new Promise((res) => {
    let last = performance.now();
    const t0 = last;
    const f = (n) => {
      times.push(n - last);
      last = n;
      if (n - t0 > 6000) res();
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  times.shift();
  times.sort((a, b) => a - b);
  const pct = (p) => +times[Math.floor(times.length * p)].toFixed(1);
  return { n: times.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: +times[times.length - 1].toFixed(1) };
});
await page.keyboard.up('KeyW');
console.log('frame ms while walking', JSON.stringify(frames));
console.log('stats', JSON.stringify(await page.evaluate(() => __ll.stats())));

// Sounds of each kind must not throw.
const fx = await page.evaluate(async () => {
  const a = __ll.game.audio;
  a.step('grass', 0); a.step('wood', 1); a.step('sand', 0); a.step('stone', 1);
  a.oarCatch(1); a.oarDrip(); a.castWhoosh(0.5); a.splash(0.5); a.farSplash(0.2); a.bite(); a.reelClick(); a.landed(); a.firstOfKind(); a.uiTick(); a.pageTurn(); a.creak();
  return 'ok';
}).catch((e) => 'FAILED ' + e.message);
console.log('all sound effects', fx);
await page.waitForTimeout(1500);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
