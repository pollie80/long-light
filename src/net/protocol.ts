// What friends' games say to each other. Everything arriving from the network is treated as untrusted
// and cleaned here before the game touches it.
import type { PoseMode } from '../actors/fisher';
import { CharacterLook, cleanLook } from '../actors/look';
import type { FishState } from '../game/fishing';

/** Bumped whenever the messages change, so an old copy gets a clear message instead of odd behaviour. */
export const PROTOCOL = 1;
export const MAX_PLAYERS = 8;
export const PEER_PREFIX = 'long-light-cove-';
export const HOSTED_URL = 'https://pollie80.github.io/long-light/';

export interface NetState {
  x: number; y: number; z: number; yaw: number;
  mode: PoseMode;
  sp: number;
  /** In the boat, with this seat turn. */
  ib: boolean; fy: number;
  /** The player's own boat. */
  bx: number; bz: number; bh: number; bp: number; bo: boolean; br: boolean; bs: number;
  /** Fishing. */
  fs: FishState;
  lx: number; ly: number; lz: number;
  rx: number; ry: number; rz: number;
  bend: number; spin: number;
  fish: string;
  /** Beer. */
  bOut: number; bLift: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  look: CharacterLook;
  slot: number;
}

export type Msg =
  | { t: 'hello'; v: number; name: string; look: CharacterLook }
  | { t: 'reject'; why: 'full' | 'version' }
  | { t: 'welcome'; id: string; slot: number; hour: number; running: boolean; time: number; players: PlayerInfo[] }
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 's'; st: NetState }
  | { t: 'ss'; p: Record<string, NetState> }
  | { t: 'c'; h: number; r: boolean; tm: number }
  | { t: 'setClock'; h: number; r: boolean }
  | { t: 'look'; id?: string; look: CharacterLook }
  | { t: 'name'; id?: string; name: string }
  | { t: 'ev'; id?: string; kind: 'catch'; species: string };

const POSES: PoseMode[] = ['stand', 'row', 'boatSit', 'dockSit', 'benchSit'];
const FISH: FishState[] = ['idle', 'charge', 'flight', 'wait', 'bite', 'reel', 'landed', 'released'];

const num = (v: unknown, lim = 1e5, d = 0): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.min(lim, Math.max(-lim, n));
};

export function cleanName(v: unknown): string {
  // Control characters out, length capped. It is only ever shown as plain text.
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) : '';
  return s || 'A friend';
}

export function cleanState(v: unknown): NetState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    x: num(o.x, 5000), y: num(o.y, 500), z: num(o.z, 5000), yaw: num(o.yaw, 100),
    mode: POSES.includes(o.mode as PoseMode) ? (o.mode as PoseMode) : 'stand',
    sp: num(o.sp, 20),
    ib: o.ib === true, fy: num(o.fy, 100),
    bx: num(o.bx, 5000), bz: num(o.bz, 5000), bh: num(o.bh, 100), bp: num(o.bp, 1e6), bo: o.bo === true, br: o.br === true, bs: num(o.bs, 30),
    fs: FISH.includes(o.fs as FishState) ? (o.fs as FishState) : 'idle',
    lx: num(o.lx, 5000), ly: num(o.ly, 500), lz: num(o.lz, 5000),
    rx: num(o.rx, 1), ry: num(o.ry, 1, 1), rz: num(o.rz, 1),
    bend: num(o.bend, 2), spin: num(o.spin, 1e6),
    fish: typeof o.fish === 'string' ? o.fish.slice(0, 24) : '',
    bOut: Math.min(1, Math.max(0, num(o.bOut, 1))), bLift: Math.min(1, Math.max(0, num(o.bLift, 1))),
  };
}

export function cleanPlayer(v: unknown): PlayerInfo | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length > 64) return null;
  return {
    id: o.id,
    name: cleanName(o.name),
    look: cleanLook(o.look as Partial<CharacterLook>),
    slot: Math.floor(Math.min(MAX_PLAYERS - 1, Math.max(0, num(o.slot, MAX_PLAYERS)))),
  };
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode(rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return s;
}

export function codeFromHash(hash: string): string | null {
  const m = /^#join=([a-z0-9]{6})$/.exec(hash.trim().toLowerCase());
  return m ? m[1] : null;
}

/** The link a friend opens. Always the public copy, because a file on one person's computer can't be shared. */
export function inviteLink(code: string): string {
  return `${HOSTED_URL}#join=${code}`;
}
