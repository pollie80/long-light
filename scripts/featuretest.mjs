// Dev tool: the three guns, sitting back in first person, the gear page, and the touches to fishing.
// Usage: node scripts/featuretest.mjs <outDir> [url]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const outDir = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:5188/';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'long-light-feature-profile'), {
  channel: 'chrome', headless: true, viewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().slice(0, 1500)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });

const results = [];
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.jpg'), type: 'jpeg', quality: 88 });
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const g = (fn, arg) => page.evaluate(fn, arg);

await wait(1200);
await page.keyboard.press('KeyX');
await wait(5200);
await g(() => __ll.setHour(17.4));
await g(() => __ll.place(-12, 0, 1.57));
await wait(600);

// ---- Guns -----------------------------------------------------------------------------------------
const birdAt = async (dist, side = 0, up = 0) => g(([dist, side, up]) => {
  const G = __ll.game;
  G.hunt.nextFlock = 0;
  const dir = G.shotDir();
  const right = { x: Math.cos(G.yaw), z: -Math.sin(G.yaw) };
  const b = G.hunt.birds.find((x) => !x.alive) ?? G.hunt.birds[0];
  b.active = true; b.alive = true; b.dead = false; b.root.visible = true; b.vel.set(0, 0, 0);
  b.root.position.copy(G.camera.position).addScaledVector(dir, dist);
  b.root.position.x += right.x * side;
  b.root.position.z += right.z * side;
  b.root.position.y += up;
  return G.hunt.birds.filter((x) => x.alive).length;
}, [dist, side, up]);
const clearBirds = () => g(() => { for (const b of __ll.game.hunt.birds) { b.alive = false; b.root.visible = false; b.active = false; } __ll.game.hunt.nextFlock = 1e9; });
const tally = () => g(() => Object.values(__ll.game.save.birds).reduce((a, b) => a + b, 0));
const click = async () => { await page.mouse.down(); await page.mouse.up(); };

await page.mouse.move(800, 450);
await page.keyboard.press('Digit2');
await wait(700);
const rifle = await g(() => ({ out: __ll.game.gunOut, kind: __ll.game.gunKind, rounds: document.querySelectorAll('#rounds b').length, name: document.getElementById('gunName').textContent, long: __ll.game.fisher.gunKind }));
check('2 brings out the hunting rifle', rifle.out && rifle.kind === 'rifle' && rifle.long === 'rifle' && rifle.rounds === 5 && /rifle/i.test(rifle.name), JSON.stringify(rifle));
await g(() => { __ll.game.pitch = -0.12; });
await wait(500);
await shot('g1-rifle');
await page.mouse.down({ button: 'right' });
await wait(900);
const scope = await g(() => ({ aim: +__ll.game.aimK.toFixed(2), fov: +__ll.game.camera.fov.toFixed(1), scope: !document.getElementById('scope').classList.contains('gone'), fp: __ll.game.fisher.fp }));
check('right-click looks through the scope', scope.aim > 0.9 && scope.fov < 12 && scope.scope && scope.fp, JSON.stringify(scope));
await clearBirds();
const t0 = await tally();
await birdAt(160);
await click();
await wait(200);
const t1 = await tally();
check('the rifle drops a bird 160 m off', t1 > t0, `${t0} then ${t1}`);
await shot('g2-scope');
const before = await g(() => __ll.game.ammo.rifle);
await click();
await wait(100);
check('and the bolt has to be worked before the next shot', (await g(() => __ll.game.ammo.rifle)) === before, `${before} left`);
await wait(1000);
await page.mouse.up({ button: 'right' });
await wait(700);
check('letting go of right-click leaves the scope', await g(() => document.getElementById('scope').classList.contains('gone') && __ll.game.camera.fov > 30 && !__ll.game.fisher.fp));

await page.keyboard.press('Digit3');
await wait(700);
check('3 brings out the shotgun', await g(() => __ll.game.gunKind === 'shotgun' && document.querySelectorAll('#rounds b').length === 2));
await shot('g3-shotgun');
await clearBirds();
const s0 = await tally();
await birdAt(22, 0, 0);
await birdAt(22, 1.4, 0.6);
await birdAt(22, -1.3, -0.4);
await click();
await wait(200);
const s1 = await tally();
check('one barrel brings down several birds close by', s1 - s0 >= 2, `${s1 - s0} birds`);
await clearBirds();
await birdAt(90);
const s2 = await tally();
await wait(300);
await click();
await wait(200);
check('but not one far off', (await tally()) === s2);
check('both barrels fired, it reloads on its own', await g(() => __ll.game.ammo.shotgun === 0 && /reloading/.test(document.getElementById('gunName').textContent)));
await wait(2400);
check('two fresh shells', await g(() => __ll.game.ammo.shotgun === 2));
await page.mouse.wheel(0, 120);
await wait(500);
check('scrolling goes round to the next gun', await g(() => __ll.game.gunKind === 'pistol'));
await click();
await wait(200);
await page.keyboard.press('KeyR');
await wait(1900);
check('R reloads a part-used gun', await g(() => __ll.game.ammo.pistol === 7));
await page.keyboard.press('KeyG');
await wait(500);
check('G puts it away', await g(() => !__ll.game.gunOut));
await g(() => { __ll.game.hunt.nextFlock = 5; });

// ---- Sitting back ---------------------------------------------------------------------------------
await g(() => __ll.place(20, 4, 1.2));
await wait(700);
const far0 = await g(() => __ll.game.camera.position.distanceTo(__ll.game.fisher.root.getWorldPosition(new __ll.THREE.Vector3())));
await page.keyboard.press('KeyV');
await wait(900);
await shot('r1-going-in');
await wait(2400);
const r1 = await g(() => {
  const G = __ll.game;
  const eye = G.eyePos(new __ll.THREE.Vector3());
  return { mode: G.mode, relax: G.relax, k: +G.relaxK.toFixed(2), gap: +G.camera.position.distanceTo(eye).toFixed(3), fp: G.fisher.fp, pose: G.lastPose.mode, lounge: +G.lastPose.lounge.toFixed(2) };
});
check('V sits down and the view goes into the eyes', r1.relax && r1.mode === 'sit' && r1.k === 1 && r1.gap < 0.02 && r1.fp && r1.pose === 'groundSit' && r1.lounge > 0.9, JSON.stringify(r1));
check('from a normal distance behind', far0 > 2, `${far0.toFixed(1)} m before`);
await shot('r2-first-person');
await g(() => { __ll.game.pitch = -0.85; });
await wait(600);
await shot('r3-looking-up');
await g(() => { __ll.game.pitch = 0.9; });
await wait(600);
await shot('r4-looking-down');
await page.keyboard.press('KeyV');
await wait(2600);
const r2 = await g(() => ({ mode: __ll.game.mode, k: __ll.game.relaxK, fp: __ll.game.fisher.fp, d: __ll.game.camera.position.distanceTo(__ll.game.fisher.root.getWorldPosition(new __ll.THREE.Vector3())) }));
check('V again stands up and the view comes back out', r2.mode === 'walk' && r2.k === 0 && !r2.fp && r2.d > 3, JSON.stringify(r2));

// In the boat, at dusk.
await g(() => { __ll.board(); __ll.boatAt(-60, 20, 1.4); __ll.setHour(19.2); });
await wait(1500);
await page.keyboard.press('KeyV');
await wait(3300);
const b1 = await g(() => ({ relax: __ll.game.relax, k: __ll.game.relaxK, pose: __ll.game.lastPose.mode, fp: __ll.game.fisher.fp }));
check('in the boat too, leant back', b1.relax && b1.k === 1 && b1.pose === 'boatSit' && b1.fp, JSON.stringify(b1));
await g(() => { __ll.game.yaw = __ll.game.boat.heading + Math.PI; __ll.game.pitch = 0.05; });
await wait(700);
await shot('r5-boat');
// A line out while lying back.
await page.keyboard.down('Space');
await wait(700);
await page.keyboard.up('Space');
await wait(2500);
check('and a line can go out from there', await g(() => __ll.game.fishing.state === 'wait' && __ll.game.relax));
await shot('r6-boat-fishing');
await page.keyboard.press('KeyR');
await wait(300);
await page.keyboard.down('KeyW');
await wait(500);
await page.keyboard.up('KeyW');
await wait(1600);
check('a pull on the oars sits you up again', await g(() => !__ll.game.relax && __ll.game.relaxK < 0.2));
await wait(600);
// Someone else watching sees the lean.
const lean = await g(() => __ll.game.netState().lg);
check('the lean is sent to friends', typeof lean === 'number');

// ---- Fishing touches -----------------------------------------------------------------------------
await g(() => { __ll.boatAt(-60, 20, 1.4); __ll.setHour(17.4); });
await wait(800);
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
await wait(2500);
await g(() => { __ll.game.fishing.waitT = 0.05; __ll.game.fishing.preset = null; });
await wait(400);
await page.keyboard.press('Space');
await wait(300);
check('a quick answer to the bite is a good strike', await g(() => __ll.game.fishing.strike === true && __ll.game.fishing.state === 'reel'));
// Make sure it has room to leap, then make it leap.
await g(() => { const f = __ll.game.fishing; f.fishDist = 14; f.leapT = 0; });
await page.keyboard.down('Space');
let top = 0;
for (let i = 0; i < 12; i++) {
  await wait(70);
  top = Math.max(top, await g(() => __ll.game.fishing.lure.y));
  if (i === 5) await shot('f1-leap');
}
check('a fish on the line leaps clear of the water', top > 0.3, `${top.toFixed(2)} m up`);
for (let i = 0; i < 40 && (await g(() => __ll.game.fishing.state)) === 'reel'; i++) await wait(400);
await page.keyboard.up('Space');
await wait(400);
const card = await g(() => ({ state: __ll.game.fishing.state, note: document.getElementById('cNote').textContent, kick: document.getElementById('cKick').textContent }));
check('the card gives the weight', card.state === 'landed' && /\d (kg|g),/.test(card.note), JSON.stringify(card));
await shot('f2-card');
await page.keyboard.press('Space');
await wait(250);
await shot('f3-let-go');
await wait(700);
const freed = await g(() => __ll.game.swimmers.fish.filter((s) => s.mode === 'free').map((s) => ({ show: +s.show.toFixed(2), y: +s.y.toFixed(2) })));
check('a fish let go swims off where you can see it', freed.length === 1 && freed[0].show > 0.5, JSON.stringify(freed));
await wait(4500);
check('and is gone a few seconds later', await g(() => __ll.game.swimmers.fish.filter((s) => s.mode === 'free').length === 0));
// A record.
const id = await g(() => Object.keys(__ll.game.save.journal)[0]);
await g((id) => { __ll.game.save.journal[id].biggest = 0.01; }, id);
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
// The moment the float settles, before anything in the water can take it.
for (let i = 0; i < 60 && (await g(() => __ll.game.fishing.state)) !== 'wait'; i++) await wait(50);
// Bites on the very next frame, before a fish in the water can be sent for it.
await g((id) => { const f = __ll.game.fishing; f.preset = window.__ll.species(id); f.waitT = 0.0001; }, id);
await wait(400);
await page.keyboard.press('Space');
await page.keyboard.down('Space');
for (let i = 0; i < 40 && (await g(() => __ll.game.fishing.state)) !== 'landed'; i++) await wait(400);
await page.keyboard.up('Space');
await wait(300);
check('a bigger one than before says so', await g(() => /biggest/.test(document.getElementById('cKick').textContent)), await g((id) => `${document.getElementById('cKick').textContent}; wanted ${id}, got ${__ll.game.fishing.species?.id}, journal ${Object.keys(__ll.game.save.journal)}`, id));
await page.keyboard.press('Space');
await wait(1200);

// ---- Gear ----------------------------------------------------------------------------------------
await g(() => { __ll.place(-12, 0, 1.57); __ll.setHour(11); });
await wait(600);
await g(() => __ll.game.ui.hooks.wardrobe('self'));
await wait(600);
await page.locator('#wTabs button', { hasText: 'Gear' }).click();
await wait(500);
const rows = await page.locator('#wBody .wRow').count();
check('the look has a Gear page with rod, float, line and gun', rows === 4, `${rows} rows`);
await page.locator('#wBody .wRow[data-pick="bobber"] .pick button').last().click();
await wait(200);
await page.locator('#wBody .wRow[data-pick="bobber"] .pick button').last().click();
await wait(400);
const gear = await g(() => ({ bobber: __ll.game.fisher.look.bobber, style: __ll.game.fishing.bobber.userData.style, shown: __ll.game.fishing.bobber.visible }));
check('a new float hangs from the rod tip', gear.bobber === 'quill' && gear.style === 'quill' && gear.shown, JSON.stringify(gear));
await page.locator('#wBody .wRow[data-pick="rod"] .pick button').last().click();
await wait(200);
for (let i = 0; i < 5; i++) await page.locator('#wBody .wRow[data-pick="bobber"] .pick button').last().click();
await wait(300);
await page.locator('#wBody .wRow[data-pick="line"] .swatches button').nth(2).click();
await wait(600);
const lineCol = await g(() => __ll.game.fishing.line.material.uniforms.uCol.value.getHexString());
check('the line takes its colour', lineCol !== 'f4eedb', lineCol);
await shot('w1-gear-rod');
await page.locator('#wBody .wRow[data-pick="gunFinish"] .pick button').last().click();
await page.locator('#wBody .wRow[data-pick="gunFinish"] .pick button').last().click();
await page.locator('#wBody .wRow[data-pick="gunFinish"] .pick button').last().click();
await wait(700);
check('the gun row shows a gun in that finish', await g(() => __ll.game.fisher.gun.visible && __ll.game.fisher.look.gunFinish === 'gold'));
await shot('w2-gear-gun');
await wait(2500);
await shot('w3-gear-gun-next');
await page.locator('#wFoot button[data-w="done"]').click();
await wait(600);
check('done puts the float away', await g(() => !__ll.game.fishing.bobber.visible && !__ll.game.fisher.gun.visible));

check('no errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
