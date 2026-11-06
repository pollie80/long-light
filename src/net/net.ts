// Live play between friends over WebRTC. One player hosts; everyone connects to the host, who passes
// each player's state on to the others. No game server: the public PeerJS service only introduces
// browsers to each other, and then they talk directly.
import Peer, { DataConnection } from 'peerjs';
import { CharacterLook, cleanLook } from '../actors/look';
import { cleanName, cleanPlayer, cleanState, makeCode, MAX_PLAYERS, Msg, NetState, PEER_PREFIX, PlayerInfo, PROTOCOL } from './protocol';

export type Role = 'solo' | 'host' | 'guest';

export interface NetPlayer extends PlayerInfo {
  state: NetState | null;
}

export interface NetEvents {
  onStatus(text: string): void;
  onChange(): void;
  /** A guest got in: start playing, with this boat slot and clock. */
  onWelcome(slot: number, hour: number, running: boolean, time: number): void;
  onFail(message: string): void;
  onClock(hour: number, running: boolean, time: number): void;
  onJoin(p: NetPlayer): void;
  onLeave(p: NetPlayer): void;
  onHostLost(): void;
  onLook(p: NetPlayer): void;
  onCatch(p: NetPlayer, species: string): void;
}

const SEND_HZ = 15;
const CLOCK_EVERY = 2;
const JOIN_TIMEOUT_MS = 20000;
const HOST_SILENCE_S = 14;

export class Net {
  role: Role = 'solo';
  code = '';
  /** True once the invite link would actually work. */
  ready = false;
  myId = 'host';
  slot = 0;
  players = new Map<string, NetPlayer>();
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private acc = 0;
  private clockAcc = 0;
  private sinceHost = 0;
  private myState: NetState | null = null;
  private joinTimer = 0;
  private nextId = 1;
  name = '';
  look: CharacterLook | null = null;
  getClock: () => { hour: number; running: boolean; time: number } = () => ({ hour: 12, running: true, time: 0 });

  constructor(private ev: NetEvents) {}

  get live(): boolean {
    return this.role !== 'solo';
  }

  // ---- Hosting ------------------------------------------------------------------------------------

  host(name: string, look: CharacterLook) {
    if (this.role !== 'solo') return;
    this.name = cleanName(name);
    this.look = look;
    this.role = 'host';
    this.myId = 'host';
    this.slot = 0;
    this.tryHostId(0);
  }

  private tryHostId(attempt: number) {
    this.code = makeCode();
    this.ev.onStatus('Getting your link…');
    const peer = new Peer(PEER_PREFIX + this.code);
    this.peer = peer;
    peer.on('open', () => {
      this.ready = true;
      this.ev.onStatus('');
      this.ev.onChange();
    });
    peer.on('connection', (c) => this.acceptGuest(c));
    peer.on('disconnected', () => {
      // Lost the introduction service only; friends already here stay connected.
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (e: Error & { type?: string }) => {
      if (e.type === 'unavailable-id' && attempt < 4) {
        peer.destroy();
        this.tryHostId(attempt + 1);
        return;
      }
      if (e.type === 'peer-unavailable') return;
      if (this.conns.size === 0) {
        this.leave();
        this.ev.onFail(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed'
          ? 'Could not reach the connection service. Check your internet and try again.'
          : 'Could not set up the invite. Try again in a moment.');
      }
    });
  }

  private acceptGuest(c: DataConnection) {
    let id = '';
    c.on('data', (raw) => {
      const m = raw as Msg;
      if (!m || typeof m !== 'object') return;
      if (!id) {
        if (m.t !== 'hello') return;
        if (m.v !== PROTOCOL) {
          c.send({ t: 'reject', why: 'version' } satisfies Msg);
          setTimeout(() => c.close(), 400);
          return;
        }
        const slot = this.freeSlot();
        if (slot < 0) {
          c.send({ t: 'reject', why: 'full' } satisfies Msg);
          setTimeout(() => c.close(), 400);
          return;
        }
        id = `p${this.nextId++}`;
        const p: NetPlayer = { id, name: cleanName(m.name), look: cleanLook(m.look), slot, state: null };
        const others: PlayerInfo[] = [{ id: this.myId, name: this.name, look: this.look!, slot: this.slot }, ...[...this.players.values()].map(({ id: i, name, look, slot: s }) => ({ id: i, name, look, slot: s }))];
        const clock = this.getClock();
        c.send({ t: 'welcome', id, slot, hour: clock.hour, running: clock.running, time: clock.time, players: others } satisfies Msg);
        this.broadcast({ t: 'join', p: { id, name: p.name, look: p.look, slot } });
        this.players.set(id, p);
        this.conns.set(id, c);
        this.ev.onJoin(p);
        this.ev.onChange();
        return;
      }
      this.fromGuest(id, m);
    });
    const gone = () => {
      if (!id || !this.players.has(id)) return;
      const p = this.players.get(id)!;
      this.players.delete(id);
      this.conns.delete(id);
      this.broadcast({ t: 'leave', id });
      this.ev.onLeave(p);
      this.ev.onChange();
    };
    c.on('close', gone);
    c.on('error', gone);
  }

  private freeSlot(): number {
    if (this.players.size + 1 >= MAX_PLAYERS) return -1;
    const used = new Set<number>([this.slot, ...[...this.players.values()].map((p) => p.slot)]);
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  private fromGuest(id: string, m: Msg) {
    const p = this.players.get(id);
    if (!p) return;
    switch (m.t) {
      case 's': {
        const st = cleanState(m.st);
        if (st) p.state = st;
        break;
      }
      case 'look':
        p.look = cleanLook(m.look);
        this.broadcast({ t: 'look', id, look: p.look });
        this.ev.onLook(p);
        break;
      case 'name':
        p.name = cleanName(m.name);
        this.broadcast({ t: 'name', id, name: p.name });
        this.ev.onChange();
        break;
      case 'ev':
        this.broadcast({ t: 'ev', id, kind: 'catch', species: String(m.species).slice(0, 24) });
        this.ev.onCatch(p, String(m.species).slice(0, 24));
        break;
      case 'setClock': {
        const h = typeof m.h === 'number' && Number.isFinite(m.h) ? ((m.h % 24) + 24) % 24 : 12;
        this.ev.onClock(h, m.r === true, this.getClock().time);
        this.pushClock();
        break;
      }
      default:
    }
  }

  private broadcast(m: Msg) {
    for (const c of this.conns.values()) if (c.open) c.send(m);
  }

  // ---- Joining ------------------------------------------------------------------------------------

  join(code: string, name: string, look: CharacterLook) {
    if (this.role !== 'solo') return;
    this.name = cleanName(name);
    this.look = look;
    this.role = 'guest';
    this.code = code;
    this.ready = true;
    this.ev.onStatus('Looking for your friend…');
    const peer = new Peer();
    this.peer = peer;
    this.joinTimer = window.setTimeout(() => {
      if (this.role === 'guest' && !this.hostConn?.open) this.failJoin('No answer. Your friend may have closed the game, or your network may be blocking the connection.');
    }, JOIN_TIMEOUT_MS);
    peer.on('open', () => {
      const c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      this.hostConn = c;
      c.on('open', () => {
        this.ev.onStatus('Saying hello…');
        c.send({ t: 'hello', v: PROTOCOL, name: this.name, look } satisfies Msg);
      });
      c.on('data', (raw) => this.fromHost(raw as Msg));
      c.on('close', () => this.hostGone());
      c.on('error', () => this.hostGone());
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (e: Error & { type?: string }) => {
      if (this.players.size > 0) return;
      if (e.type === 'peer-unavailable') this.failJoin('That invite is no longer open. Ask your friend for a new link.');
      else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed') this.failJoin('Could not reach the connection service. Check your internet and try again.');
      else this.failJoin('Could not connect. Try the link again.');
    });
  }

  private failJoin(message: string) {
    window.clearTimeout(this.joinTimer);
    this.leave();
    this.ev.onFail(message);
  }

  private hostGone() {
    if (this.role !== 'guest') return;
    const hadWelcome = this.players.size > 0;
    this.leave();
    if (hadWelcome) this.ev.onHostLost();
    else this.ev.onFail('The connection dropped before you got in. Try the link again.');
  }

  private fromHost(m: Msg) {
    if (!m || typeof m !== 'object') return;
    this.sinceHost = 0;
    switch (m.t) {
      case 'reject':
        this.failJoin(m.why === 'full' ? `That cove is full: ${MAX_PLAYERS} people at most.` : 'Your friend is running a different version. Ask them to update, or refresh this page.');
        break;
      case 'welcome': {
        window.clearTimeout(this.joinTimer);
        this.myId = String(m.id);
        this.slot = Math.floor(Math.min(MAX_PLAYERS - 1, Math.max(0, Number(m.slot) || 0)));
        for (const raw of Array.isArray(m.players) ? m.players : []) {
          const p = cleanPlayer(raw);
          if (p && p.id !== this.myId) this.players.set(p.id, { ...p, state: null });
        }
        this.ev.onStatus('');
        this.ev.onWelcome(this.slot, Number(m.hour) || 12, m.running === true, Number(m.time) || 0);
        this.ev.onChange();
        break;
      }
      case 'join': {
        const p = cleanPlayer(m.p);
        if (p && p.id !== this.myId) {
          const np = { ...p, state: null };
          this.players.set(p.id, np);
          this.ev.onJoin(np);
          this.ev.onChange();
        }
        break;
      }
      case 'leave': {
        const p = this.players.get(String(m.id));
        if (p) {
          this.players.delete(p.id);
          this.ev.onLeave(p);
          this.ev.onChange();
        }
        break;
      }
      case 'ss':
        for (const [id, raw] of Object.entries(m.p ?? {})) {
          if (id === this.myId) continue;
          const p = this.players.get(id);
          const st = cleanState(raw);
          if (p && st) p.state = st;
        }
        break;
      case 'c':
        this.ev.onClock(Number(m.h) || 0, m.r === true, Number(m.tm) || 0);
        break;
      case 'look': {
        const p = this.players.get(String(m.id));
        if (p) {
          p.look = cleanLook(m.look);
          this.ev.onLook(p);
        }
        break;
      }
      case 'name': {
        const p = this.players.get(String(m.id));
        if (p) {
          p.name = cleanName(m.name);
          this.ev.onChange();
        }
        break;
      }
      case 'ev': {
        const p = this.players.get(String(m.id));
        if (p) this.ev.onCatch(p, String(m.species).slice(0, 24));
        break;
      }
      default:
    }
  }

  // ---- While playing ------------------------------------------------------------------------------

  /** Call every frame with this player's latest state. */
  tick(dt: number, state: () => NetState) {
    if (!this.live) return;
    this.acc += dt;
    this.clockAcc += dt;
    if (this.role === 'guest') {
      this.sinceHost += dt;
      if (this.sinceHost > HOST_SILENCE_S && this.players.size > 0) {
        this.hostGone();
        return;
      }
    }
    if (this.acc < 1 / SEND_HZ) return;
    this.acc = 0;
    this.myState = state();
    if (this.role === 'guest') {
      if (this.hostConn?.open && this.players.size > 0) this.hostConn.send({ t: 's', st: this.myState } satisfies Msg);
      return;
    }
    if (this.conns.size === 0) return;
    const all: Record<string, NetState> = { [this.myId]: this.myState };
    for (const p of this.players.values()) if (p.state) all[p.id] = p.state;
    this.broadcast({ t: 'ss', p: all });
    if (this.clockAcc > CLOCK_EVERY) this.pushClock();
  }

  pushClock() {
    this.clockAcc = 0;
    if (this.role !== 'host') return;
    const c = this.getClock();
    this.broadcast({ t: 'c', h: c.hour, r: c.running, tm: c.time });
  }

  /** The clock was changed here: tell everyone, through the host. */
  clockChanged(hour: number, running: boolean) {
    if (this.role === 'host') this.pushClock();
    else if (this.role === 'guest' && this.hostConn?.open) this.hostConn.send({ t: 'setClock', h: hour, r: running } satisfies Msg);
  }

  sendLook(look: CharacterLook) {
    this.look = look;
    if (this.role === 'host') this.broadcast({ t: 'look', id: this.myId, look });
    else if (this.role === 'guest' && this.hostConn?.open) this.hostConn.send({ t: 'look', look } satisfies Msg);
  }

  sendName(name: string) {
    this.name = cleanName(name);
    if (this.role === 'host') this.broadcast({ t: 'name', id: this.myId, name: this.name });
    else if (this.role === 'guest' && this.hostConn?.open) this.hostConn.send({ t: 'name', name: this.name } satisfies Msg);
  }

  sendCatch(species: string) {
    if (this.role === 'host') this.broadcast({ t: 'ev', id: this.myId, kind: 'catch', species });
    else if (this.role === 'guest' && this.hostConn?.open) this.hostConn.send({ t: 'ev', kind: 'catch', species } satisfies Msg);
  }

  /** Back to fishing alone. Everyone else's figures are removed by the game. */
  leave() {
    window.clearTimeout(this.joinTimer);
    const old = [...this.players.values()];
    this.players.clear();
    this.conns.clear();
    this.hostConn = null;
    const peer = this.peer;
    this.peer = null;
    this.role = 'solo';
    this.code = '';
    this.ready = false;
    this.slot = 0;
    this.myId = 'host';
    if (peer && !peer.destroyed) peer.destroy();
    for (const p of old) this.ev.onLeave(p);
    this.ev.onChange();
  }
}
