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
await page.keyboard.press('KeyM');
await wait(500);
check('M on the title opens the places, not the game', await page.evaluate(() => __ll.game.ui.placesOpen && __ll.game.mode === 'title'));
await page.keyboard.press('KeyM');
await wait(400);
check('and M closes them again', await page.evaluate(() => !__ll.game.ui.placesOpen && __ll.game.mode === 'title'));
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

// Running is the normal pace, and Shift walks.
await page.evaluate(() => { __ll.place(0, 0, 1.57); __ll.game.yaw = 1.57; });
await wait(300);
await page.keyboard.down('KeyW');
await wait(1500);
const runV = await page.evaluate(() => __ll.game.speed);
await page.keyboard.down('ShiftLeft');
await wait(1200);
const walkV = await page.evaluate(() => __ll.game.speed);
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
check('W runs and Shift walks', runV > 3.8 && walkV < 2.9, `${runV.toFixed(1)} then ${walkV.toFixed(1)} m/s`);
await wait(500);

// Jumping, and where it gives way to casting.
const jumpState = () => page.evaluate(() => ({ y: __ll.game.fisher.root.position.y, air: __ll.game.airborne, fish: __ll.game.fishing.state }));
const j0 = await jumpState();
await page.keyboard.press('Space');
await wait(240);
const j1 = await jumpState();
check('Space jumps on land', j1.air && j1.y > j0.y + 0.2, `up ${(j1.y - j0.y).toFixed(2)} m`);
await wait(1100);
const j2 = await jumpState();
const groundNow = await page.evaluate(() => __ll.game.py);
check('and comes back down', !j2.air && Math.abs(j2.y - groundNow) < 0.02, `${j2.air} ${j2.y.toFixed(3)} on ground ${groundNow.toFixed(3)}, started ${j0.y.toFixed(3)}`);
await page.evaluate(() => __ll.place(-20, 0, 1.57));
await wait(700);
await page.keyboard.press('Space');
await wait(380);
const j3 = await jumpState();
check('a tap jumps from the deck too', j3.air && j3.fish === 'idle', JSON.stringify(j3));
await wait(1100);
await page.keyboard.down('Space');
await wait(700);
const j4 = await jumpState();
check('a hold on the deck casts instead', !j4.air && j4.fish === 'charge', JSON.stringify(j4));
await page.keyboard.up('Space');
await wait(300);
await page.keyboard.press('KeyR');
await page.evaluate(() => __ll.game.fishing.reelIn());
await wait(300);
await page.evaluate(() => { __ll.place(-8, 0, 1.57); __ll.game.yaw = 1.57; });
await wait(400);
await page.keyboard.down('KeyW');
await wait(700);
await page.keyboard.press('Space');
await wait(120);
const j5 = await jumpState();
await page.keyboard.up('KeyW');
check('walking on the deck, Space jumps at once', j5.air && j5.fish === 'idle', JSON.stringify(j5));
await wait(1100);

// Speed settings, through the real menu sliders.
const slider = (id, v) => page.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event('input')); }, [id, v]);
const walkRun = async () => {
  await page.evaluate(() => { __ll.place(0, 0, 1.57); __ll.game.yaw = 1.57; });
  await wait(300);
  const a = await s();
  await page.keyboard.down('KeyW');
  await wait(2000);
  const b = await s();
  await page.keyboard.up('KeyW');
  await wait(500);
  return Math.hypot(b.px - a.px, b.pz - a.pz);
};
const w100 = await walkRun();
await page.evaluate(() => __ll.game.openMenu());
await wait(300);
await slider('mWalk', 200);
check('walking speed shows in the menu', (await page.locator('#mWalkV').textContent()) === '200%');
await page.evaluate(() => __ll.game.closeMenus());
await wait(300);
const w200 = await walkRun();
check('walking speed setting works', w200 / w100 > 1.6 && w200 / w100 < 2.4, `${w100.toFixed(1)} m then ${w200.toFixed(1)} m`);
check('speed setting is saved', await page.evaluate(() => JSON.parse(localStorage.getItem('longlight.save.v1')).walkSpeed === 2));
await page.evaluate(() => __ll.game.ui.hooks.setWalkSpeed(1));

// The Desert Eagle.
await page.evaluate(() => __ll.place(-12, 0, 1.57));
await wait(400);
await page.keyboard.press('KeyG');
await wait(500);
check('G brings out the gun', await page.evaluate(() => __ll.game.gunOut && __ll.game.fisher.gun.visible && !__ll.game.fisher.rod.visible));
check('with sights on screen', await page.locator('#sights').isVisible());
await shot('gun-out');
// Put a bird straight down the sights, as a flock would pass.
const shootOne = async () => {
  await page.evaluate(() => {
    const g = __ll.game;
    g.pitch = -0.5;
    g.hunt.nextFlock = 0;
  });
  await wait(250);
  await page.evaluate(() => {
    const g = __ll.game;
    const dir = g.shotDir();
    const birds = g.hunt.birds.filter((b) => b.alive);
    const b = birds[0] ?? g.hunt.birds[0];
    b.active = true;
    b.alive = true;
    b.dead = false;
    b.root.visible = true;
    b.vel.set(0, 0, 0);
    b.root.position.copy(g.camera.position).addScaledVector(dir, 30);
  });
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.up();
  await wait(150);
};
const birds0 = await page.evaluate(() => Object.values(__ll.game.save.birds).reduce((a, b) => a + b, 0));
await shootOne();
const birds1 = await page.evaluate(() => Object.values(__ll.game.save.birds).reduce((a, b) => a + b, 0));
check('a shot brings a bird down', birds1 > birds0, `${birds0} then ${birds1}`);
check('and uses a round', (await page.evaluate(() => __ll.game.ammo.pistol)) === 6);
await shot('gun-fired');
await shootOne();
check('two shots use two rounds', (await page.evaluate(() => __ll.game.ammo.pistol)) === 5);
for (let i = 0; i < 5; i++) {
  await page.mouse.down();
  await page.mouse.up();
  await wait(170);
}
check('seven empty it', (await page.evaluate(() => __ll.game.ammo.pistol)) === 0);
await wait(2000);
check('then it reloads', (await page.evaluate(() => __ll.game.ammo.pistol)) === 7);
await page.evaluate(() => { __ll.game.pitch = 0; });
await page.keyboard.press('KeyG');
await wait(400);
check('G puts it away', await page.evaluate(() => !__ll.game.gunOut && !__ll.game.fisher.gun.visible));
await page.keyboard.down('Space');
await wait(500);
check('and casting works again', (await s()).fish === 'charge');
await page.keyboard.up('Space');
await wait(200);
await page.evaluate(() => __ll.game.fishing.reelIn());
await wait(200);

// A real pat: the hand has to end up on the pet.
const handGap = () => page.evaluate(() => {
  const g = __ll.game;
  const V = g.camera.position.constructor;
  const hand = new V(0, -0.3, 0).applyMatrix4(g.fisher.fore[0].matrixWorld);
  return hand.distanceTo(g.pet.headTop(new V()));
});
await page.evaluate(() => __ll.place(40, 8, 1.57));
await wait(1800);
check('the pat prompt shows ashore', (await page.locator('#prompt').textContent()).includes('pat'));
await page.keyboard.press('KeyP');
await wait(1500);
const gapLand = await handGap();
check('patting ashore puts a hand on the pet', gapLand < 0.22, `${gapLand.toFixed(2)} m`);
await shot('pat-land');
await wait(1800);
check('and it finishes by itself', (await page.evaluate(() => __ll.game.patT)) <= 0);

// The pet keeps up, on land and on the jetty.
const petGap = () => page.evaluate(() => __ll.game.pet.worldPos().distanceTo(__ll.game.fisher.root.position));
check('a pet is there', await page.evaluate(() => __ll.game.pet.exists));
await page.evaluate(() => { __ll.place(10, 0, 1.57); __ll.game.yaw = 1.57; });
await wait(600);
await page.keyboard.down('KeyW');
await wait(2500);
await page.keyboard.up('KeyW');
await wait(1500);
const gap = await petGap();
check('the pet follows along the jetty', gap < 3, `${gap.toFixed(1)} m behind`);
await shot('pet-jetty');
const petY = await page.evaluate(() => __ll.game.pet.worldPos().y);
check('and stands on the deck', petY > 1.3 && petY < 2.2, String(petY));
for (const kind of ['cat', 'parrot', 'duck', 'capybara', 'turtle', 'dragon', 'rock', 'dog']) {
  await page.evaluate((v) => __ll.game.ui.wardrobe.hooks.set({ ...__ll.game.fisher.look, pet: v }), kind);
  await wait(250);
  check(`${kind} builds`, await page.evaluate(() => __ll.game.pet.exists));
}
await page.evaluate(() => __ll.game.openMenu());
await wait(200);
await page.locator('#mPet').click();
await wait(700);
await shot('pet-panel');
await page.locator('#wFoot button[data-w="done"]').click();
await wait(300);

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

// Turning: quick, and from a standstill.
await page.evaluate(() => __ll.boatAt(-110, 30, 1.4));
await wait(300);
const h0 = await page.evaluate(() => __ll.game.boat.heading);
await page.keyboard.down('KeyD');
await wait(2000);
await page.keyboard.up('KeyD');
const h1 = await page.evaluate(() => __ll.game.boat.heading);
check('the boat turns easily from a standstill', Math.abs(h1 - h0) > 1.2 && h1 < h0, `${(h1 - h0).toFixed(2)} rad in 2 s`);
await wait(500);

// A pat in the boat.
await page.keyboard.press('KeyP');
await wait(1600);
const gapBoat = await handGap();
check('patting in the boat puts a hand on the pet', gapBoat < 0.25, `${gapBoat.toFixed(2)} m`);
await shot('pat-boat');
await page.keyboard.down('KeyW');
await wait(300);
await page.keyboard.up('KeyW');
check('moving off stops the pat', (await page.evaluate(() => __ll.game.patT)) <= 0);
await wait(800);

// Rowing speed.
const rowRun = async () => {
  await page.evaluate(() => __ll.boatAt(-110, 30, 1.4));
  await wait(300);
  const a = await page.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]);
  await page.keyboard.down('KeyW');
  await wait(4700);
  await page.keyboard.up('KeyW');
  const b = await page.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};
const r100 = await rowRun();
await page.evaluate(() => __ll.game.ui.hooks.setRowSpeed(2));
const r200 = await rowRun();
check('rowing speed setting works', r200 / r100 > 1.4, `${r100.toFixed(1)} m then ${r200.toFixed(1)} m`);
await page.evaluate(() => __ll.game.ui.hooks.setRowSpeed(20));
const rMax = await rowRun();
const vMax = await page.evaluate(() => Math.abs(__ll.game.boat.speed));
check('the top setting is a lot faster', rMax > r100 * 5 && vMax > 12, `${rMax.toFixed(0)} m, ${vMax.toFixed(1)} m/s`);
// Flat out at the shore: stops at the water's edge rather than driving up the beach.
await page.evaluate(() => __ll.boatAt(-60, 0, 3 * Math.PI / 2));
await wait(200);
await page.keyboard.down('KeyW');
await wait(6000);
await page.keyboard.up('KeyW');
const beached = await page.evaluate(() => {
  const b = __ll.game.boat;
  return b.y;
});
check('a fast boat stays afloat at the shore', Math.abs(beached) < 0.4, String(beached));
await page.evaluate(() => __ll.game.ui.hooks.setRowSpeed(1));

// Backing water runs the stroke the other way.
await page.evaluate(() => __ll.boatAt(-110, 30, 1.4));
await wait(300);
const phases = async (key) => {
  await page.keyboard.down(key);
  const out = [];
  for (let i = 0; i < 6; i++) {
    out.push(await page.evaluate(() => __ll.game.boat.oarPhase));
    await wait(120);
  }
  await page.keyboard.up(key);
  await wait(300);
  const TAU = Math.PI * 2;
  let sum = 0;
  for (let i = 1; i < out.length; i++) sum += ((out[i] - out[i - 1] + TAU * 1.5) % TAU) - Math.PI;
  return sum;
};
const dirF = await phases('KeyW');
const speedF = await page.evaluate(() => __ll.game.boat.speed);
const dirB = await phases('KeyS');
await wait(1500);
check('S runs the oars backwards', dirF > 0 && dirB < 0, `${dirF.toFixed(2)} then ${dirB.toFixed(2)}, was doing ${speedF.toFixed(2)} m/s`);

// The boat, through its own panel.
await page.evaluate(() => __ll.game.openMenu());
await wait(300);
await page.locator('#mBoat').click();
await wait(500);
check('Your boat opens its own panel', (await page.locator('#wTitle').textContent()).includes('Your boat'));
const styles = ['canoe', 'bangka', 'raft', 'tub', 'dinghy'];
for (const st of styles) {
  await page.evaluate((v) => __ll.game.ui.wardrobe.hooks.set({ ...__ll.game.fisher.look, boatStyle: v, boatFigure: v === 'canoe' ? 'swan' : v === 'bangka' ? 'dragon' : v === 'raft' ? 'skull' : v === 'tub' ? 'duck' : 'none', boatSail: v === 'bangka' ? 'stripes' : v === 'canoe' ? 'canvas' : v === 'raft' ? 'pirate' : 'none', boatFlag: v === 'raft' ? 'pirate' : v === 'tub' ? 'rainbow' : 'red' }), st);
  await wait(500);
  await shot(`boat-${st}`);
}
check('every boat builds', (await page.evaluate(() => __ll.game.fisher.look.boatStyle)) === 'dinghy');
const before = await page.evaluate(() => JSON.stringify(__ll.game.fisher.look.hat));
await page.locator('#wFoot button[data-w="silly"]').click();
await wait(300);
check('Silly on the boat panel leaves your clothes alone', (await page.evaluate(() => JSON.stringify(__ll.game.fisher.look.hat))) === before);
await page.locator('#wFoot button[data-w="reset"]').click();
await page.locator('#wFoot button[data-w="done"]').click();
await wait(300);

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
check('fish can be seen around the boat', await page.evaluate(() => __ll.game.swimmers.count >= 3), String(await page.evaluate(() => __ll.game.swimmers.count)));
const coming = await page.evaluate(async () => {
  const g = __ll.game;
  const sw = g.swimmers;
  const gap = () => (sw.approacher ? Math.hypot(sw.approacher.x - g.fishing.lure.x, sw.approacher.z - g.fishing.lure.z) : -1);
  // Wait for one to be sent in, however long the wait was going to be.
  for (let i = 0; i < 80 && !sw.approacher; i++) await new Promise((f) => setTimeout(f, 250));
  const a = gap();
  await new Promise((f) => setTimeout(f, 1500));
  const b = gap();
  return { a, b, id: sw.approacher?.catch.id ?? '', preset: g.fishing.preset?.id ?? '' };
});
check('a fish you can see swims to the bobber', coming.a > 0 && coming.b < coming.a && coming.id === coming.preset, JSON.stringify(coming));
await page.evaluate(() => {
  const g = __ll.game;
  const l = g.fishing.lure;
  g.yaw = Math.atan2(-(l.x - g.boat.x), -(l.z - g.boat.z));
  g.pitch = 0.42;
});
await wait(700);
await shot('11b-fish-coming');
const fishPx = await page.evaluate(() => {
  const g = __ll.game;
  const a = g.swimmers.approacher;
  if (!a) return null;
  const p = a.model.position.clone().project(g.camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
});
fs.writeFileSync(path.join(outDir, 'fish-px.json'), JSON.stringify(fishPx));
await page.evaluate(() => { __ll.game.fishing.waitT = 0.05; });
await wait(700);
check('a fish bites', (await s()).fish === 'bite');
check('and it is the one that came', (await page.evaluate(() => __ll.game.fishing.species?.id)) === coming.id, await page.evaluate(() => __ll.game.fishing.species?.id));
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
const jTabs = await page.evaluate(() => ({ places: document.querySelectorAll('#jPlaces button').length, bands: document.querySelectorAll('#jBands button').length }));
check('the journal has a tab for each place and part of the day', jTabs.places === 3 && jTabs.bands === 6, JSON.stringify(jTabs));
const overflow = await page.evaluate(() => {
  const out = [];
  for (const p of document.querySelectorAll('#jPlaces button')) {
    p.click();
    for (let b = 0; b < 6; b++) {
      document.querySelectorAll('#jBands button')[b].click();
      const g = document.getElementById('jgrid');
      const tabs = [...document.querySelectorAll('#jPlaces button, #jBands button')];
      out.push({ n: g.children.length, scrolls: g.scrollHeight > g.clientHeight + 1, clipped: tabs.some((t) => t.scrollWidth > t.clientWidth + 1) });
    }
  }
  return { empty: out.filter((o) => o.n === 0).length, scrolls: out.filter((o) => o.scrolls).length, clipped: out.filter((o) => o.clipped).length, most: Math.max(...out.map((o) => o.n)) };
});
check('every page fits, with nothing empty or cut off', overflow.empty === 0 && overflow.scrolls === 0 && overflow.clipped === 0, JSON.stringify(overflow));
await page.evaluate(() => { document.querySelectorAll('#jPlaces button')[1].click(); document.querySelectorAll('#jBands button')[4].click(); });
await wait(200);
await shot('15j-journal-night');
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

// F and M open their pages in play, and close them again.
await page.evaluate(() => { __ll.game.closeMenus(); });
await wait(300);
await page.keyboard.press('KeyF');
await wait(400);
const fOpen = await page.evaluate(() => __ll.game.ui.friendsOpen);
await page.keyboard.press('KeyF');
await wait(400);
check('F opens and closes Friends', fOpen && (await page.evaluate(() => !__ll.game.ui.friendsOpen)));
await page.keyboard.press('KeyM');
await wait(400);
const mOpen = await page.evaluate(() => __ll.game.ui.placesOpen);
await page.keyboard.press('Escape');
await wait(400);
check('M opens the places', mOpen && (await page.evaluate(() => !__ll.game.ui.placesOpen)));
await page.evaluate(() => __ll.game.openMenu());
await wait(300);
await shot('menu-keys');
await page.evaluate(() => __ll.game.closeMenus());
await wait(300);

// Resetting the journal asks first, then empties it.
await page.evaluate(() => { __ll.game.closeMenus(); });
await wait(300);
const metBefore = await page.evaluate(() => Object.keys(__ll.game.save.journal).length);
await page.keyboard.press('KeyJ');
await wait(600);
await page.locator('#jReset').click();
await wait(200);
const asks = await page.locator('#jResetT').textContent();
check('reset asks before erasing', /again/i.test(asks) && (await page.evaluate(() => Object.keys(__ll.game.save.journal).length)) === metBefore, asks);
await shot('journal-reset-asks');
await page.locator('#jReset').click();
await wait(400);
const after = await page.evaluate(() => ({ kept: Object.keys(__ll.game.save.journal).length, saved: Object.keys(JSON.parse(localStorage.getItem('longlight.save.v1')).journal).length, count: document.getElementById('jCount').textContent }));
check('a second press empties the journal and saves it', metBefore > 0 && after.kept === 0 && after.saved === 0 && after.count.startsWith('0 of'), JSON.stringify(after));

console.log(results.join('\n'));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n---\n'));
else console.log('no console errors');
await browser.close();
