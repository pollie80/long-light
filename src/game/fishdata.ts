// The fish of the cove. Pure data and rules, no rendering.

export type Zone = 'shallows' | 'jetty' | 'reef' | 'deep' | 'magic';
export type TimeWindow = [number, number]; // from hour, to hour; wraps past midnight if from > to

export interface Species {
  id: string;
  name: string;
  verse: string;
  hint: string;
  zones: Zone[];
  when: TimeWindow[];
  rarity: number; // bigger is more likely
  length: number; // metres, for the journal and the model
  depth: number; // body height as a share of length
  top: number;
  side: number;
  belly: number;
  fin: number;
  pattern: 'plain' | 'bars' | 'spots' | 'stripes' | 'glow' | 'eel' | 'ray';
  accent?: number;
  fight: number; // seconds of gentle reeling
  glow?: number; // shines by itself when lifted from the water
}

const ANY: TimeWindow[] = [[0, 24]];
const DAWN: TimeWindow = [4.9, 7.2];
const MORNING: TimeWindow = [7, 10.5];
const DAY: TimeWindow = [9, 16.5];
const GOLDEN: TimeWindow = [16.3, 18.2];
const SUNSET: TimeWindow = [18, 19.2];
const DUSK: TimeWindow = [19, 20.6];
const NIGHT: TimeWindow = [20.4, 4.9];
const AWAKE: TimeWindow = [19.8, 5.2];

export const SPECIES: Species[] = [
  { id: 'smelt', name: 'Pearl Smelt', verse: 'Small and quick, and bright as a dropped coin.', hint: 'Anywhere the water is shallow, most hours.', zones: ['shallows', 'jetty'], when: ANY, rarity: 10, length: 0.16, depth: 0.2, top: 0x7fa7a4, side: 0xdde6dc, belly: 0xf4f2e6, fin: 0xb7c8c0, pattern: 'plain', fight: 4 },
  { id: 'flounder', name: 'Tide Flounder', verse: 'Lies on the sand and thinks about nothing.', hint: 'Under the jetty, any time at all.', zones: ['jetty'], when: ANY, rarity: 6, length: 0.32, depth: 0.5, top: 0x8c7a5a, side: 0xa58f6c, belly: 0xe8dfc8, fin: 0x7d6c4e, pattern: 'spots', accent: 0x5c4c34, fight: 6 },
  { id: 'perch', name: 'Reed Perch', verse: 'Barred like the shadows the reeds throw at evening.', hint: 'Shallows, in the soft light at either end of the day.', zones: ['shallows'], when: [DAWN, GOLDEN, SUNSET], rarity: 8, length: 0.27, depth: 0.34, top: 0x57703e, side: 0xa8a54e, belly: 0xe6d9a0, fin: 0xc8602e, pattern: 'bars', accent: 0x3c4a2a, fight: 6 },
  { id: 'rosegill', name: 'Rosegill', verse: 'Only awake for the first pink of the morning.', hint: 'Shallows or the reef, at first light.', zones: ['shallows', 'reef'], when: [DAWN], rarity: 6, length: 0.3, depth: 0.36, top: 0x8c6a7a, side: 0xdfb4b4, belly: 0xf5e8dc, fin: 0xd8707c, pattern: 'plain', accent: 0xc8405a, fight: 7 },
  { id: 'char', name: 'Mist Char', verse: 'You feel it before you see it, like the morning.', hint: 'Deep water while the mist lies on it.', zones: ['deep'], when: [DAWN], rarity: 5, length: 0.42, depth: 0.27, top: 0x54667c, side: 0xa8b4bc, belly: 0xe9e4d8, fin: 0x7c8ca4, pattern: 'spots', accent: 0xe8dcc8, fight: 9 },
  { id: 'bream', name: 'Sunfleck Bream', verse: 'Wears the noon on its side in loose gold coins.', hint: 'Near the jetty in full daylight.', zones: ['jetty', 'shallows'], when: [MORNING, DAY], rarity: 9, length: 0.3, depth: 0.42, top: 0x6c7a56, side: 0xc9ba68, belly: 0xf0e5b8, fin: 0x8c8a4a, pattern: 'spots', accent: 0xf0c94a, fight: 6 },
  { id: 'mullet', name: 'Harbour Mullet', verse: 'Stout, dependable, unimpressed by you.', hint: 'Around the jetty in the daytime.', zones: ['jetty'], when: [DAY], rarity: 8, length: 0.38, depth: 0.25, top: 0x5e7078, side: 0xb4bcb8, belly: 0xece8dc, fin: 0x7c8a8c, pattern: 'stripes', accent: 0x8c9a9c, fight: 7 },
  { id: 'wrasse', name: 'Blue Wrasse', verse: 'Painted by someone who had only just discovered blue.', hint: 'Reefs around the islands, by day.', zones: ['reef'], when: [MORNING, DAY], rarity: 8, length: 0.28, depth: 0.32, top: 0x24608c, side: 0x3e9cb8, belly: 0xbfe4d8, fin: 0xe8a23e, pattern: 'stripes', accent: 0x1c4870, fight: 6 },
  { id: 'darter', name: 'Silver Darter', verse: 'A flash, a flash, then the whole line sings.', hint: 'Open water through the morning and afternoon.', zones: ['deep'], when: [MORNING, DAY], rarity: 8, length: 0.46, depth: 0.2, top: 0x3e6a8c, side: 0xc8d4d8, belly: 0xf6f4ee, fin: 0x6c8ca4, pattern: 'plain', fight: 8 },
  { id: 'mackerel', name: "Gull's Mackerel", verse: 'The gulls saw it first. They always do.', hint: 'Open water as the afternoon turns gold.', zones: ['deep'], when: [[14, 18.2]], rarity: 8, length: 0.4, depth: 0.22, top: 0x2a6a6c, side: 0xbcccc0, belly: 0xf2efe2, fin: 0x4a7a78, pattern: 'bars', accent: 0x1e4a50, fight: 8 },
  { id: 'snapper', name: 'Copper Snapper', verse: 'The colour of a kettle that has seen good years.', hint: 'Reefs in the golden hours.', zones: ['reef'], when: [GOLDEN, SUNSET], rarity: 7, length: 0.44, depth: 0.38, top: 0xa8522e, side: 0xd88a4e, belly: 0xf4d8b0, fin: 0xb8462a, pattern: 'plain', accent: 0x6e3a94, fight: 9 },
  { id: 'trout', name: 'Ember Trout', verse: 'Rises only while the sky is on fire, and takes some with it.', hint: 'Open water, during the sunset itself.', zones: ['deep', 'reef'], when: [SUNSET], rarity: 5, length: 0.5, depth: 0.26, top: 0x6e3a3a, side: 0xe8743a, belly: 0xf8d090, fin: 0xc8402a, pattern: 'spots', accent: 0xffd070, fight: 10 },
  { id: 'gurnard', name: 'Violet Gurnard', verse: 'Walks the seabed on its fins at the end of the day.', hint: 'The reef, from the blue hour on.', zones: ['reef'], when: [DUSK, NIGHT], rarity: 6, length: 0.34, depth: 0.28, top: 0x4c3a78, side: 0x8c6cb0, belly: 0xdccce8, fin: 0x3e8cc0, pattern: 'bars', accent: 0x35285c, fight: 8 },
  { id: 'goby', name: 'Lantern Goby', verse: 'Carries a small light for its own reasons.', hint: 'Around the jetty after the lamps come on.', zones: ['jetty', 'shallows'], when: [DUSK, NIGHT], rarity: 8, length: 0.14, depth: 0.28, top: 0x3a4a5c, side: 0x74808c, belly: 0xdce0d8, fin: 0x54606c, pattern: 'glow', accent: 0xffc860, fight: 4, glow: 0xffc860 },
  { id: 'eel', name: 'Moon Eel', verse: 'A long thought, turning slowly in the dark.', hint: 'Shallow water, at night.', zones: ['shallows', 'jetty'], when: [NIGHT], rarity: 6, length: 0.8, depth: 0.075, top: 0x28344c, side: 0x7c8cb0, belly: 0xc8d0dc, fin: 0x3c4c6c, pattern: 'eel', fight: 9 },
  { id: 'ray', name: 'Starback Ray', verse: 'Someone spilled the night sky, and it swam away.', hint: 'Deep water, under the stars.', zones: ['deep'], when: [NIGHT], rarity: 5, length: 0.7, depth: 0.85, top: 0x1c2a4c, side: 0x2e3e68, belly: 0xdcdce0, fin: 0x1c2a4c, pattern: 'ray', accent: 0xe8ecff, fight: 11 },
  { id: 'cod', name: 'Old Grandfather', verse: 'Has been in this bay longer than the lighthouse. Let him go.', hint: 'Deep water, any hour. Patience.', zones: ['deep'], when: ANY, rarity: 1.1, length: 0.95, depth: 0.32, top: 0x5a5a44, side: 0x8c8a68, belly: 0xdcd4b4, fin: 0x54543e, pattern: 'spots', accent: 0x3c3c2c, fight: 15 },
  { id: 'salmon', name: 'Long Light Salmon', verse: 'The bay gives one of these to anyone who stays out to watch the sun go.', hint: 'Deep water, in the last minutes before the sun touches the sea.', zones: ['deep'], when: [[18.3, 18.85]], rarity: 2.4, length: 0.72, depth: 0.26, top: 0x8c3e5c, side: 0xf0946a, belly: 0xfde0b4, fin: 0xe85c4a, pattern: 'spots', accent: 0xfff0b8, fight: 14 },
  { id: 'wisp', name: 'Wisp Minnow', verse: 'Not entirely sure it is a fish. Neither are you.', hint: 'Where the water glows, after dark.', zones: ['magic'], when: [AWAKE], rarity: 10, length: 0.14, depth: 0.22, top: 0x6a3ac0, side: 0xc8a0f8, belly: 0xf8f0ff, fin: 0xe8a0f0, pattern: 'glow', accent: 0xf0b0ff, fight: 4, glow: 0xc070ff },
  { id: 'koi', name: 'Aurora Koi', verse: 'Swims as if someone had left a small light on inside it.', hint: 'Where the water glows, after dark. Be patient with it.', zones: ['magic'], when: [AWAKE], rarity: 5, length: 0.5, depth: 0.36, top: 0x2a3a78, side: 0x3ec8d8, belly: 0xd8fff0, fin: 0x9a5ce0, pattern: 'glow', accent: 0x7ffff0, fight: 10, glow: 0x44e8e0 },
];

export function inWindow(h: number, w: TimeWindow): boolean {
  const [a, b] = w;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

export function available(zone: Zone, hour: number): Species[] {
  const h = ((hour % 24) + 24) % 24;
  return SPECIES.filter((s) => s.zones.includes(zone) && s.when.some((w) => inWindow(h, w)));
}

/** Weighted pick. Fish you have not met yet are a little keener, so the journal fills up naturally. */
export function pickSpecies(zone: Zone, hour: number, rnd: () => number, seen: (id: string) => boolean = () => false): Species {
  const list = available(zone, hour);
  const pool = list.length ? list : SPECIES.filter((s) => s.id === 'smelt');
  const weight = (s: Species) => s.rarity * (seen(s.id) ? 1 : 1.6);
  const total = pool.reduce((t, s) => t + weight(s), 0);
  let r = rnd() * total;
  for (const s of pool) {
    r -= weight(s);
    if (r <= 0) return s;
  }
  return pool[pool.length - 1];
}
