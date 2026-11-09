// Changing weather, when it's switched on. It follows the wall clock, so friends playing together share the same
// sky without a word passing between them: every twelve minutes a new kind of day, eased in over three.
export interface WeatherNow {
  /** Added to the sky's own cloud amounts. */
  cover: number;
  cirrus: number;
  alto: number;
  /** Multiplies the sun or moon. */
  light: number;
  /** Multiplies fog and mist. */
  mist: number;
  /** Multiplies the wind. */
  wind: number;
}

interface Kind extends WeatherNow {
  name: string;
  weight: number;
}

const KINDS: Kind[] = [
  { name: 'fair', weight: 30, cover: 0, cirrus: 0, alto: 0, light: 1, mist: 1, wind: 1 },
  { name: 'clear', weight: 18, cover: -0.25, cirrus: -0.12, alto: -0.15, light: 1.05, mist: 0.75, wind: 0.8 },
  { name: 'cloudy', weight: 20, cover: 0.22, cirrus: 0.1, alto: 0.2, light: 0.84, mist: 1.15, wind: 1.2 },
  { name: 'overcast', weight: 12, cover: 0.42, cirrus: 0.15, alto: 0.35, light: 0.62, mist: 1.5, wind: 1.35 },
  { name: 'misty', weight: 10, cover: 0.12, cirrus: -0.05, alto: 0.1, light: 0.8, mist: 2.4, wind: 0.6 },
  { name: 'breezy', weight: 10, cover: 0.05, cirrus: 0.25, alto: 0.05, light: 1, mist: 0.9, wind: 1.9 },
];

export const CALM: WeatherNow = { cover: 0, cirrus: 0, alto: 0, light: 1, mist: 1, wind: 1 };

const SLOT_MS = 12 * 60 * 1000;
const BLEND_MS = 3 * 60 * 1000;

function kindOf(slot: number): Kind {
  // A fixed shuffle of the slot number, so every copy of the game agrees.
  let h = (slot * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  const total = KINDS.reduce((t, k) => t + k.weight, 0);
  let x = r * total;
  for (const k of KINDS) {
    x -= k.weight;
    if (x <= 0) return k;
  }
  return KINDS[0];
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The weather at this moment, eased between one spell and the next. */
export function weatherAt(ms: number): WeatherNow & { name: string } {
  const slot = Math.floor(ms / SLOT_MS);
  const into = ms - slot * SLOT_MS;
  const a = kindOf(slot);
  const b = kindOf(slot + 1);
  const t0 = Math.max(0, (into - (SLOT_MS - BLEND_MS)) / BLEND_MS);
  const t = t0 * t0 * (3 - 2 * t0);
  return {
    name: t < 0.5 ? a.name : b.name,
    cover: mix(a.cover, b.cover, t), cirrus: mix(a.cirrus, b.cirrus, t), alto: mix(a.alto, b.alto, t),
    light: mix(a.light, b.light, t), mist: mix(a.mist, b.mist, t), wind: mix(a.wind, b.wind, t),
  };
}

/** Some weather, `k` of the way from calm. */
export function blendWeather(w: WeatherNow, k: number): WeatherNow {
  return {
    cover: w.cover * k, cirrus: w.cirrus * k, alto: w.alto * k,
    light: mix(1, w.light, k), mist: mix(1, w.mist, k), wind: mix(1, w.wind, k),
  };
}
