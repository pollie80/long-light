// The backup route. Some networks can't connect two browsers directly, and the usual fix, a TURN relay,
// has no free no-account option left. So when a direct connection doesn't come up, players talk through
// a public MQTT message service instead. Everything is sealed with a key derived from the invite code,
// so the service only ever sees a hashed room name and ciphertext.
import type { Msg } from './protocol';

/** Public services, tried in order. The host listens on all of them, so a friend can use whichever they reach. */
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker-cn.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

/** These services throttle a client at around 11 messages a second, so state goes at 5 a second. */
const STATE_EVERY_MS = 200;
const STATE_IDLE_EVERY_MS = 1000;
const FULL_STATE_EVERY_MS = 2000;
const RESEND_MS = 900;
const MAX_TRIES = 40;
const GONE_MS = 15000;
const NEXT_BROKER_MS = 5000;

export type LinkEvent = 'open' | 'data' | 'close' | 'error';

/** What Net needs from a connection, whichever route it takes. */
export interface Link {
  readonly open: boolean;
  readonly relay?: boolean;
  send(m: Msg): void;
  close(): void;
  on(ev: LinkEvent, fn: (x?: unknown) => void): unknown;
}

interface Env {
  /** Sender. */
  f?: string;
  /** Sequence number of a reliable message, and the message. */
  r?: number;
  m?: Msg;
  /** Everything up to this number has arrived. */
  a?: number;
  /** A message that can be lost, because a newer one is coming. */
  u?: Msg;
  /** Leaving. */
  b?: 1;
}

// ---- A very small MQTT 3.1.1 client: connect, subscribe, publish at most once. -----------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function mqttString(s: string): Uint8Array<ArrayBuffer> {
  const b = enc.encode(s);
  return concat([new Uint8Array([b.length >> 8, b.length & 255]), b]);
}

function packet(type: number, ...body: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const inner = concat(body);
  const len: number[] = [];
  let n = inner.length;
  do {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 128;
    len.push(d);
  } while (n > 0);
  return concat([new Uint8Array([type, ...len]), inner]);
}

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
}

class Mqtt {
  up = false;
  private ws: WebSocket | null = null;
  private buf: Uint8Array = new Uint8Array(0);
  private topics = new Set<string>();
  private stopped = false;
  private pingTimer = 0;
  private packetId = 1;

  constructor(private url: string, private onUp: () => void, private onMessage: (body: Uint8Array) => void) {
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url, 'mqtt');
    } catch {
      window.setTimeout(() => this.connect(), 4000);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.buf = new Uint8Array(0);
    ws.onopen = () => ws.send(packet(0x10, mqttString('MQTT'), new Uint8Array([4, 2, 0, 60]), mqttString(`ll${randomId()}`)));
    ws.onmessage = (e) => this.read(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = () => {
      this.up = false;
      window.clearInterval(this.pingTimer);
      if (!this.stopped) window.setTimeout(() => this.connect(), 4000);
    };
  }

  private read(bytes: Uint8Array) {
    this.buf = this.buf.length ? concat([this.buf, bytes]) : bytes;
    while (this.buf.length >= 2) {
      let i = 1;
      let mult = 1;
      let rem = 0;
      let d = 0;
      do {
        if (i >= this.buf.length) return;
        d = this.buf[i++];
        rem += (d & 127) * mult;
        mult *= 128;
      } while (d & 128);
      if (this.buf.length < i + rem) return;
      const kind = this.buf[0] & 0xf0;
      if (kind === 0x20 && this.buf[i + 1] === 0) {
        this.up = true;
        for (const t of this.topics) this.sendSubscribe(t);
        this.pingTimer = window.setInterval(() => this.raw(new Uint8Array([0xc0, 0])), 30000);
        this.onUp();
      } else if (kind === 0x30) {
        const topicLen = (this.buf[i] << 8) | this.buf[i + 1];
        this.onMessage(this.buf.slice(i + 2 + topicLen, i + rem));
      }
      this.buf = this.buf.subarray(i + rem);
    }
  }

  private raw(b: Uint8Array<ArrayBuffer>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(b);
  }

  private sendSubscribe(topic: string) {
    this.packetId = (this.packetId % 60000) + 1;
    this.raw(packet(0x82, new Uint8Array([this.packetId >> 8, this.packetId & 255]), mqttString(topic), new Uint8Array([0])));
  }

  subscribe(topic: string) {
    this.topics.add(topic);
    if (this.up) this.sendSubscribe(topic);
  }

  publish(topic: string, body: Uint8Array) {
    if (this.up) this.raw(packet(0x30, mqttString(topic), body));
  }

  stop() {
    this.stopped = true;
    window.clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws?.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xe0, 0]));
    ws?.close();
  }
}

// ---- Sealing. ------------------------------------------------------------------------------------------

const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));

class Room {
  private constructor(readonly base: string, private key: CryptoKey) {}

  static async make(code: string): Promise<Room> {
    const name = await sha256(`long-light-room:${code}`);
    const hex = Array.from(name.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    const key = await crypto.subtle.importKey('raw', await sha256(`long-light-key:${code}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return new Room(`longlight/${hex}`, key);
  }

  async seal(env: Env): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(env)));
    return concat([iv, new Uint8Array(body)]);
  }

  /** Null for anything that wasn't sealed with this room's key. */
  async open(bytes: Uint8Array): Promise<Env | null> {
    try {
      const body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, this.key, bytes.slice(12));
      const env = JSON.parse(dec.decode(body));
      return env && typeof env === 'object' ? (env as Env) : null;
    } catch {
      return null;
    }
  }
}

// ---- One player's connection over the relay: reliable, ordered messages on top of lossy ones. ------------

export class RelayLink implements Link {
  readonly relay = true;
  open = false;
  private handlers: Partial<Record<LinkEvent, ((x?: unknown) => void)[]>> = {};
  private nextOut = 1;
  private unacked = new Map<number, { m: Msg; at: number; tries: number }>();
  private nextIn = 1;
  private held = new Map<number, Msg>();
  private lastSeen = performance.now();
  private lastStateAt = 0;
  private lastState = '';
  private timer: number;
  private closed = false;

  constructor(private out: (env: Env) => void, private onGone: () => void) {
    this.timer = window.setInterval(() => this.tick(), 300);
  }

  on(ev: LinkEvent, fn: (x?: unknown) => void) {
    (this.handlers[ev] ??= []).push(fn);
    return this;
  }

  private emit(ev: LinkEvent, x?: unknown) {
    for (const fn of this.handlers[ev] ?? []) fn(x);
  }

  markOpen() {
    if (this.open) return;
    this.open = true;
    this.emit('open');
  }

  send(m: Msg) {
    if (this.closed) return;
    if (m.t === 's') {
      // Standing still is said once a second; moving, five times.
      const json = JSON.stringify(m.st);
      const now = performance.now();
      const wait = json === this.lastState ? STATE_IDLE_EVERY_MS : STATE_EVERY_MS;
      if (now - this.lastStateAt < wait) return;
      this.lastStateAt = now;
      this.lastState = json;
      this.out({ u: m });
      return;
    }
    const r = this.nextOut++;
    this.unacked.set(r, { m, at: performance.now(), tries: 1 });
    this.out({ r, m });
  }

  receive(env: Env) {
    if (this.closed) return;
    this.lastSeen = performance.now();
    if (env.b) {
      this.shut();
      return;
    }
    if (typeof env.a === 'number') {
      for (const r of this.unacked.keys()) if (r <= env.a) this.unacked.delete(r);
    }
    if (env.u) this.emit('data', env.u);
    if (typeof env.r === 'number' && env.m) {
      if (env.r >= this.nextIn) this.held.set(env.r, env.m);
      while (this.held.has(this.nextIn)) {
        const m = this.held.get(this.nextIn)!;
        this.held.delete(this.nextIn);
        this.nextIn += 1;
        this.emit('data', m);
        if (this.closed) return;
      }
      this.out({ a: this.nextIn - 1 });
    }
  }

  private tick() {
    const now = performance.now();
    if (now - this.lastSeen > GONE_MS) {
      this.shut();
      return;
    }
    for (const [r, u] of this.unacked) {
      if (now - u.at < RESEND_MS) continue;
      if (u.tries >= MAX_TRIES) {
        this.shut();
        return;
      }
      u.at = now;
      u.tries += 1;
      this.out({ r, m: u.m });
    }
  }

  private shut() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    window.clearInterval(this.timer);
    this.onGone();
    this.emit('close');
  }

  close() {
    if (this.closed) return;
    this.out({ b: 1 });
    // Long enough for the goodbye to be sealed and sent before the socket goes.
    window.setTimeout(() => this.shut(), 150);
  }
}

// ---- Both ends. ---------------------------------------------------------------------------------------

export class RelayGuest {
  readonly link: RelayLink;
  private id = randomId();
  private room: Room | null = null;
  private client: Mqtt | null = null;
  private broker = 0;
  private cycle = 0;
  private heard = false;
  private tx: Promise<unknown> = Promise.resolve();
  private rx: Promise<unknown> = Promise.resolve();

  constructor(code: string) {
    this.link = new RelayLink((env) => this.post(env), () => this.stop());
    void Room.make(code).then((room) => {
      this.room = room;
      this.useBroker(0);
      // Stay until the host answers; if they don't, they may be on another service.
      this.cycle = window.setInterval(() => {
        if (!this.heard) this.useBroker((this.broker + 1) % BROKERS.length);
      }, NEXT_BROKER_MS);
    });
  }

  private useBroker(i: number) {
    if (!this.room) return;
    this.client?.stop();
    this.broker = i;
    const c = new Mqtt(BROKERS[i], () => this.link.markOpen(), (b) => this.got(b));
    c.subscribe(`${this.room.base}/g/${this.id}`);
    c.subscribe(`${this.room.base}/all`);
    this.client = c;
  }

  private post(env: Env) {
    const room = this.room;
    if (!room) return;
    this.tx = this.tx.then(async () => {
      const body = await room.seal({ ...env, f: this.id });
      this.client?.publish(`${room.base}/h`, body);
    });
  }

  private got(bytes: Uint8Array) {
    const room = this.room;
    if (!room) return;
    this.rx = this.rx.then(async () => {
      const env = await room.open(bytes);
      if (!env) return;
      this.heard = true;
      this.link.receive(env);
    });
  }

  stop() {
    window.clearInterval(this.cycle);
    // Lets a goodbye already on its way get out first.
    const c = this.client;
    this.client = null;
    void this.tx.then(() => c?.stop());
  }
}

export class RelayHub {
  private room: Room | null = null;
  private clients: Mqtt[] = [];
  private guests = new Map<string, { link: RelayLink; client: Mqtt }>();
  private tx: Promise<unknown> = Promise.resolve();
  private rx: Promise<unknown> = Promise.resolve();
  private lastAll = 0;
  private lastFull = 0;
  private sent = new Map<string, string>();
  private stopped = false;

  constructor(code: string, private onGuest: (link: RelayLink) => void, private onUp: () => void) {
    void Room.make(code).then((room) => {
      if (this.stopped) return;
      this.room = room;
      for (const url of BROKERS) {
        const client: Mqtt = new Mqtt(url, () => this.onUp(), (b) => this.got(client, b));
        client.subscribe(`${room.base}/h`);
        this.clients.push(client);
      }
    });
  }

  private got(client: Mqtt, bytes: Uint8Array) {
    const room = this.room;
    if (!room) return;
    this.rx = this.rx.then(async () => {
      const env = await room.open(bytes);
      if (!env || typeof env.f !== 'string' || env.f.length > 40) return;
      const id = env.f;
      let g = this.guests.get(id);
      if (!g) {
        if (env.m?.t !== 'hello' || this.stopped) return;
        const link = new RelayLink((e) => this.post(client, id, e), () => this.guests.delete(id));
        g = { link, client };
        this.guests.set(id, g);
        this.lastFull = 0;
        link.markOpen();
        this.onGuest(link);
      }
      g.link.receive(env);
    });
  }

  private post(client: Mqtt, id: string, env: Env) {
    const room = this.room;
    if (!room) return;
    this.tx = this.tx.then(async () => client.publish(`${room.base}/g/${id}`, await room.seal(env)));
  }

  /** Everyone's positions and the clock: one message for all friends on the relay, sent only as often as it can get through. */
  sendAll(m: Msg) {
    const room = this.room;
    if (!room || this.guests.size === 0) return;
    let msg = m;
    if (m.t === 'ss') {
      const now = performance.now();
      if (now - this.lastAll < STATE_EVERY_MS) return;
      const full = now - this.lastFull > FULL_STATE_EVERY_MS;
      const changed: typeof m.p = {};
      let any = false;
      for (const [id, st] of Object.entries(m.p)) {
        const json = JSON.stringify(st);
        if (!full && this.sent.get(id) === json) continue;
        this.sent.set(id, json);
        changed[id] = st;
        any = true;
      }
      if (!any) return;
      this.lastAll = now;
      if (full) this.lastFull = now;
      msg = { t: 'ss', p: changed };
    }
    const used = new Set([...this.guests.values()].map((g) => g.client));
    this.tx = this.tx.then(async () => {
      const body = await room.seal({ u: msg });
      for (const c of used) c.publish(`${room.base}/all`, body);
    });
  }

  close() {
    this.stopped = true;
    for (const g of [...this.guests.values()]) g.link.close();
    const clients = this.clients;
    this.clients = [];
    window.setTimeout(() => {
      void this.tx.then(() => clients.forEach((c) => c.stop()));
    }, 300);
  }
}
