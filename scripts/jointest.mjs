// Dev tool: joins a real invite link with no window and logs each step of the connection.
// Usage: node scripts/jointest.mjs <outDir> <inviteLink> [secondsToStay]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2];
const link = process.argv[3];
const stay = Number(process.argv[4] ?? 20);
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.exposeFunction('__log', (s) => log(s));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log(`console ${m.type()}:`, m.text().slice(0, 300)); });
page.on('pageerror', (e) => log('PAGE ERROR', e.message));
await page.addInitScript(() => {
  const RTC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) {
    const pc = new RTC(...args);
    const servers = (args[0]?.iceServers ?? []).flatMap((s) => [].concat(s.urls)).join(', ');
    window.__log(`webrtc: new connection, servers ${servers}`);
    const seen = {};
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) {
        window.__log(`webrtc: gathering done, own routes ${JSON.stringify(seen)}`);
        return;
      }
      const type = /typ (\w+)/.exec(e.candidate.candidate)?.[1] ?? '?';
      seen[type] = (seen[type] ?? 0) + 1;
    });
    pc.addEventListener('icecandidateerror', (e) => window.__log(`webrtc: server error ${e.errorCode} ${e.url ?? ''} ${e.errorText ?? ''}`));
    pc.addEventListener('iceconnectionstatechange', () => window.__log(`webrtc: ice ${pc.iceConnectionState}`));
    pc.addEventListener('connectionstatechange', () => window.__log(`webrtc: connection ${pc.connectionState}`));
    const add = pc.addIceCandidate.bind(pc);
    const theirs = {};
    pc.addIceCandidate = (c, ...r) => {
      const type = /typ (\w+)/.exec(c?.candidate ?? '')?.[1];
      if (type) {
        theirs[type] = (theirs[type] ?? 0) + 1;
        window.__log(`webrtc: other side's routes so far ${JSON.stringify(theirs)}`);
      }
      return add(c, ...r);
    };
    window.__pc = pc;
    return pc;
  };
  window.RTCPeerConnection.prototype = RTC.prototype;
  const WS = window.WebSocket;
  window.WebSocket = function (u, p) {
    const ws = p ? new WS(u, p) : new WS(u);
    const host = new URL(u).host;
    window.__log(`service: connecting to ${host}`);
    ws.addEventListener('open', () => window.__log('service: connected'));
    ws.addEventListener('close', (e) => window.__log(`service: closed ${e.code}`));
    ws.addEventListener('error', () => window.__log('service: error'));
    return ws;
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket.prototype = WS.prototype;
});

log('opening', link);
await page.goto(link);
await page.waitForFunction(() => window.__ll?.ready === true, null, { timeout: 240000, polling: 300 });
log('game ready; join card shown:', await page.locator('#tJoin').isVisible());
await page.locator('#jName').fill('Claude test');
await page.locator('#jGo').click();
log('pressed Join');

let lastStatus = '';
let joined = false;
const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  const st = await page.evaluate(() => ({
    status: document.querySelector('#jStatus')?.textContent ?? '',
    failed: document.querySelector('#jStatus')?.classList.contains('bad'),
    role: __ll.game.net.role,
    players: __ll.game.net.players.size,
  }));
  if (st.status !== lastStatus) {
    log(`status: "${st.status}"`);
    lastStatus = st.status;
  }
  if (st.players > 0) { joined = true; break; }
  if (st.failed || st.role === 'solo') break;
  await page.waitForTimeout(150);
}
log(joined ? 'JOINED' : 'DID NOT JOIN');

if (joined) {
  const route = await page.evaluate(async () => {
    const stats = await window.__pc.getStats();
    let pair = null;
    stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    if (!pair) return 'none yet';
    return `${stats.get(pair.localCandidateId)?.candidateType} to ${stats.get(pair.remoteCandidateId)?.candidateType}, ${Math.round((pair.currentRoundTripTime ?? 0) * 1000)} ms`;
  });
  log('route:', route);
  const started = Date.now();
  while (Date.now() - started < stay * 1000) {
    await page.waitForTimeout(5000);
    const v = await page.evaluate(() => {
      const g = __ll.game;
      return {
        role: g.net.role, mode: g.mode, slot: g.net.slot, hour: +g.hour.toFixed(2),
        people: [...g.net.players.values()].map((p) => ({
          name: p.name, slot: p.slot, seen: !!p.state, at: p.state ? [Math.round(p.state.x), Math.round(p.state.z)] : null, mode: p.state?.mode, visible: g.friends.remotes.get(p.id)?.fisher.root.visible ?? false,
        })),
      };
    });
    log(JSON.stringify(v));
    if (v.role === 'solo') { log('dropped back to solo'); break; }
  }
  await page.screenshot({ path: path.join(outDir, 'joined.png') });
  await page.evaluate(() => __ll.game.ui.hooks.leaveCove());
  log('left the cove');
  await page.waitForTimeout(600);
} else {
  await page.screenshot({ path: path.join(outDir, 'failed.png') });
}
await browser.close();
process.exit(joined ? 0 : 1);
