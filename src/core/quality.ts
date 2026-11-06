// How much the game asks of the computer. These are read while the world is being built, so changing the
// preset reloads the game. Ultra is everything as first designed; the others keep the look and spend less.

export type QualityId = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  id: QualityId;
  label: string;
  renderScale: number;
  msaa: number;
  shadowNear: number;
  shadowFar: number;
  /** Refresh each shadow map every this many frames. */
  shadowNearEvery: number;
  shadowFarEvery: number;
  /** Reflection size as a fraction of the screen, and how many frames it's kept for. */
  reflectScale: number;
  reflectEvery: number;
  bloomLevels: number;
  skyW: number;
  skyCycle: number;
  ripple: number;
  terrainSegs: number;
  grass: number;
  trees: number;
  nearTrees: number;
}

export const QUALITIES: Record<QualityId, Quality> = {
  low: { id: 'low', label: 'Low', renderScale: 0.67, msaa: 0, shadowNear: 1024, shadowFar: 1024, shadowNearEvery: 4, shadowFarEvery: 30, reflectScale: 0.25, reflectEvery: 3, bloomLevels: 4, skyW: 1536, skyCycle: 8, ripple: 256, terrainSegs: 280, grass: 0.14, trees: 0.45, nearTrees: 16 },
  medium: { id: 'medium', label: 'Medium', renderScale: 0.8, msaa: 0, shadowNear: 2048, shadowFar: 1024, shadowNearEvery: 3, shadowFarEvery: 20, reflectScale: 0.33, reflectEvery: 2, bloomLevels: 5, skyW: 2048, skyCycle: 6, ripple: 256, terrainSegs: 400, grass: 0.35, trees: 0.7, nearTrees: 40 },
  high: { id: 'high', label: 'High', renderScale: 1, msaa: 2, shadowNear: 2048, shadowFar: 2048, shadowNearEvery: 2, shadowFarEvery: 12, reflectScale: 0.5, reflectEvery: 1, bloomLevels: 6, skyW: 3072, skyCycle: 4, ripple: 512, terrainSegs: 520, grass: 0.65, trees: 1, nearTrees: 80 },
  ultra: { id: 'ultra', label: 'Ultra', renderScale: 1, msaa: 2, shadowNear: 4096, shadowFar: 4096, shadowNearEvery: 2, shadowFarEvery: 7, reflectScale: 0.5, reflectEvery: 1, bloomLevels: 7, skyW: 4096, skyCycle: 4, ripple: 512, terrainSegs: 720, grass: 1, trees: 1, nearTrees: 110 },
};

export const QUALITY_ORDER: QualityId[] = ['low', 'medium', 'high', 'ultra'];
const KEY = 'longlight.quality';

/** A first guess from the name of the graphics chip, for people who never open the settings. */
function guess(): QualityId {
  if (typeof document === 'undefined') return 'high';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (/intel|uhd|iris|swiftshader|llvmpipe|mali|adreno|vega [368]\b|radeon\(tm\) graphics|radeon graphics|\bmx ?\d{3}/.test(name)) return 'low';
    if (/gtx (7|9|10[0-5])|gt \d{3}|rx (4|5[0-7])\d{2}|\brx 5[0-9]0\b/.test(name)) return 'medium';
  } catch {
    /* A guess is only a guess. */
  }
  return 'high';
}

function choose(): QualityId {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (saved && QUALITY_ORDER.includes(saved as QualityId)) return saved as QualityId;
  } catch {
    /* A private window has no storage. */
  }
  return guess();
}

export const Q: Quality = QUALITIES[choose()];

export function setQuality(id: QualityId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* It will simply not stick. */
  }
  location.reload();
}
