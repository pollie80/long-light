// The fish of each place. Pure data and rules, no rendering.
import { MAP, MapId } from '../world/maps';

export type Zone = 'shallows' | 'jetty' | 'reef' | 'deep' | 'magic';
export type TimeWindow = [number, number]; // from hour, to hour; wraps past midnight if from > to

/** How rare a fish is. Each tier is about three times as hard to come by as the one before. */
export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const TIERS: Tier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const TIER_LABEL: Record<Tier, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const TIER_WEIGHT: Record<Tier, number> = { common: 100, uncommon: 36, rare: 12, epic: 3.5, legendary: 1 };

export interface Species {
  id: string;
  name: string;
  verse: string;
  hint: string;
  zones: Zone[];
  when: TimeWindow[];
  tier: Tier;
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
  maps?: MapId[]; // only found in these places; everywhere if not given
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

const ALL_SPECIES: Species[] = [
  // El Nido, in Bacuit Bay: Filipino market names where they're the ones people use.
  { id: 'bisugo', name: 'Bisugo', verse: 'Threadfin bream, pink and silver. Goes in the pan with garlic and no fuss.', hint: 'Shallow water, any hour.', zones: ['shallows'], when: ANY, tier: 'common', length: 0.25, depth: 0.32, top: 0xc48a90, side: 0xe8c4c4, belly: 0xf4ecea, fin: 0xd8a040, pattern: 'plain', fight: 3, maps: ['philippines'] },
  { id: 'bangus', name: 'Bangus', verse: 'Milkfish, silver and sure of itself. The whole country has an opinion on how to cook it.', hint: 'Around the jetty, any hour.', zones: ['jetty'], when: ANY, tier: 'common', length: 0.6, depth: 0.24, top: 0x5f7f8c, side: 0xc8d4d8, belly: 0xf0f2f0, fin: 0x6a8a94, pattern: 'plain', fight: 3.2, maps: ['philippines'] },
  { id: 'dalagang', name: 'Dalagang Bukid', verse: 'Blue above, a yellow tail. Its name means a country girl, and there are always plenty of them.', hint: 'Reefs around the limestone, any hour.', zones: ['reef'], when: ANY, tier: 'common', length: 0.3, depth: 0.28, top: 0x3a68b0, side: 0x8ab0d8, belly: 0xe8d8e0, fin: 0xe8c02e, pattern: 'plain', fight: 2.8, maps: ['philippines'] },
  { id: 'galunggong', name: 'Galunggong', verse: 'The round scad. Small, blue-grey, and what most of the country had for dinner.', hint: 'Open water, any hour.', zones: ['deep'], when: ANY, tier: 'common', length: 0.26, depth: 0.22, top: 0x3e5a70, side: 0x98a8b4, belly: 0xe8ecee, fin: 0x5a7080, pattern: 'plain', fight: 2.6, maps: ['philippines'] },
  { id: 'clown', name: 'Anemone Clown', verse: 'Orange, white, and very put out that you came.', hint: 'Reefs, while the sun is up.', zones: ['reef'], when: [[6, 18]], tier: 'uncommon', length: 0.11, depth: 0.42, top: 0xe8702a, side: 0xf08a34, belly: 0xf4a860, fin: 0x1a1a1a, pattern: 'bars', accent: 0xffffff, fight: 1.6, maps: ['philippines'] },
  { id: 'parrotfish', name: 'Mulmol', verse: 'A parrotfish. Eats coral and turns it into the beach you walked on.', hint: 'Reefs through the middle of the day.', zones: ['reef'], when: [DAY], tier: 'uncommon', length: 0.55, depth: 0.36, top: 0x2f9a8a, side: 0x48b89a, belly: 0xe89ab0, fin: 0x3a68c8, pattern: 'stripes', accent: 0xe878a8, fight: 3.6, maps: ['philippines'] },
  { id: 'maya', name: 'Maya-Maya', verse: 'Red snapper, the one the restaurants ask for by name.', hint: 'Reefs and the jetty, evening and night.', zones: ['reef', 'jetty'], when: [GOLDEN, SUNSET, DUSK, NIGHT], tier: 'uncommon', length: 0.5, depth: 0.34, top: 0xb83a32, side: 0xd86a58, belly: 0xf0c8b8, fin: 0xa02e28, pattern: 'plain', fight: 4, maps: ['philippines'] },
  { id: 'lapu', name: 'Lapu-Lapu', verse: 'A spotted red grouper, named after a chief who won.', hint: 'Reefs in the golden hours.', zones: ['reef'], when: [GOLDEN, MORNING], tier: 'rare', length: 0.7, depth: 0.34, top: 0xa8362a, side: 0xc95040, belly: 0xe8b8a0, fin: 0x8a2a22, pattern: 'spots', accent: 0x3a4a78, fight: 5, maps: ['philippines'] },
  { id: 'talakitok', name: 'Talakitok', verse: 'A giant trevally. Hits the line like a door slamming.', hint: 'Open water at either end of the day.', zones: ['deep'], when: [DAWN, MORNING, GOLDEN, SUNSET], tier: 'rare', length: 0.95, depth: 0.36, top: 0x48586a, side: 0xb0bcc4, belly: 0xe8ecec, fin: 0x30343c, pattern: 'plain', fight: 7, maps: ['philippines'] },
  { id: 'tuna', name: 'Yellowfin', verse: 'A very large muscle with a very simple plan.', hint: 'Open water, morning and evening.', zones: ['deep'], when: [MORNING, GOLDEN, SUNSET], tier: 'epic', length: 1.3, depth: 0.26, top: 0x25365e, side: 0xa8b4c0, belly: 0xe8ecf0, fin: 0xeac22e, pattern: 'plain', fight: 8, maps: ['philippines'] },
  { id: 'mameng', name: 'Mameng', verse: 'A humphead wrasse, old as a grandfather and just as unhurried. Let this one go.', hint: 'Reefs in the very early morning.', zones: ['reef'], when: [DAWN], tier: 'legendary', length: 1.6, depth: 0.42, top: 0x2f8a78, side: 0x58b09a, belly: 0xb8d8c8, fin: 0x2a6a70, pattern: 'stripes', accent: 0x9ad8d0, fight: 11, maps: ['philippines'] },
  { id: 'sailfish', name: 'Sailfish', verse: 'Raises its sail, looks at you, and leaves.', hint: 'Open water at sunset, once in a very long while.', zones: ['deep'], when: [SUNSET], tier: 'legendary', length: 2.2, depth: 0.2, top: 0x28407a, side: 0x7a9ac0, belly: 0xe4e8ec, fin: 0x2f62b8, pattern: 'spots', accent: 0x5fb8e8, fight: 10, maps: ['philippines'] },
  // Moraine Lake: cold mountain fish of the Alberta Rockies.
  { id: 'whitefish', name: 'Mountain Whitefish', verse: 'Small mouth, silver sides, no ambition. Perfectly content.', hint: 'The jetty and open water, any hour.', zones: ['jetty', 'deep'], when: ANY, tier: 'common', length: 0.3, depth: 0.2, top: 0x5e6e70, side: 0xb8c4c4, belly: 0xece8e0, fin: 0x8a9496, pattern: 'plain', fight: 2.8, maps: ['canada'] },
  { id: 'brook', name: 'Brook Trout', verse: 'Pale worms on its back, red spots ringed in blue. Overdressed for a lake this cold.', hint: 'Shallow water, any hour.', zones: ['shallows'], when: ANY, tier: 'common', length: 0.3, depth: 0.24, top: 0x4a5e3a, side: 0x8a9a68, belly: 0xe8a868, fin: 0xd87a3a, pattern: 'spots', accent: 0xd84a3a, fight: 3, maps: ['canada'] },
  { id: 'cutthroat', name: 'Westslope Cutthroat', verse: 'A slash of red under the jaw. The trout that was here first.', hint: 'Around the rocks and islands, any hour.', zones: ['reef'], when: ANY, tier: 'common', length: 0.36, depth: 0.24, top: 0x5a6a42, side: 0xb0a878, belly: 0xece4d0, fin: 0x8a7a50, pattern: 'spots', accent: 0x2a2a2a, fight: 3.4, maps: ['canada'] },
  { id: 'rainbow', name: 'Rainbow Trout', verse: 'A pink stripe the length of it, as if someone had signed their work.', hint: 'Shallows and the jetty, morning and evening.', zones: ['shallows', 'jetty'], when: [DAWN, MORNING, GOLDEN, SUNSET], tier: 'uncommon', length: 0.45, depth: 0.24, top: 0x5a7a58, side: 0xc4b8a0, belly: 0xece8e0, fin: 0x8a7a60, pattern: 'stripes', accent: 0xe07890, fight: 4, maps: ['canada'] },
  { id: 'laketrout', name: 'Lake Trout', verse: 'Lives down where the water stays cold and summer never reaches.', hint: 'Deep water, early or late.', zones: ['deep'], when: [DAWN, GOLDEN, SUNSET, DUSK], tier: 'rare', length: 0.75, depth: 0.22, top: 0x3e4e48, side: 0x7a8a7c, belly: 0xe4e4d8, fin: 0x8a5a3a, pattern: 'spots', accent: 0xd8d8c0, fight: 6, maps: ['canada'] },
  { id: 'bulltrout', name: 'Bull Trout', verse: 'Alberta\'s own fish, and it knows it. Needs water colder than anything else will stand.', hint: 'Deep water and rocks, at dusk and through the night.', zones: ['deep', 'reef'], when: [DUSK, NIGHT], tier: 'epic', length: 0.85, depth: 0.2, top: 0x4a5a50, side: 0x8a9a88, belly: 0xe8dcc8, fin: 0x6a6a5a, pattern: 'spots', accent: 0xe8a050, fight: 8, maps: ['canada'] },
  { id: 'golden', name: 'Golden Trout', verse: 'Lives only in the highest, coldest water, and looks like something a king dropped in it.', hint: 'Shallows at first light, once in a very long while.', zones: ['shallows'], when: [DAWN], tier: 'legendary', length: 0.42, depth: 0.24, top: 0xa88a2a, side: 0xe8c040, belly: 0xe86a3a, fin: 0xe8a030, pattern: 'bars', accent: 0x8a4a2a, fight: 9, maps: ['canada'] },
  // Every place.
  { id: 'smelt', name: 'Pearl Smelt', verse: 'Small and quick, and bright as a dropped coin.', hint: 'Anywhere at all, at any hour.', zones: ['shallows', 'jetty', 'reef', 'deep'], when: ANY, tier: 'common', length: 0.16, depth: 0.2, top: 0x7fa7a4, side: 0xdde6dc, belly: 0xf4f2e6, fin: 0xb7c8c0, pattern: 'plain', fight: 4, maps: ['cove'] },
  { id: 'flounder', name: 'Tide Flounder', verse: 'Lies on the sand and thinks about nothing.', hint: 'Under the jetty, any time at all.', zones: ['jetty'], when: ANY, tier: 'uncommon', length: 0.32, depth: 0.5, top: 0x8c7a5a, side: 0xa58f6c, belly: 0xe8dfc8, fin: 0x7d6c4e, pattern: 'spots', accent: 0x5c4c34, fight: 6, maps: ['cove'] },
  { id: 'perch', name: 'Reed Perch', verse: 'Barred like the shadows the reeds throw at evening.', hint: 'Shallows, in the soft light at either end of the day.', zones: ['shallows'], when: [DAWN, GOLDEN, SUNSET], tier: 'common', length: 0.27, depth: 0.34, top: 0x57703e, side: 0xa8a54e, belly: 0xe6d9a0, fin: 0xc8602e, pattern: 'bars', accent: 0x3c4a2a, fight: 6, maps: ['cove'] },
  { id: 'rosegill', name: 'Rosegill', verse: 'Only awake for the first pink of the morning.', hint: 'Shallows or the reef, at first light.', zones: ['shallows', 'reef'], when: [DAWN], tier: 'uncommon', length: 0.3, depth: 0.36, top: 0x8c6a7a, side: 0xdfb4b4, belly: 0xf5e8dc, fin: 0xd8707c, pattern: 'plain', accent: 0xc8405a, fight: 7, maps: ['cove'] },
  { id: 'char', name: 'Mist Char', verse: 'You feel it before you see it, like the morning.', hint: 'Deep water while the mist lies on it.', zones: ['deep'], when: [DAWN], tier: 'rare', length: 0.42, depth: 0.27, top: 0x54667c, side: 0xa8b4bc, belly: 0xe9e4d8, fin: 0x7c8ca4, pattern: 'spots', accent: 0xe8dcc8, fight: 9, maps: ['cove'] },
  { id: 'bream', name: 'Sunfleck Bream', verse: 'Wears the noon on its side in loose gold coins.', hint: 'Near the jetty in full daylight.', zones: ['jetty', 'shallows'], when: [MORNING, DAY], tier: 'common', length: 0.3, depth: 0.42, top: 0x6c7a56, side: 0xc9ba68, belly: 0xf0e5b8, fin: 0x8c8a4a, pattern: 'spots', accent: 0xf0c94a, fight: 6, maps: ['cove'] },
  { id: 'mullet', name: 'Harbour Mullet', verse: 'Stout, dependable, unimpressed by you.', hint: 'Around the jetty in the daytime.', zones: ['jetty'], when: [DAY], tier: 'common', length: 0.38, depth: 0.25, top: 0x5e7078, side: 0xb4bcb8, belly: 0xece8dc, fin: 0x7c8a8c, pattern: 'stripes', accent: 0x8c9a9c, fight: 7, maps: ['cove'] },
  { id: 'wrasse', name: 'Blue Wrasse', verse: 'Painted by someone who had only just discovered blue.', hint: 'Reefs around the islands, by day.', zones: ['reef'], when: [MORNING, DAY], tier: 'uncommon', length: 0.28, depth: 0.32, top: 0x24608c, side: 0x3e9cb8, belly: 0xbfe4d8, fin: 0xe8a23e, pattern: 'stripes', accent: 0x1c4870, fight: 6, maps: ['cove'] },
  { id: 'darter', name: 'Silver Darter', verse: 'A flash, a flash, then the whole line sings.', hint: 'Open water through the morning and afternoon.', zones: ['deep'], when: [MORNING, DAY], tier: 'common', length: 0.46, depth: 0.2, top: 0x3e6a8c, side: 0xc8d4d8, belly: 0xf6f4ee, fin: 0x6c8ca4, pattern: 'plain', fight: 8, maps: ['cove'] },
  { id: 'mackerel', name: "Gull's Mackerel", verse: 'The gulls saw it first. They always do.', hint: 'Open water as the afternoon turns gold.', zones: ['deep'], when: [[14, 18.2]], tier: 'uncommon', length: 0.4, depth: 0.22, top: 0x2a6a6c, side: 0xbcccc0, belly: 0xf2efe2, fin: 0x4a7a78, pattern: 'bars', accent: 0x1e4a50, fight: 8, maps: ['cove'] },
  { id: 'snapper', name: 'Copper Snapper', verse: 'The colour of a kettle that has seen good years.', hint: 'Reefs in the golden hours.', zones: ['reef'], when: [GOLDEN, SUNSET], tier: 'uncommon', length: 0.44, depth: 0.38, top: 0xa8522e, side: 0xd88a4e, belly: 0xf4d8b0, fin: 0xb8462a, pattern: 'plain', accent: 0x6e3a94, fight: 9, maps: ['cove'] },
  { id: 'trout', name: 'Ember Trout', verse: 'Rises only while the sky is on fire, and takes some with it.', hint: 'Open water, during the sunset itself.', zones: ['deep', 'reef'], when: [SUNSET], tier: 'rare', length: 0.5, depth: 0.26, top: 0x6e3a3a, side: 0xe8743a, belly: 0xf8d090, fin: 0xc8402a, pattern: 'spots', accent: 0xffd070, fight: 10, maps: ['cove'] },
  { id: 'gurnard', name: 'Violet Gurnard', verse: 'Walks the seabed on its fins at the end of the day.', hint: 'The reef, from the blue hour on.', zones: ['reef'], when: [DUSK, NIGHT], tier: 'uncommon', length: 0.34, depth: 0.28, top: 0x4c3a78, side: 0x8c6cb0, belly: 0xdccce8, fin: 0x3e8cc0, pattern: 'bars', accent: 0x35285c, fight: 8, maps: ['cove'] },
  { id: 'goby', name: 'Lantern Goby', verse: 'Carries a small light for its own reasons.', hint: 'Around the jetty after the lamps come on.', zones: ['jetty', 'shallows'], when: [DUSK, NIGHT], tier: 'common', length: 0.14, depth: 0.28, top: 0x3a4a5c, side: 0x74808c, belly: 0xdce0d8, fin: 0x54606c, pattern: 'glow', accent: 0xffc860, fight: 4, glow: 0xffc860, maps: ['cove'] },
  { id: 'eel', name: 'Moon Eel', verse: 'A long thought, turning slowly in the dark.', hint: 'Shallow water, at night.', zones: ['shallows', 'jetty'], when: [NIGHT], tier: 'rare', length: 0.8, depth: 0.075, top: 0x28344c, side: 0x7c8cb0, belly: 0xc8d0dc, fin: 0x3c4c6c, pattern: 'eel', fight: 9, maps: ['cove'] },
  { id: 'ray', name: 'Starback Ray', verse: 'Someone spilled the night sky, and it swam away.', hint: 'Deep water, under the stars.', zones: ['deep'], when: [NIGHT], tier: 'epic', length: 0.7, depth: 0.85, top: 0x1c2a4c, side: 0x2e3e68, belly: 0xdcdce0, fin: 0x1c2a4c, pattern: 'ray', accent: 0xe8ecff, fight: 11, maps: ['cove'] },
  { id: 'cod', name: 'Old Grandfather', verse: 'Has been in this bay longer than the lighthouse. Let him go.', hint: 'Deep water, any hour. Patience.', zones: ['deep'], when: ANY, tier: 'legendary', length: 0.95, depth: 0.32, top: 0x5a5a44, side: 0x8c8a68, belly: 0xdcd4b4, fin: 0x54543e, pattern: 'spots', accent: 0x3c3c2c, fight: 15, maps: ['cove'] },
  { id: 'salmon', name: 'Long Light Salmon', verse: 'The bay gives one of these to anyone who stays out to watch the sun go.', hint: 'Deep water, in the last minutes before the sun touches the sea.', zones: ['deep'], when: [[18.3, 18.85]], tier: 'epic', length: 0.72, depth: 0.26, top: 0x8c3e5c, side: 0xf0946a, belly: 0xfde0b4, fin: 0xe85c4a, pattern: 'spots', accent: 0xfff0b8, fight: 14, maps: ['cove'] },
  { id: 'wisp', name: 'Wisp Minnow', verse: 'Not entirely sure it is a fish. Neither are you.', hint: 'Where the water glows, after dark.', zones: ['magic'], when: [AWAKE], tier: 'common', length: 0.14, depth: 0.22, top: 0x6a3ac0, side: 0xc8a0f8, belly: 0xf8f0ff, fin: 0xe8a0f0, pattern: 'glow', accent: 0xf0b0ff, fight: 4, glow: 0xc070ff },
  { id: 'koi', name: 'Aurora Koi', verse: 'Swims as if someone had left a small light on inside it.', hint: 'Where the water glows, after dark. Be patient with it.', zones: ['magic'], when: [AWAKE], tier: 'rare', length: 0.5, depth: 0.36, top: 0x2a3a78, side: 0x3ec8d8, belly: 0xd8fff0, fin: 0x9a5ce0, pattern: 'glow', accent: 0x7ffff0, fight: 10, glow: 0x44e8e0 },
];

/** The fish you can find where you are. */
export const SPECIES: Species[] = ALL_SPECIES.filter((s) => !s.maps || s.maps.includes(MAP.id)).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));

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
  // A fish you haven't met is a little keener, but not so keen that a legendary one stops being legendary.
  const weight = (s: Species) => TIER_WEIGHT[s.tier] * (seen(s.id) ? 1 : 1.3);
  const total = pool.reduce((t, s) => t + weight(s), 0);
  let r = rnd() * total;
  for (const s of pool) {
    r -= weight(s);
    if (r <= 0) return s;
  }
  return pool[pool.length - 1];
}
