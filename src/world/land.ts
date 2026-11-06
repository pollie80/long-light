// The shape of the place, as plain maths. Rendering, walking and tree planting all read from here.
import { clamp, fbm, lerp, ridged, smoothstep } from '../core/noise';

export const DECK_Y = 1.36;
export const JETTY = { startX: 26, endX: -28, z: 0, halfWidth: 1.25 };
export const COTTAGE = { x: 118, z: -24, y: 19, doorX: 110.7, doorZ: -24 };
export const BOAT_MOOR = { x: -22.5, z: 3.2 };
/** Where each player's boat ties up, along both sides of the jetty. */
export const BOAT_SLOTS = [
  { x: -22.5, z: 3.2 }, { x: -22.5, z: -3.2 }, { x: -14.5, z: 3.2 }, { x: -14.5, z: -3.2 },
  { x: -6.5, z: 3.2 }, { x: -6.5, z: -3.2 }, { x: 1.5, z: 3.4 }, { x: 1.5, z: -3.4 },
];

const BAY = { x: -180, z: 0, r: 194 };

/** Places in the bay where the water wakes at night. x, z, radius, and a hue from teal through blue to violet. */
export const MAGIC_SPOTS = [
  { x: -66, z: -40, r: 20, hue: 0.0 },
  { x: -122, z: -118, r: 24, hue: 0.55 },
  { x: -188, z: 104, r: 30, hue: 0.2 },
  { x: -104, z: 60, r: 15, hue: 0.9 },
  { x: -300, z: -22, r: 34, hue: 0.42 },
  { x: -236, z: -160, r: 26, hue: 0.72 },
];

export const ISLETS = [
  { x: -250, z: -196, r: 30, h: 13 },
  { x: -352, z: -74, r: 54, h: 24 },
  { x: -120, z: -128, r: 7, h: 3.2 },
  { x: -196, z: 118, r: 11, h: 4.6 },
];

const smax = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (a - b)) / k);
  return lerp(b, a, h) + k * h * (1 - h);
};

/** Signed distance-like field: negative on land, positive at sea. */
export function coastSD(x: number, z: number): number {
  const nearJ = smoothstep(26, 120, Math.hypot(x - 14, z));
  const wx = x + nearJ * (fbm(x * 0.006, z * 0.006, 3) * 42 + fbm(x * 0.03, z * 0.03, 2) * 7);
  const wz = z + nearJ * (fbm(x * 0.006 + 9.1, z * 0.006 - 3.7, 3) * 42 + fbm(x * 0.03 - 5.2, z * 0.03 + 1.9, 2) * 7);
  const bay = Math.hypot(wx - BAY.x, wz - BAY.z) - BAY.r;
  const sea = -(wx + 178 + 0.26 * wz);
  return smax(-bay, sea, 40);
}

function rawHeight(x: number, z: number): number {
  const sd = coastSD(x, z);
  let h: number;
  if (sd > 0) {
    h = -(0.078 * sd + 0.00026 * sd * sd);
    h = Math.max(h, -17);
    h += fbm(x * 0.02, z * 0.02, 2) * Math.min(1, sd / 40) * 1.1;
  } else {
    const s = -sd;
    const sandy = 1 - smoothstep(70, 170, Math.abs(z));
    const bw = lerp(4.5, 18, sandy);
    const beach = Math.min(s, bw) * 0.11;
    const inland = Math.max(0, s - bw);
    const rise = 1 - Math.exp(-inland / 72);
    const ridge = ridged(x * 0.0055, z * 0.0055, 3);
    const hill = rise * (9 + 56 * ridge * smoothstep(40, 260, inland)) + inland * 0.05 + fbm(x * 0.012, z * 0.012, 4) * rise * 13;
    const cliff = (1 - sandy) * (1 - Math.exp(-inland / 7)) * (8 + 15 * Math.max(0, fbm(x * 0.021, z * 0.021, 3) + 0.4));
    const roll = fbm(x * 0.05, z * 0.05, 3) * smoothstep(2, 30, inland) * 1.3;
    h = beach + hill + cliff + roll;
  }
  for (const i of ISLETS) {
    const dx = x - i.x;
    const dz = z - i.z;
    const d = Math.hypot(dx, dz);
    if (d > i.r * 2.4) continue;
    const q = d / i.r + fbm(x * 0.05 + i.x, z * 0.05 + i.z, 3) * 0.36;
    const crag = ridged(x * 0.08 + i.z, z * 0.08, 3) * 0.32 + 0.68;
    h = Math.max(h, (1 - q * q) * i.h * crag);
  }
  return h;
}

// ---- The walking path ---------------------------------------------------------------------------

const CONTROL: [number, number][] = [
  [110.5, -24], [101, -15], [93, -29], [79, -41], [65, -35], [60, -15], [64, 5], [52, 19], [39, 13], [33, 3], [26, 0],
];

export interface PathSample { x: number; z: number; y: number; s: number }

export const PATH: PathSample[] = (() => {
  const pts: PathSample[] = [];
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  const c = CONTROL;
  let s = 0;
  let px = c[0][0];
  let pz = c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)];
    const p1 = c[i];
    const p2 = c[i + 1];
    const p3 = c[Math.min(c.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const x = cr(p0[0], p1[0], p2[0], p3[0], t);
      const z = cr(p0[1], p1[1], p2[1], p3[1], t);
      s += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      pts.push({ x, z, y: 0, s });
    }
  }
  pts.push({ x: JETTY.startX, z: 0, y: 0, s: s + Math.hypot(JETTY.startX - px, -pz) });
  // Height along the path: the same ground the plateau sits on, heavily smoothed, pinned at both ends.
  const raw = pts.map((p) => {
    const cd = Math.hypot(p.x - COTTAGE.x, p.z - COTTAGE.z);
    return lerp(rawHeight(p.x, p.z), COTTAGE.y, 1 - smoothstep(14, 32, cd));
  });
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let w = 0;
    for (let j = Math.max(0, i - 24); j <= Math.min(n - 1, i + 24); j++) {
      sum += raw[j];
      w++;
    }
    const t = i / (n - 1);
    let y = sum / w;
    y = lerp(y, COTTAGE.y - 0.02, 1 - smoothstep(0.0, 0.1, t));
    y = lerp(y, DECK_Y - 0.05, smoothstep(0.86, 1, t));
    pts[i].y = y;
  }
  // Nowhere steeper than a comfortable stroll.
  const MAX_GRADE = 0.17;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) {
      const lim = MAX_GRADE * (pts[i].s - pts[i - 1].s);
      pts[i].y = Math.min(pts[i - 1].y + lim, Math.max(pts[i - 1].y - lim, pts[i].y));
    }
    for (let i = n - 2; i >= 0; i--) {
      const lim = MAX_GRADE * (pts[i + 1].s - pts[i].s);
      pts[i].y = Math.min(pts[i + 1].y + lim, Math.max(pts[i + 1].y - lim, pts[i].y));
    }
  }
  return pts;
})();

export const PATH_LENGTH = PATH[PATH.length - 1].s;

const PATH_BOX = { x0: 4, x1: 132, z0: -62, z1: 40 };

export function pathDistance(x: number, z: number): { d: number; i: number } {
  let best = 1e9;
  let bi = 0;
  for (let i = 0; i < PATH.length; i++) {
    const dx = PATH[i].x - x;
    const dz = PATH[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { d: Math.sqrt(best), i: bi };
}

/** Ground height everywhere, with the path and cottage garden levelled into the hillside. */
export function groundY(x: number, z: number): number {
  let h = rawHeight(x, z);
  const cd = Math.hypot(x - COTTAGE.x, z - COTTAGE.z);
  if (cd < 34) h = lerp(h, COTTAGE.y, 1 - smoothstep(14, 32, cd));
  if (x > PATH_BOX.x0 && x < PATH_BOX.x1 && z > PATH_BOX.z0 && z < PATH_BOX.z1) {
    const p = pathDistance(x, z);
    if (p.d < 16) h = lerp(h, PATH[p.i].y, 1 - smoothstep(1.4, 15.5, p.d));
  }
  return h;
}

export function onJetty(x: number, z: number): boolean {
  return x <= JETTY.startX && x >= JETTY.endX && Math.abs(z) <= JETTY.halfWidth;
}

/** Gentle swell, the same four waves the water vertex shader uses, so boats bob on the real surface. */
const SWELL: [number, number, number, number, number][] = [
  [0.82, 0.57, 0.052, 13.0, 0.0],
  [0.34, -0.94, 0.030, 8.1, 1.7],
  [-0.71, 0.70, 0.018, 4.7, 4.1],
  [0.96, 0.28, 0.011, 2.9, 2.3],
];
export const SWELL_GLSL = SWELL;

export function swellAt(x: number, z: number, t: number): number {
  let h = 0;
  for (const [dx, dz, a, wl, ph] of SWELL) {
    const k = (Math.PI * 2) / wl;
    const w = Math.sqrt(9.81 * k);
    h += a * Math.sin((dx * x + dz * z) * k + w * t + ph);
  }
  return h;
}

export function isNaturalGround(x: number, z: number): boolean {
  return groundY(x, z) > 0.2;
}

/** How steep the ground is here: 0 flat, 1 is 45 degrees. */
export function slopeAt(x: number, z: number, e = 0.8): number {
  const a = groundY(x + e, z) - groundY(x - e, z);
  const b = groundY(x, z + e) - groundY(x, z - e);
  return Math.hypot(a, b) / (2 * e);
}

/** Point `s` metres along the path. */
export function pathPoint(s: number): PathSample {
  const t = clamp(s, 0, PATH_LENGTH);
  let lo = 0;
  let hi = PATH.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (PATH[m].s < t) lo = m;
    else hi = m;
  }
  const a = PATH[lo];
  const b = PATH[hi];
  const f = (t - a.s) / Math.max(1e-5, b.s - a.s);
  return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: lerp(a.y, b.y, f), s: t };
}
