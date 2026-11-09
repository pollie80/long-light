// Seeded randomness and CPU-side noise. The GPU has its own baked equivalents.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
{
  const r = mulberry32(90210);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Gradient noise in roughly [-1, 1]. */
export function perlin(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const g = (h: number, dx: number, dy: number) => {
    const i = (h & 7) * 2;
    return GRAD[i] * dx + GRAD[i + 1] * dy;
  };
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  const a = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
  const b = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
  return (a + v * (b - a)) * 1.5;
}

export function fbm(x: number, y: number, octaves = 4, lac = 2.03, gain = 0.5): number {
  let a = 1;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * perlin(x * f + i * 17.3, y * f - i * 9.1);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

export function ridged(x: number, y: number, octaves = 4): number {
  let a = 1;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * (1 - Math.abs(perlin(x * f + i * 31.7, y * f + i * 5.3)));
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}

/** An angle brought back into -pi..pi. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Framerate-independent exponential approach. */
export const damp = (a: number, b: number, rate: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-rate * dt));
