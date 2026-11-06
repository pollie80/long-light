// The clock and the art direction of the day. Pure data and maths, no three.js.
import { MAP } from '../world/maps';

export type V3 = [number, number, number];

export const SUNRISE = 6.25;
export const SUNSET = 18.75;
export const DAY_SECONDS = 1800;

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Sun rises east (+X), arcs over the south, sets west-south-west over the open bay. */
export function sunDir(hour: number): V3 {
  const a = ((hour - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
  const tilt = 0.56;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return norm([c, s * Math.cos(tilt), s * Math.sin(tilt) + 0.16 * Math.abs(c)]);
}

/** A storybook moon: it stays over the bay all night, so the glade on the water is always visible. */
export function moonDir(hour: number): V3 {
  const h = hour < 12 ? hour + 24 : hour;
  const t = (h - 19.5) / 10; // 19:30 to 05:30
  const az = Math.PI + 0.75 - t * 1.5; // sweeps from south-west to north-west
  const el = 0.1 + Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * 0.62;
  return norm([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]);
}

// Real seconds spent per in-game hour, before normalising. Slow around dawn and sunset, because
// that is what the game is for.
const PACE: [number, number][] = [
  [0, 40], [4, 45], [5, 130], [7, 80], [8, 50], [16, 90], [17.5, 170], [18.2, 340], [19.8, 300],
  [20.5, 90], [21, 40], [24, 40],
];

function secondsPerHourRaw(h: number): number {
  for (let i = 0; i < PACE.length - 1; i++) {
    const [a, va] = PACE[i];
    const [b, vb] = PACE[i + 1];
    if (h >= a && h <= b) return va + (vb - va) * ((h - a) / (b - a));
  }
  return 40;
}

const PACE_TOTAL = (() => {
  let s = 0;
  const n = 2400;
  for (let i = 0; i < n; i++) s += secondsPerHourRaw((i + 0.5) * (24 / n)) * (24 / n);
  return s;
})();

/** In-game hours that pass per real second at this hour. */
export function hoursPerSecond(h: number): number {
  return PACE_TOTAL / DAY_SECONDS / secondsPerHourRaw(((h % 24) + 24) % 24);
}

export function advanceHour(h: number, dt: number): number {
  return (h + hoursPerSecond(h) * dt) % 24;
}

export type Phase = 'night' | 'dawn' | 'morning' | 'day' | 'golden' | 'sunset' | 'dusk';

export function phaseOf(h: number): Phase {
  if (h < 4.8 || h >= 20.4) return 'night';
  if (h < 7) return 'dawn';
  if (h < 9.5) return 'morning';
  if (h < 16.3) return 'day';
  if (h < 18.1) return 'golden';
  if (h < 19.2) return 'sunset';
  return 'dusk';
}

export function clockLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---- Palette ---------------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tint = (c: V3, k: [number, number, number]): V3 => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];

export interface Look {
  keyCol: V3; // sun or moon colour (linear)
  keyI: number; // key light strength
  amb: number; // sky ambient multiplier
  shadow: V3; // what shadows lean towards, the storybook violet
  bounce: V3; // light coming back off the ground
  fog: number; // fog density per metre
  mist: number; // low mist over water, 0..1
  waterScatter: V3; // colour inside the water
  bloom: number;
  rays: number;
  exposure: number;
  sat: number;
  warmth: number; // split-tone strength, warm highlights and cool shadows
  cloudTop: V3; // ambient on cloud tops
  cloudBot: V3; // ambient on cloud bellies
  night: number; // 1 means stars out, windows lit
}

const lin = (hex: number): V3 => {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};

type Key = { h: number } & Look;
const k = (
  h: number, keyCol: number, keyI: number, amb: number, shadow: number, bounce: number, fog: number,
  mist: number, water: number, bloom: number, rays: number, exposure: number, sat: number, warmth: number,
  cloudTop: number, cloudBot: number, night: number,
): Key => ({
  h, keyCol: lin(keyCol), keyI, amb, shadow: lin(shadow), bounce: lin(bounce), fog, mist,
  waterScatter: lin(water), bloom, rays, exposure, sat, warmth, cloudTop: lin(cloudTop), cloudBot: lin(cloudBot), night,
});

//             h     key       keyI  amb   shadow    bounce    fog      mist  water     bloom rays expo  sat   warm  cloudTop  cloudBot  night
const KEYS: Key[] = [
  k(0.0,  0x9db8ec, 0.55, 0.60, 0x1a2350, 0x10182e, 0.00010, 0.10, 0x061524, 0.55, 0.15, 1.15, 1.05, 0.10, 0x2a3a66, 0x141c38, 1.0),
  k(4.4,  0x9db8ec, 0.45, 0.60, 0x1a2350, 0x10182e, 0.00012, 0.30, 0x061524, 0.50, 0.10, 1.15, 1.05, 0.10, 0x2a3a66, 0x141c38, 1.0),
  k(5.2,  0xa9a4d8, 0.12, 0.85, 0x352a60, 0x1e2036, 0.00022, 0.70, 0x10253a, 0.50, 0.10, 1.10, 1.10, 0.20, 0x57588e, 0x2e2c52, 0.7),
  k(5.8,  0xffa9a0, 0.25, 1.00, 0x4a3468, 0x3a2c40, 0.00030, 1.00, 0x1a3346, 0.60, 0.20, 1.05, 1.18, 0.35, 0x8c7ea8, 0x6a4a6c, 0.15),
  k(6.4,  0xffa574, 1.60, 1.00, 0x54407c, 0x5a4240, 0.00028, 1.00, 0x24485a, 0.75, 0.70, 1.00, 1.22, 0.50, 0xb0a4c0, 0xc08070, 0.0),
  k(7.2,  0xffcf9e, 3.00, 1.00, 0x4a4c84, 0x6a5a48, 0.00016, 0.45, 0x2a5e6e, 0.55, 0.40, 1.00, 1.15, 0.30, 0xd8dae8, 0xb0a0a0, 0.0),
  k(9.0,  0xfff0d6, 3.80, 1.00, 0x3e5088, 0x6e6a4e, 0.00009, 0.08, 0x2a7078, 0.40, 0.15, 1.00, 1.10, 0.15, 0xf0f4fa, 0x9ca8bc, 0.0),
  k(12.0, 0xfff8ea, 4.20, 1.05, 0x3a5490, 0x76744e, 0.00007, 0.00, 0x2a7c82, 0.35, 0.05, 0.98, 1.08, 0.10, 0xffffff, 0xa4b0c4, 0.0),
  k(15.5, 0xfff0cf, 4.00, 1.00, 0x3e4e8c, 0x7a7048, 0.00008, 0.00, 0x2a7078, 0.40, 0.15, 1.00, 1.12, 0.22, 0xf8f4ec, 0xa8a4b4, 0.0),
  k(17.0, 0xffd29a, 3.70, 0.85, 0x4a4488, 0x806440, 0.00006, 0.00, 0x2c6470, 0.50, 0.30, 0.86, 1.20, 0.45, 0xf0dcc8, 0xb09098, 0.0),
  k(17.9, 0xffb372, 3.80, 0.85, 0x503a84, 0x7a4e38, 0.00008, 0.02, 0x2e5468, 0.70, 0.60, 0.86, 1.24, 0.70, 0xe0b8a8, 0xb06c70, 0.0),
  k(18.4, 0xff9a58, 3.60, 0.85, 0x54307c, 0x6e3c34, 0.00011, 0.06, 0x304660, 0.90, 0.80, 0.92, 1.24, 0.90, 0xc08ca0, 0xc05848, 0.0),
  k(18.72,0xff7a44, 2.60, 0.88, 0x552a74, 0x5a2e34, 0.00014, 0.10, 0x2e3a58, 1.00, 0.85, 0.98, 1.28, 1.00, 0x9c6c98, 0xd04a3c, 0.0),
  k(19.0, 0xff5a40, 0.60, 1.00, 0x4c2870, 0x3c2438, 0.00016, 0.14, 0x28304e, 0.95, 0.50, 1.18, 1.32, 0.90, 0x6e5490, 0xa63c50, 0.05),
  k(19.4, 0xb060a0, 0.10, 1.15, 0x38265e, 0x241c34, 0.00018, 0.22, 0x1c2542, 0.75, 0.15, 1.34, 1.32, 0.60, 0x443e74, 0x52305c, 0.35),
  k(19.9, 0x8a80d0, 0.14, 1.05, 0x242456, 0x16182e, 0.00014, 0.20, 0x101c34, 0.65, 0.05, 1.28, 1.18, 0.30, 0x2e3460, 0x241f44, 0.75),
  k(20.6, 0x9db8ec, 0.45, 0.70, 0x1a2350, 0x10182e, 0.00011, 0.14, 0x061524, 0.55, 0.10, 1.18, 1.08, 0.12, 0x2a3a66, 0x141c38, 1.0),
  k(24.0, 0x9db8ec, 0.55, 0.60, 0x1a2350, 0x10182e, 0.00010, 0.10, 0x061524, 0.55, 0.15, 1.15, 1.05, 0.10, 0x2a3a66, 0x141c38, 1.0),
];

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function lookAt(hour: number): Look {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t0 = (h - a.h) / (b.h - a.h);
  const t = t0 * t0 * (3 - 2 * t0);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    keyCol: mix3(a.keyCol, b.keyCol, t),
    keyI: n(a.keyI, b.keyI),
    amb: n(a.amb, b.amb),
    shadow: mix3(a.shadow, b.shadow, t),
    bounce: mix3(a.bounce, b.bounce, t),
    fog: n(a.fog, b.fog) * MAP.mood.fog,
    mist: n(a.mist, b.mist) * MAP.mood.mist,
    waterScatter: tint(mix3(a.waterScatter, b.waterScatter, t), MAP.water.scatter),
    bloom: n(a.bloom, b.bloom),
    rays: n(a.rays, b.rays),
    exposure: n(a.exposure, b.exposure),
    sat: n(a.sat, b.sat) * MAP.mood.sat,
    warmth: n(a.warmth, b.warmth) * MAP.mood.warmth,
    cloudTop: mix3(a.cloudTop, b.cloudTop, t),
    cloudBot: mix3(a.cloudBot, b.cloudBot, t),
    night: n(a.night, b.night),
  };
}

// Sky brightness and cloud mood through the day.  hour, sky intensity, cumulus, cirrus, altocumulus
const SKY_KEYS: [number, number, number, number, number][] = [
  [0.0, 1.0, 0.34, 0.30, 0.12],
  [4.4, 1.0, 0.34, 0.34, 0.20],
  [5.2, 1.4, 0.38, 0.55, 0.45],
  [5.8, 1.6, 0.42, 0.70, 0.62],
  [6.5, 1.4, 0.44, 0.62, 0.50],
  [7.4, 2.2, 0.44, 0.34, 0.15],
  [9.0, 3.0, 0.42, 0.2, 0.04],
  [12.5, 3.1, 0.44, 0.16, 0.02],
  [15.5, 2.9, 0.46, 0.16, 0.03],
  [17.0, 2.1, 0.5, 0.2, 0.06],
  [17.6, 1.5, 0.52, 0.34, 0.2],
  [18.0, 1.1, 0.55, 0.52, 0.48],
  [18.4, 0.9, 0.58, 0.68, 0.72],
  [18.75, 1.05, 0.58, 0.72, 0.78],
  [19.15, 1.5, 0.56, 0.72, 0.78],
  [19.6, 1.5, 0.48, 0.6, 0.55],
  [20.5, 1.0, 0.38, 0.32, 0.18],
  [21.2, 1.0, 0.34, 0.30, 0.12],
  [24.0, 1.0, 0.34, 0.30, 0.12],
];

export interface SkyMood { intensity: number; cover: number; cirrus: number; alto: number }

export function skyMoodAt(hour: number): SkyMood {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = (h - a[0]) / (b[0] - a[0]);
  const m = (j: number) => a[j] + (b[j] - a[j]) * t;
  const mood = MAP.mood;
  return { intensity: m(1), cover: clamp01(m(2) + mood.cover), cirrus: clamp01(m(3) + mood.cirrus), alto: clamp01(m(4) + mood.alto) };
}

/** The sun lights the world until just after sunset; then the moon takes over while key light is near zero. */
export function keyIsMoon(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h > 19.65 || h < 5.45;
}

/** How awake the bay's magic is: 0 by day, 1 through the night. */
export function nightMagic(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return h > 12 ? ss(19.6, 20.5, h) : 1 - ss(4.5, 5.3, h);
}
