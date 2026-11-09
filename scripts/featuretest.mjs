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
  const dir = G.guns.shotDir();
  const right = { x: Math.cos(G.cam.yaw), z: -Math.sin(G.cam.yaw) };
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
const rifle = await g(() => ({ out: __ll.game.guns.gunOut, kind: __ll.game.guns.gunKind, rounds: document.querySelectorAll('#rounds b').length, name: document.getElementById('gunName').textContent, long: __ll.game.fisher.gunKind }));
check('2 brings out the hunting rifle', rifle.out && rifle.kind === 'rifle' && rifle.long === 'rifle' && rifle.rounds === 5 && /rifle/i.test(rifle.name), JSON.stringify(rifle));
await g(() => { __ll.game.cam.pitch = -0.12; });
await wait(500);
await shot('g1-rifle');
await page.mouse.down({ button: 'right' });
await wait(900);
const scope = await g(() => ({ aim: +__ll.game.guns.aimK.toFixed(2), fov: +__ll.game.camera.fov.toFixed(1), scope: !document.getElementById('scope').classList.contains('gone'), fp: __ll.game.fisher.fp }));
check('right-click looks through the scope', scope.aim > 0.9 && scope.fov < 12 && scope.scope && scope.fp, JSON.stringify(scope));
await clearBirds();
const t0 = await tally();
await birdAt(160);
await click();
await wait(200);
const t1 = await tally();
check('the rifle drops a bird 160 m off', t1 > t0, `${t0} then ${t1}`);
await shot('g2-scope');
const before = await g(() => __ll.game.guns.ammo.rifle);
await click();
await wait(100);
check('and the bolt has to be worked before the next shot', (await g(() => __ll.game.guns.ammo.rifle)) === before, `${before} left`);
await wait(1000);
await page.mouse.up({ button: 'right' });
await wait(700);
check('letting go of right-click leaves the scope', await g(() => document.getElementById('scope').classList.contains('gone') && __ll.game.camera.fov > 30 && !__ll.game.fisher.fp));

await page.keyboard.press('Digit3');
await wait(700);
check('3 brings out the shotgun', await g(() => __ll.game.guns.gunKind === 'shotgun' && document.querySelectorAll('#rounds b').length === 2));
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
check('both barrels fired, it reloads on its own', await g(() => __ll.game.guns.ammo.shotgun === 0 && /reloading/.test(document.getElementById('gunName').textContent)));
await wait(2400);
check('two fresh shells', await g(() => __ll.game.guns.ammo.shotgun === 2));
await page.mouse.wheel(0, 120);
await wait(500);
check('scrolling goes round to the next gun', await g(() => __ll.game.guns.gunKind === 'pistol'));
await click();
await wait(200);
await page.keyboard.press('KeyR');
await wait(1900);
check('R reloads a part-used gun', await g(() => __ll.game.guns.ammo.pistol === 7));
await page.keyboard.press('KeyG');
await wait(500);
check('G puts it away', await g(() => !__ll.game.guns.gunOut));
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
  const eye = G.rest.eyePos(new __ll.THREE.Vector3());
  return { mode: G.mode, relax: G.rest.relax, k: +G.rest.relaxK.toFixed(2), gap: +G.camera.position.distanceTo(eye).toFixed(3), fp: G.fisher.fp, pose: G.lastPose.mode, lounge: +G.lastPose.lounge.toFixed(2) };
});
check('V sits down and the view goes into the eyes', r1.relax && r1.mode === 'sit' && r1.k === 1 && r1.gap < 0.02 && r1.fp && r1.pose === 'groundSit' && r1.lounge > 0.9, JSON.stringify(r1));
check('from a normal distance behind', far0 > 2, `${far0.toFixed(1)} m before`);
await shot('r2-first-person');
await g(() => { __ll.game.cam.pitch = -0.85; });
await wait(600);
await shot('r3-looking-up');
await g(() => { __ll.game.cam.pitch = 0.9; });
await wait(600);
await shot('r4-looking-down');
await page.keyboard.press('KeyV');
await wait(2600);
const r2 = await g(() => ({ mode: __ll.game.mode, k: __ll.game.rest.relaxK, fp: __ll.game.fisher.fp, d: __ll.game.camera.position.distanceTo(__ll.game.fisher.root.getWorldPosition(new __ll.THREE.Vector3())) }));
check('V again stands up and the view comes back out', r2.mode === 'walk' && r2.k === 0 && !r2.fp && r2.d > 3, JSON.stringify(r2));

// In the boat, at dusk.
await g(() => { __ll.board(); __ll.boatAt(-60, 20, 1.4); __ll.setHour(19.2); });
await wait(1500);
await page.keyboard.press('KeyV');
await wait(3300);
const b1 = await g(() => ({ relax: __ll.game.rest.relax, k: __ll.game.rest.relaxK, pose: __ll.game.lastPose.mode, fp: __ll.game.fisher.fp }));
check('in the boat too, leant back', b1.relax && b1.k === 1 && b1.pose === 'boatSit' && b1.fp, JSON.stringify(b1));
await g(() => { __ll.game.cam.yaw = __ll.game.boat.heading + Math.PI; __ll.game.cam.pitch = 0.05; });
await wait(700);
await shot('r5-boat');
// A line out while lying back.
await page.keyboard.down('Space');
await wait(700);
await page.keyboard.up('Space');
await wait(2500);
check('and a line can go out from there', await g(() => __ll.game.fishing.state === 'wait' && __ll.game.rest.relax));
await shot('r6-boat-fishing');
await page.keyboard.press('KeyR');
await wait(300);
await page.keyboard.down('KeyW');
await wait(500);
await page.keyboard.up('KeyW');
await wait(1600);
check('a pull on the oars sits you up again', await g(() => !__ll.game.rest.relax && __ll.game.rest.relaxK < 0.2));
await wait(600);
// Someone else watching sees the lean.
const lean = await g(() => __ll.game.friends.netState().lg);
check('the lean is sent to friends', typeof lean === 'number');

// ---- Fishing touches -----------------------------------------------------------------------------
await g(() => { __ll.boatAt(-60, 20, 1.4); __ll.setHour(17.4); });
await wait(800);
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
await wait(2500);
await g(() => { __ll.game.fishing.waitT = 0.0001; __ll.game.fishing.preset = null; });
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

// ---- Reloading, with each gun's own routine --------------------------------------------------------
await g(() => __ll.place(-12, 0, 1.57));
await wait(500);
for (const [key, kind, at] of [['Digit1', 'pistol', 0.3], ['Digit2', 'rifle', 0.45], ['Digit3', 'shotgun', 0.25]]) {
  await page.keyboard.press(key);
  await wait(600);
  await click();
  await wait(150);
  await page.keyboard.press('KeyR');
  const dur = { pistol: 1.7, rifle: 2.6, shotgun: 2.1 }[kind];
  await wait(dur * 1000 * at);
  const mid = await g(() => {
    const f = __ll.game.fisher;
    return { move: +f.gunMove.position.z.toFixed(3), rx: +f.gunMove.rotation.x.toFixed(2), rz: +f.gunMove.rotation.z.toFixed(2), mag: f.gunMag ? +f.gunMag.position.y.toFixed(3) : 0, magShown: f.gunMag ? f.gunMag.visible : false, ammo: f.gunAmmo.visible, rl: __ll.game.friends.netState().rl };
  });
  await shot(`l-${kind}`);
  const moving = kind === 'pistol' ? (mid.ammo || mid.mag < -0.05) : kind === 'rifle' ? Math.abs(mid.rz) > 0.5 : mid.rx < -0.3;
  check(`the ${kind} reloads with its own moving parts`, moving && mid.rl > 0, JSON.stringify(mid));
  await wait(dur * 1000 * (1 - at) + 400);
  check(`and the ${kind} is full again after`, await g((k) => __ll.game.guns.ammo[k] === ({ pistol: 7, rifle: 5, shotgun: 2 })[k] && __ll.game.fisher.gunMove.rotation.x === 0 && __ll.game.fisher.gunMove.rotation.z === 0, kind));
}
await page.keyboard.press('KeyG');
await wait(400);

// ---- Birds in the journal ------------------------------------------------------------------------
await g(() => { __ll.game.closeMenus(); });
await page.keyboard.press('KeyJ');
await wait(600);
await page.locator('#jKinds button[data-k="birds"]').click();
await wait(500);
const coveBirds = ['mallard', 'herring', 'woodpigeon', 'cormorant', 'greyheron', 'oystercatcher', 'barnowl', 'snowyowl'];
const bj = await g(() => ({ slots: document.querySelectorAll('#jgrid .jslot').length, named: Array.from(document.querySelectorAll('#jgrid .jslot b')).filter((b) => b.textContent !== '...').length, bands: document.getElementById('jBands').classList.contains('gone'), count: document.getElementById('jCount').textContent, log: Object.keys(__ll.game.save.birdLog) }));
check('the journal has a page of birds, with the ones brought down named', bj.slots === 8 && bj.named === bj.log.filter((id) => coveBirds.includes(id)).length && bj.named > 0 && bj.bands, JSON.stringify(bj));
await shot('j-birds');
await page.locator('#jPlaces button').nth(2).click();
await wait(400);
await shot('j-birds-canada');
await page.locator('#jKinds button[data-k="fish"]').click();
await wait(300);
check('and back to the fish', await g(() => !document.getElementById('jBands').classList.contains('gone') && document.querySelectorAll('#jgrid .jslot').length > 0));
await page.keyboard.press('Escape');
await wait(400);

// ---- The energy for rowing hard -----------------------------------------------------------------
await g(() => { __ll.board(); __ll.boatAt(-110, 30, 1.4); __ll.setHour(11); });
await wait(1200);
const e0 = await g(() => __ll.game.rest.energy);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await wait(3000);
const hard = await g(() => ({ e: +__ll.game.rest.energy.toFixed(2), shown: !document.getElementById('energy').classList.contains('gone'), v: +Math.abs(__ll.game.boat.speed).toFixed(1) }));
await shot('e1-rowing-hard');
check('rowing hard uses up energy, and the bar shows', e0 > 0.99 && hard.e < 0.8 && hard.shown, JSON.stringify(hard));
await wait(7000);
const spent = await g(() => ({ e: __ll.game.rest.energy, winded: __ll.game.rest.winded, note: document.getElementById('eNote').textContent }));
check('until it runs out', spent.e < 0.05 && spent.winded && /breath/.test(spent.note), JSON.stringify(spent));
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
await wait(300);
const a0 = await g(() => __ll.game.rest.energy);
await wait(3000);
const a1 = await g(() => __ll.game.rest.energy);
await page.keyboard.press('KeyV');
await wait(500);
const sb0 = await g(() => __ll.game.rest.energy);
await wait(3000);
const sb1 = await g(() => __ll.game.rest.energy);
check('it comes back resting, and faster sitting back', a1 > a0 && (sb1 - sb0) > (a1 - a0) * 1.8, `${(a1 - a0).toFixed(3)} then ${(sb1 - sb0).toFixed(3)} in 3 s`);
const look = await g(() => {
  const G = __ll.game;
  const d = G.camera.getWorldDirection(new __ll.THREE.Vector3());
  const f = G.cam.facingYaw();
  return +(d.x * -Math.sin(f) + d.z * -Math.cos(f)).toFixed(2);
});
check('sitting back in the boat, you look the way the fisher faces', look > 0.85, `facing dot ${look}`);
await shot('e2-boat-sit-back');
await page.keyboard.press('KeyV');
await wait(1500);

// ---- Fish come in smoothly, and are the size the card says ----------------------------------------
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
for (let i = 0; i < 60 && (await g(() => __ll.game.fishing.state)) !== 'wait'; i++) await wait(50);
const wt = await g(() => __ll.game.fishing.waitT);
check('a bite can take up to two minutes', wt >= 4.9 && wt <= 120.5, `${wt.toFixed(1)} s`);
await g(() => { __ll.game.fishing.waitT = Math.min(__ll.game.fishing.waitT, 5); });
for (let i = 0; i < 60 && !(await g(() => !!__ll.game.swimmers.approacher)); i++) await wait(100);
// Sampled on every game frame, against the game's own clock: the frame cap skips some browser frames, so the
// browser's clock would make one frame's turn look twice as quick.
const worst = await g(() => new Promise((done) => {
  let prev = null;
  let pt = 0;
  let w = 0;
  const end = performance.now() + 2000;
  const step = () => {
    const a = __ll.game.swimmers.approacher;
    if (!a || performance.now() > end) return done(w);
    const gt = __ll.game.time;
    if (gt !== pt) {
      const r = a.model.rotation.y;
      if (prev !== null) w = Math.max(w, Math.abs(Math.atan2(Math.sin(r - prev), Math.cos(r - prev))) / (gt - pt));
      prev = r;
      pt = gt;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}));
// The turn is capped at 2.2 a second, and the body sway adds up to about 0.6 on top.
check('a fish coming to the float turns smoothly, without twitching', worst < 3.2, `${worst.toFixed(2)} rad/s at most`);
const cameSize = await g(() => (__ll.game.swimmers.approacher ? __ll.game.swimmers.approacher.size : __ll.game.fishing.presetSize));
await g(() => { __ll.game.fishing.waitT = 0.0001; });
await wait(300);
await page.keyboard.press('Space');
await page.keyboard.down('Space');
for (let i = 0; i < 50 && (await g(() => __ll.game.fishing.state)) !== 'landed'; i++) await wait(400);
await page.keyboard.up('Space');
await wait(300);
const landed = await g(() => ({ size: __ll.game.fishing.landedSize, note: document.getElementById('cNote').textContent }));
const cm = Math.round(cameSize * 100);
check('the one you catch is the size it was in the water, to the centimetre', Math.abs(landed.size - cameSize) < 0.001 && (cameSize >= 1 || landed.note.startsWith(`${cm} cm`)), `${cm} cm in the water; ${landed.note}`);
await shot('f4-caught-like-card');
await page.keyboard.press('Space');
await wait(1500);

// ---- Weather --------------------------------------------------------------------------------------
check('changing weather is off to start with', await g(() => __ll.game.save.weather === false && __ll.game.wx.light === 1));
await g(() => __ll.game.openMenu());
await wait(500);
await page.locator('#mWeather').click();
await wait(300);
check('the switch turns it on and remembers', await g(() => __ll.game.save.weather === true && JSON.parse(localStorage.getItem('longlight.save.v1')).weather === true && document.getElementById('mWeather').classList.contains('on')));
await g(() => __ll.game.closeMenus());
await wait(6000);
const wxNow = await g(() => __ll.game.wx);
// The sky may be on a plain 'fair' spell, which looks like calm; what matters is that it has eased all the way in.
const wxK = await g(() => __ll.game.weatherK);
check('and the weather eases in', wxK > 0.9, `${wxK.toFixed(2)} of the way, ${JSON.stringify(wxNow)}`);
await g(() => { __ll.game.save.weather = false; });

// ---- Reversing turns like backing a car ---------------------------------------------------------
await g(() => { __ll.board(); __ll.boatAt(-110, 30, 1.4); __ll.setHour(11); });
await wait(800);
const fwdTurn = async (keys) => {
  await g(() => __ll.boatAt(-110, 30, 1.4));
  await wait(300);
  const h0 = await g(() => __ll.game.boat.heading);
  for (const k of keys) await page.keyboard.down(k);
  await wait(1500);
  for (const k of keys) await page.keyboard.up(k);
  return (await g(() => __ll.game.boat.heading)) - h0;
};
const ahead = await fwdTurn(['KeyW', 'KeyA']);
const back = await fwdTurn(['KeyS', 'KeyA']);
check('backing with left swings the other way to going forward with left', Math.sign(ahead) !== Math.sign(back) && Math.abs(back) > 0.1, `${ahead.toFixed(2)} forward, ${back.toFixed(2)} backing`);

// ---- Shooting a fish you can see ------------------------------------------------------------------
await page.keyboard.press('KeyE');
await g(() => __ll.place(-12, 0, 1.57));
await wait(600);
await page.keyboard.press('Digit1');
await wait(600);
const metFish = await g(() => Object.keys(__ll.game.save.journal).reduce((t, k) => t + __ll.game.save.journal[k].count, 0));
await g(() => {
  const G = __ll.game;
  G.cam.pitch = 0.12;
});
await wait(300);
const placed = await g(() => {
  const G = __ll.game;
  const sw = G.swimmers;
  const s = sw.fish.find((f) => !f.gone && f.mode === 'wander') ?? null;
  if (!s) return false;
  const dir = G.guns.shotDir();
  const t = (s.model.position.y - G.camera.position.y) / dir.y;
  s.x = G.camera.position.x + dir.x * t;
  s.z = G.camera.position.z + dir.z * t;
  s.tx = s.x;
  s.tz = s.z;
  s.speed = 0;
  s.show = 1;
  return true;
});
await wait(60);
await click();
await wait(400);
const after = await g(() => ({ shot: __ll.game.swimmers.fish.filter((f) => f.mode === 'shot').length, met: Object.keys(__ll.game.save.journal).reduce((t, k) => t + __ll.game.save.journal[k].count, 0) }));
check('a fish in the water can be shot, and goes in the journal', placed && after.shot === 1 && after.met === metFish + 1, JSON.stringify(after));
await shot('s1-fish-shot');
await page.keyboard.press('KeyG');
await wait(400);

// ---- Fish coming to the float stay down ----------------------------------------------------------
await g(() => { __ll.board(); __ll.boatAt(-60, 20, 1.4); });
await wait(800);
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
for (let i = 0; i < 60 && (await g(() => __ll.game.fishing.state)) !== 'wait'; i++) await wait(50);
await g(() => { __ll.game.fishing.waitT = 4; });
for (let i = 0; i < 40 && !(await g(() => !!__ll.game.swimmers.approacher)); i++) await wait(100);
await wait(800);
const depth = await g(() => (__ll.game.swimmers.approacher ? __ll.game.swimmers.approacher.model.position.y : null));
check('a fish coming to the float keeps down under the water', depth !== null && depth < -0.18, String(depth));
await page.keyboard.press('KeyR');
await wait(400);

// ---- A glowing flock after dark -------------------------------------------------------------------
await g(() => __ll.setHour(22));
await g(() => {
  const H = __ll.game.hunt;
  for (const b of H.birds) { b.active = false; b.alive = false; b.root.visible = false; }
  H.rnd = () => 0.01;
  H.nextFlock = 0;
});
await wait(400);
const glow = await g(() => __ll.game.hunt.birds.filter((b) => b.active && b.neon).length);
check('now and then after dark a flock glows', glow > 0, `${glow} glowing`);
await g(() => { __ll.setHour(11); });

// ---- Easy, Relaxed and Challenging ---------------------------------------------------------------
const fstate = () => g(() => __ll.game.fishing.state);
const pickMode = async (d) => {
  await g(() => __ll.game.openMenu());
  await wait(400);
  await page.locator(`#mMode button[data-d="${d}"]`).click();
  await wait(300);
  await g(() => __ll.game.closeMenus());
  await wait(400);
};
check('relaxed is the mode to start with', await g(() => __ll.game.save.difficulty === 'relaxed' && __ll.game.fishing.rules.label === 'Relaxed'));
await g(() => __ll.game.openMenu());
await wait(400);
await page.locator('#mMode button[data-d="challenging"]').click();
await wait(300);
check('the menu switches to Challenging and remembers it', await g(() => __ll.game.save.difficulty === 'challenging' && JSON.parse(localStorage.getItem('longlight.save.v1')).difficulty === 'challenging' && document.querySelector('#mMode button[data-d="challenging"]').classList.contains('on') && __ll.game.fishing.rules.tension === true));
await shot('m1-mode-menu');
await g(() => __ll.game.closeMenus());
await wait(400);
await g(() => { __ll.board(); __ll.boatAt(-60, 20, 1.4); __ll.setHour(11); });
await wait(800);

// The cast power swings up and back down, with a window to let go in.
await page.keyboard.down('Space');
const swing = [];
for (let i = 0; i < 9; i++) {
  await wait(180);
  swing.push(await g(() => __ll.game.fishing.charge));
}
const peak = Math.max(...swing);
const sweetShown = await g(() => __ll.game.fishing.sweetAt > 0.4 && !document.querySelector('#charge .sweet').classList.contains('gone'));
await shot('m2-sweet-spot');
await page.keyboard.up('Space');
check('challenging: the cast swings up and back down, with a sweet spot', peak > 0.9 && swing[swing.length - 1] < peak - 0.15 && sweetShown, swing.map((v) => v.toFixed(2)).join(' '));

// Striking at nothing scares it off.
for (let i = 0; i < 60 && (await fstate()) !== 'wait'; i++) await wait(50);
await wait(300);
const sp0 = await g(() => __ll.game.fishing.spooks);
await page.keyboard.press('Space');
await wait(250);
const sp1 = await g(() => ({ spooks: __ll.game.fishing.spooks, state: __ll.game.fishing.state, wait: +__ll.game.fishing.waitT.toFixed(1), toast: document.getElementById('toast').textContent }));
check('challenging: a strike with no bite scares the fish off', sp1.spooks === sp0 + 1 && sp1.state === 'wait' && sp1.wait > 6 && /scared/.test(sp1.toast), JSON.stringify(sp1));

// A bite has to be answered quickly.
await g(() => { __ll.game.fishing.waitT = 0.0001; });
for (let i = 0; i < 40 && (await fstate()) !== 'bite'; i++) await wait(50);
await wait(2000);
check('challenging: a bite left too long slips away', (await fstate()) === 'wait');

// Reeling against a run snaps the line.
await g(() => { __ll.game.fishing.waitT = 0.0001; });
for (let i = 0; i < 40 && (await fstate()) !== 'bite'; i++) await wait(50);
await page.keyboard.down('Space');
for (let i = 0; i < 20 && (await fstate()) !== 'reel'; i++) await wait(50);
await g(() => { const f = __ll.game.fishing; f.runT = 3; f.runGap = 99; });
await wait(450);
const mid = await g(() => ({ t: +__ll.game.fishing.tension.toFixed(2), shown: !document.getElementById('tension').classList.contains('hidden'), running: document.getElementById('tension').classList.contains('running'), prompt: document.getElementById('prompt').textContent }));
await shot('m3-tension');
for (let i = 0; i < 30 && (await fstate()) === 'reel'; i++) await wait(100);
await page.keyboard.up('Space');
const snapped = await g(() => ({ state: __ll.game.fishing.state, toast: document.getElementById('toast').textContent, bar: document.getElementById('tension').classList.contains('hidden') }));
check('challenging: the strain shows, and says to let go while it runs', mid.shown && mid.running && mid.t > 0.25 && /let go/.test(mid.prompt), JSON.stringify(mid));
check('challenging: reeling against a run snaps the line', snapped.state === 'idle' && /snapped/.test(snapped.toast) && snapped.bar, JSON.stringify(snapped));

// Easy: sooner bites that hook themselves.
await pickMode('easy');
await page.keyboard.down('Space');
await wait(600);
await page.keyboard.up('Space');
for (let i = 0; i < 60 && (await fstate()) !== 'wait'; i++) await wait(50);
const ew = await g(() => __ll.game.fishing.waitT);
check('easy: bites come sooner', ew > 1.5 && ew <= 48.5, `${ew.toFixed(1)} s`);
await g(() => { __ll.game.fishing.waitT = 0.0001; });
for (let i = 0; i < 40 && (await fstate()) !== 'reel'; i++) await wait(100);
check('easy: a bite hooks itself', (await fstate()) === 'reel');
await g(() => __ll.game.fishing.reelIn());
await wait(300);

await pickMode('relaxed');
check('back to Relaxed: the rules are as they were', await g(() => __ll.game.save.difficulty === 'relaxed' && __ll.game.fishing.rules.biteWindow === 9 && __ll.game.hunt.speedK === 1));

check('no errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
