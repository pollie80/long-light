// Dev tool: real browsers, real connection service. Plays the whole invite flow and reports.
// Usage: node scripts/nettest.mjs <outDir> <url>
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2];
const url = process.argv[3];
// Friends can open a different copy from the host, such as the public one.
const guestUrl = process.env.LL_GUEST_URL || url;
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

// LL_BLOCK_DIRECT=all: nobody can connect directly. LL_BLOCK_DIRECT=third: only the third player can't.
const blocked = (label) => process.env.LL_BLOCK_DIRECT === 'all' || process.env.LL_BLOCK_DIRECT === label;
async function open(u, label, expectErrors = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  if (blocked(label)) {
    await page.addInitScript(() => {
      // As on a strict network: connections are made, but no route between them ever works.
      const RTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function () { return new RTC({ iceServers: [], iceTransportPolicy: 'relay' }); };
      window.RTCPeerConnection.prototype = RTC.prototype;
    });
  }
  if (!expectErrors) {
    // An unreachable backup service is expected, and is why there are several.
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('WebSocket connection')) errors.push(`${label}: ${m.text().slice(0, 500)}`); });
    page.on('pageerror', (e) => errors.push(`${label} PAGEERROR ${e.message}`));
  }
  await page.goto(u);
  await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
  await wait(800);
  return page;
}
const until = async (page, fn, arg, ms = 15000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 150 });
    return true;
  } catch {
    return false;
  }
};
const shot = (page, n) => page.screenshot({ path: path.join(outDir, n + '.png') });
const visible = (page, sel) => page.locator(sel).isVisible();
const netOf = (page) => page.evaluate(() => {
  const g = __ll.game;
  return { role: g.net.role, slot: g.net.slot, code: g.net.code, players: g.net.players.size, remotes: g.friends.remotes.size, hour: g.hour, running: g.clockRunning, time: g.time, mode: g.mode, home: g.boat.home };
});

// ---- Title screen ---------------------------------------------------------------------------------
const host = await open(url, 'host');
check('title has Play, Your look and friends buttons', (await visible(host, '#tPlay')) && (await visible(host, '#tLook')) && (await visible(host, '#tFriends')));
await shot(host, '01-title');
check('nothing invisible blocks the picture', await host.evaluate(() => document.elementFromPoint(640, 330)?.tagName === 'CANVAS'));
await host.locator('#tLook').click();
await wait(700);
check('Your look opens from the title', await host.evaluate(() => __ll.game.ui.wardrobe.open && __ll.game.mode === 'title'));
await shot(host, '02-title-look');
await host.locator('#wFoot button[data-w="done"]').click();
await wait(500);
check('Done goes back to the title', await host.evaluate(() => !__ll.game.ui.wardrobe.open && __ll.game.mode === 'title' && !document.querySelector('#title').classList.contains('hidden')));

await host.locator('#tFriends').click();
await wait(400);
await host.locator('#fName').click();
await host.keyboard.type('Sam W');
await wait(300);
check('typing a name does not start the game', (await netOf(host)).mode === 'title');
await host.locator('#fStart').click();
const gotLink = await until(host, () => /#join=/.test(document.querySelector('#fLink').value));
const link = await host.locator('#fLink').inputValue();
const code = /#join=(\w+)/.exec(link)?.[1];
check('invite link is made', gotLink && /^https:\/\/pollie80\.github\.io\/long-light\/#join=[a-z2-9]{6}&map=[a-z]+$/.test(link), link);
await shot(host, '03-friends');
await host.locator('#fCopy').click();
await wait(300);
const copied = await host.locator('#fCopyT').textContent();
check('Copy gives an answer', copied === 'Copied' || copied === 'Press Ctrl+C', copied);
await host.keyboard.press('Escape');
await wait(400);
check('Esc in the name box closes the panel', await host.evaluate(() => !__ll.game.ui.friendsOpen && !document.querySelector('#title').classList.contains('hidden')));
await host.locator('#tPlay').click();
check('Play starts the game', await until(host, () => __ll.game.mode === 'walk', null, 12000));

// ---- A friend joins -------------------------------------------------------------------------------
const friend = await open(`${guestUrl}#join=${code}`, 'friend');
check('invite shows the join card', (await visible(friend, '#tJoin')) && !(await visible(friend, '#tBtns')));
await shot(friend, '04-join');
await friend.keyboard.press('KeyX');
await wait(500);
check('a stray key does not skip the invite', (await netOf(friend)).mode === 'title');
await friend.locator('#jName').fill('<img src=x onerror=1>');
await friend.locator('#jGo').click();
check('friend gets in', await until(friend, () => __ll.game.net.players.size > 0 && __ll.game.mode !== 'title', null, 35000), `by ${await friend.evaluate(() => __ll.game.net.route)}`);
check('friend reaches the cove', await until(friend, () => __ll.game.mode === 'walk', null, 12000));
const h1 = await netOf(host);
const f1 = await netOf(friend);
check('both see each other', h1.players === 1 && f1.players === 1 && h1.role === 'host' && f1.role === 'guest');
check('friend has a separate boat place', f1.slot === 1 && f1.home.z < 0, JSON.stringify(f1.home));
check('friend starts by their own boat', await friend.evaluate(() => Math.hypot(__ll.game.boat.x - __ll.game.boat.home.x, __ll.game.boat.z - __ll.game.boat.home.z) < 1));
check('time matches', Math.abs(h1.time - f1.time) < 5 && Math.abs(h1.hour - f1.hour) < 0.1, `${h1.hour.toFixed(2)} / ${f1.hour.toFixed(2)}`);
check('figures appear', await until(host, () => __ll.game.friends.remotes.size === 1) && await until(friend, () => __ll.game.friends.remotes.size === 1));
check('names stay plain text', await host.evaluate(() => {
  const tag = document.querySelector('.nameTag');
  return !!tag && !tag.querySelector('img') && tag.querySelector('.tagName').textContent.includes('<img') && !document.querySelector('#fList img');
}));
check('joined message shows', await until(host, () => document.querySelector('#toast').textContent.includes('joined')));

// Walks are seen.
const before = await host.evaluate(() => __ll.game.friends.remotes.get('p1').fisher.root.getWorldPosition(new (__ll.game.camera.position.constructor)()).toArray());
await friend.keyboard.down('KeyW');
await wait(2600);
await friend.keyboard.up('KeyW');
await wait(800);
const after = await host.evaluate(() => __ll.game.friends.remotes.get('p1').fisher.root.getWorldPosition(new (__ll.game.camera.position.constructor)()).toArray());
const fReal = await friend.evaluate(() => [__ll.game.px, __ll.game.py, __ll.game.pz]);
const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
const err = Math.hypot(after[0] - fReal[0], after[2] - fReal[2]);
check('host sees the friend walk', moved > 3 && err < 0.6, `moved ${moved.toFixed(1)} m, off by ${err.toFixed(2)} m`);

// Stand close and look.
await friend.evaluate(() => { __ll.place(-10, 0, 0); });
await host.evaluate(() => { __ll.place(-14, 0, -Math.PI / 2); __ll.setHour(18.2); });
await wait(2500);
await host.evaluate(() => { const g = __ll.game; g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0.1; });
await wait(800);
await shot(host, '05-host-sees-friend');
const tag = await host.evaluate(() => {
  const t = document.querySelector('.nameTag');
  const r = t.getBoundingClientRect();
  return { o: +t.style.opacity, x: r.x, y: r.y };
});
check('name tag floats over the friend', tag.o > 0.3 && tag.x > 0 && tag.y > 0, JSON.stringify(tag));

// A jump is seen.
const peak = friend.evaluate(async () => {
  const fig = __ll.game.friends.remotes.get('host').fisher.root;
  const base = fig.position.y;
  let top = base;
  let sawAir = false;
  const end = performance.now() + 1800;
  while (performance.now() < end) {
    top = Math.max(top, fig.position.y);
    sawAir ||= __ll.game.net.players.get('host').state.air;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { up: top - base, sawAir };
});
await wait(200);
await host.keyboard.press('Space');
const seen = await peak;
check('friend sees the host jump', seen.up > 0.2, `${seen.up.toFixed(2)} m up, marked in the air: ${seen.sawAir}`);

// A friend hears and sees a shot.
await host.keyboard.press('KeyG');
await wait(500);
check('friend sees the host raise a gun', await until(friend, () => __ll.game.net.players.get('host').state?.gun === true && __ll.game.friends.remotes.get('host').fisher.gun.visible, null, 4000));
await host.mouse.move(640, 360);
await host.mouse.down();
await host.mouse.up();
check('and the shot is counted', await until(friend, () => (__ll.game.net.players.get('host').state?.shots ?? 0) > 0, null, 4000));
await host.keyboard.press('KeyG');
await wait(400);

// Cheers: nothing from one bottle, fireworks from two.
await host.evaluate(() => { __ll.setHour(21.5); });
await wait(2000);
const pre = await friend.evaluate(() => __ll.game.fireworks.shows);
await host.keyboard.press('KeyC');
await wait(1200);
check('one raised bottle sets nothing off', (await friend.evaluate(() => __ll.game.fireworks.shows)) === pre);
check('friend is asked', await until(friend, () => document.querySelector('#prompt').textContent.includes('wants to cheers'), null, 4000), await friend.locator('#prompt').textContent());
await friend.keyboard.press('KeyC');
check('two raised bottles set them off for the friend', await until(friend, (n) => __ll.game.fireworks.shows > n, pre, 5000));
check('and for the host', await until(host, () => __ll.game.fireworks.shows > 0, null, 5000));
await wait(2200);
await shot(host, '05b-fireworks');
await wait(1100);
await shot(host, '05c-fireworks');
await wait(5000);

// Clock, both ways.
await host.evaluate(() => __ll.setHour(9.5));
check('host moves the sun for everyone', await until(friend, () => Math.abs(__ll.game.hour - 9.5) < 0.1, null, 5000));
await friend.evaluate(() => __ll.setHour(20.3));
check('friend moves the sun for everyone', await until(host, () => Math.abs(__ll.game.hour - 20.3) < 0.1, null, 5000));
await friend.evaluate(() => __ll.game.ui.hooks.setClockRunning(true));
await wait(1500);
await host.evaluate(() => { __ll.game.ui.hooks.setClockRunning(false); });
check('pausing the sun reaches friends', await until(friend, () => __ll.game.clockRunning === false, null, 5000));
await host.evaluate(() => { __ll.game.ui.hooks.setClockRunning(true); __ll.setHour(18.2); __ll.game.ui.hooks.setClockRunning(true); });
await wait(1500);

// Look, through the real menu.
await friend.evaluate(() => __ll.game.openMenu());
await wait(400);
await shot(friend, '06-menu');
await friend.locator('#mLook').click();
await wait(500);
await friend.locator('#wFoot button[data-w="silly"]').click();
await wait(400);
await shot(friend, '07-wardrobe');
await friend.locator('#wFoot button[data-w="done"]').click();
await wait(1000);
const looks = [await friend.evaluate(() => JSON.stringify(__ll.game.fisher.look)), await host.evaluate(() => JSON.stringify(__ll.game.friends.remotes.get('p1').fisher.look))];
check('a new look reaches friends', looks[0] === looks[1]);

// Boat.
await host.evaluate(() => __ll.board());
check('host boards', await until(host, () => __ll.game.mode === 'row', null, 6000));
check('friend sees host in a boat', await until(friend, () => __ll.game.friends.remotes.get('host').inBoat === true, null, 5000));
await host.keyboard.down('KeyW');
await wait(3500);
await host.keyboard.up('KeyW');
await wait(800);
const boats = [await host.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]), await friend.evaluate(() => [__ll.game.friends.remotes.get('host').boat.x, __ll.game.friends.remotes.get('host').boat.z])];
const boatErr = Math.hypot(boats[0][0] - boats[1][0], boats[0][1] - boats[1][1]);
check('rowing is seen', boatErr < 1.2, `off by ${boatErr.toFixed(2)} m`);
await host.keyboard.down('Space');
await wait(900);
await host.keyboard.up('Space');
check('casting is seen', await until(friend, () => { const r = __ll.game.friends.remotes.get('host'); return r.line.visible && __ll.game.net.players.get('host').state.fs !== 'idle'; }, null, 5000));
await friend.evaluate(() => { const b = __ll.game.friends.remotes.get('host').boat; __ll.place(-24, 0, 0); const g = __ll.game; g.cam.yaw = Math.atan2(-(b.x - g.px), -(b.z - g.pz)); g.cam.pitch = 0.12; });
await wait(1500);
await shot(friend, '08-friend-sees-boat');

// ---- Sharing a boat ----------------------------------------------------------------------------------
await host.evaluate(() => { __ll.game.fishing.reelIn(); __ll.game.ui.hooks.setClockRunning(false); __ll.setHour(17.4); __ll.boatAt(-22, 3.2, Math.PI / 2); __ll.game.boat.speed = 0; });
await wait(1600);
await friend.evaluate(() => { const g = __ll.game; __ll.place(-22, 0.7, 0); g.cam.yaw = 0; });
await wait(900);
const offer = await friend.locator('#prompt').textContent();
check("standing by a friend's boat offers a seat", /climb into .*boat/.test(offer), offer);
await shot(friend, '08b-boat-offer');
await friend.keyboard.press('KeyE');
check('friend climbs in', await until(friend, () => __ll.game.mode === 'ride' && __ll.game.friends.rideWith === 'host', null, 5000));
check('the boat owner sees them aboard', await until(host, () => __ll.game.friends.remotes.get('p1').fisher.root.parent === __ll.game.boat.body, null, 5000));
const before2 = await friend.evaluate(() => __ll.game.fisher.root.getWorldPosition(new (__ll.game.camera.position.constructor)()).toArray());
await host.keyboard.down('KeyW');
await wait(4000);
await host.keyboard.up('KeyW');
await wait(900);
const after2 = await friend.evaluate(() => __ll.game.fisher.root.getWorldPosition(new (__ll.game.camera.position.constructor)()).toArray());
const trueBoat = await host.evaluate(() => [__ll.game.boat.x, __ll.game.boat.z]);
const carried = Math.hypot(after2[0] - before2[0], after2[2] - before2[2]);
const offBoat = Math.hypot(after2[0] - trueBoat[0], after2[2] - trueBoat[1]);
check("the passenger goes where the boat goes", carried > 2 && offBoat < 3.5, `carried ${carried.toFixed(1)} m, ${offBoat.toFixed(1)} m from the middle of the boat`);
await friend.evaluate(() => { const g = __ll.game; g.cam.yaw = g.vessel.heading + 2.3; g.cam.pitch = 0.32; });
await wait(1200);
await shot(friend, '08c-passenger');
await friend.keyboard.down('Space');
await wait(700);
check('a passenger can fish', (await friend.evaluate(() => __ll.game.fishing.state)) === 'charge');
await friend.keyboard.up('Space');
await wait(400);
await friend.evaluate(() => __ll.game.fishing.reelIn());
await wait(300);
await friend.keyboard.press('KeyP');
await wait(1500);
const pgap = await friend.evaluate(() => {
  const g = __ll.game;
  const V = g.camera.position.constructor;
  return new V(0, -0.3, 0).applyMatrix4(g.fisher.fore[0].matrixWorld).distanceTo(g.pet.headTop(new V()));
});
check("a passenger can pat their pet", pgap < 0.3, `${pgap.toFixed(2)} m`);
await wait(1600);
const third = await open(`${guestUrl}#join=${code}`, 'third');
await third.locator('#jName').fill('Jo');
await third.locator('#jGo').click();
check('a third person joins', await until(third, () => __ll.game.net.players.size === 2, null, 35000), `by ${await third.evaluate(() => __ll.game.net.route)}`);
check('third has a boat place of their own', (await netOf(third)).slot === 2);
check('the others see them', await until(friend, () => __ll.game.net.players.size === 2) && await until(host, () => __ll.game.net.players.size === 2));
// A second passenger, in the same boat.
await until(third, () => __ll.game.mode === 'walk', null, 12000);
await host.evaluate(() => { __ll.boatAt(-22, 3.2, Math.PI / 2); __ll.game.boat.speed = 0; });
await wait(1500);
await third.evaluate(() => { const g = __ll.game; __ll.place(-22, 0.7, 0); });
await wait(900);
await third.keyboard.press('KeyE');
check('a second friend climbs into the same boat', await until(third, () => __ll.game.mode === 'ride' && __ll.game.friends.rideWith === 'host', null, 6000));
const seatsApart = await host.evaluate(async () => {
  await new Promise((f) => setTimeout(f, 1500));
  const g = __ll.game;
  const figures = [...g.friends.remotes.values()].filter((r) => r.fisher.root.parent === g.boat.body);
  return { aboard: figures.length, apart: figures.length === 2 ? figures[0].fisher.root.position.distanceTo(figures[1].fisher.root.position) : 0 };
});
check('and they get separate seats', seatsApart.aboard === 2 && seatsApart.apart > 0.3, JSON.stringify(seatsApart));
await host.evaluate(() => { const g = __ll.game; g.cam.yaw = g.boat.heading + 2.3; g.cam.pitch = 0.32; });
await wait(1000);
await shot(host, '08d-three-in-a-boat');
// Stepping off at the jetty.
await third.keyboard.press('KeyE');
check('a passenger steps off onto the jetty', await until(third, () => __ll.game.mode === 'walk' && __ll.game.friends.rideWith === null, null, 6000));
check('the others see them go', await until(host, () => [...__ll.game.friends.remotes.values()].filter((r) => r.fisher.root.parent === __ll.game.boat.body).length === 1, null, 6000));
await third.evaluate(() => __ll.game.ui.hooks.friends());
await wait(300);
await third.locator('#fLeave').click();
check('leaving tells everyone', await until(friend, () => __ll.game.net.players.size === 1 && __ll.game.friends.remotes.size === 1) && await until(host, () => __ll.game.net.players.size === 1));
check('the one who left is alone again', (await netOf(third)).role === 'solo' && (await netOf(third)).remotes === 0);
await third.context().close();

await host.evaluate(() => __ll.game.ui.hooks.setClockRunning(true));

// ---- A covered host window ---------------------------------------------------------------------------
await host.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
const hA = (await netOf(host)).hour;
await wait(17000);
const hB = (await netOf(host)).hour;
check('friends stay while the host window is covered', (await netOf(friend)).role === 'guest');
check('the sun keeps going meanwhile', hB > hA, `${hA.toFixed(3)} to ${hB.toFixed(3)}`);
check('friends stay in time with it', Math.abs((await netOf(friend)).hour - hB) < 0.1);
await host.evaluate(() => { window.requestAnimationFrame = window.__raf; __ll.game.loop(performance.now()); });
await wait(1000);

// ---- Host leaves ---------------------------------------------------------------------------------------
await friend.evaluate(() => { __ll.game.net.tick; });
check('friend is still aboard until then', (await friend.evaluate(() => __ll.game.mode)) === 'ride');
await host.evaluate(() => __ll.game.ui.hooks.leaveCove());
check('friend carries on alone when the host goes, off the boat too', await until(friend, () => __ll.game.net.role === 'solo' && __ll.game.friends.remotes.size === 0, null, 20000));
check('and is told so', await until(friend, () => document.querySelector('#toast').textContent.includes('closed their game'), null, 3000));
check('and is put safely back on the jetty', await friend.evaluate(() => __ll.game.mode === 'walk' && __ll.game.friends.rideWith === null && __ll.game.fisher.root.parent === __ll.game.scene));
const fEnd = await netOf(friend);
check('friend goes back to the first boat place', fEnd.home.z > 0);
await wait(800);
check('no leftover name tags', await friend.evaluate(() => document.querySelectorAll('.nameTag').length === 0));

// ---- A dead invite -------------------------------------------------------------------------------------
const dead = await open(`${url}#join=zzzzzz`, 'dead', true);
await dead.locator('#jGo').click();
check('a dead invite explains itself', await until(dead, () => document.querySelector('#jStatus').classList.contains('bad'), null, 30000), await dead.locator('#jStatus').textContent());
await shot(dead, '09-dead-invite');
check('can play alone instead', await visible(dead, '#jAlone'));
await dead.locator('#jAlone').click();
check('and that works', await until(dead, () => __ll.game.mode !== 'title', null, 5000));

// ---- Every boat place works, on both sides of the jetty ------------------------------------------------
for (let i = 0; i < 8; i++) {
  const r = await dead.evaluate(async (slot) => {
    const g = __ll.game;
    const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
    g.friends.setBoatSlot(slot);
    await sleep(100);
    __ll.place(g.boat.home.x, 0, Math.PI / 2);
    await sleep(500);
    return { prompt: document.querySelector('#prompt').textContent, home: g.boat.home, at: [g.boat.x, g.boat.z] };
  }, i);
  const offered = /boat/.test(r.prompt);
  let rowed = false;
  let back = false;
  if (offered) {
    await dead.keyboard.press('KeyE');
    rowed = await until(dead, () => __ll.game.mode === 'row', null, 5000);
    if (rowed) {
      await dead.keyboard.press('KeyE');
      back = await until(dead, () => __ll.game.mode === 'walk' && Math.abs(__ll.game.pz) < 1.4, null, 6000);
    }
  }
  check(`boat place ${i + 1}: board and step off`, offered && rowed && back, `${r.home.x}, ${r.home.z} ${offered ? '' : 'no prompt: ' + r.prompt}`);
}

check('no errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
