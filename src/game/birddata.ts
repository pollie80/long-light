// The birds of each place, as plain data: how rare, when they fly, how they look, and a line for the journal.
import { inWindow, Tier, TIERS, TimeWindow } from './fishdata';
import type { MapId } from '../world/maps';

/** How a bird is drawn and built: the outline it has on the page and in the sky. */
export type BirdShape = 'duck' | 'gull' | 'pigeon' | 'heron' | 'raptor' | 'owl' | 'small' | 'goose' | 'loon' | 'corvid' | 'hornbill' | 'parrot';

export interface BirdKind {
  id: string;
  name: string;
  tier: Tier;
  map: MapId;
  /** Hours it is about; any time if not given. */
  when?: TimeWindow[];
  shape: BirdShape;
  body: number;
  wing: number;
  head: number;
  bill: number;
  /** Throat and breast, if not the body colour. */
  breast?: number;
  /** One more mark: a chin strap, a crown, wing tips. */
  accent?: number;
  size: number;
  /** Metres a second. */
  speed: number;
  flock: [number, number];
  verse: string;
  hint: string;
}

const NIGHT: TimeWindow[] = [[19.4, 5.6]];
const DAY: TimeWindow[] = [[5.4, 20.4]];
const DAYLONG: TimeWindow[] = [[4.6, 21.6]];

export const BIRDS: BirdKind[] = [
  // The cove.
  { id: 'mallard', name: 'Mallard', tier: 'common', map: 'cove', shape: 'duck', body: 0x8a7a64, wing: 0x6a5c4c, head: 0x1f6a48, bill: 0xd9a62e, breast: 0x7a4a34, size: 1, speed: 11, flock: [3, 6],
    verse: 'Never in a hurry, except now.', hint: 'Over the bay at any hour, in a loose line.' },
  { id: 'herring', name: 'Herring Gull', tier: 'common', map: 'cove', shape: 'gull', when: DAYLONG, body: 0xe8e4da, wing: 0xa8aab0, head: 0xf0ece4, bill: 0xe0b030, accent: 0x1c1c1e, size: 1.15, speed: 9, flock: [2, 4],
    verse: 'Has opinions about your sandwich.', hint: 'All day long, wherever there might be chips.' },
  { id: 'woodpigeon', name: 'Wood Pigeon', tier: 'common', map: 'cove', shape: 'pigeon', when: DAY, body: 0x8a8c98, wing: 0x6e707c, head: 0x74788a, bill: 0xd0a040, breast: 0xb08a90, size: 0.8, speed: 13, flock: [3, 7],
    verse: 'Takes off like a dropped umbrella.', hint: 'By day, over the woods behind the cottage.' },
  { id: 'cormorant', name: 'Cormorant', tier: 'uncommon', map: 'cove', shape: 'loon', body: 0x1e2226, wing: 0x2a2e30, head: 0x1a1e20, bill: 0xc8a040, breast: 0x2a2a26, size: 1.2, speed: 12, flock: [1, 3],
    verse: 'Low and straight, like it owes someone money.', hint: 'Low over the water, any time.' },
  { id: 'greyheron', name: 'Grey Heron', tier: 'uncommon', map: 'cove', shape: 'heron', when: DAYLONG, body: 0xb8bcc0, wing: 0x7a8088, head: 0xe8e8e4, bill: 0xd8b040, accent: 0x1c1c20, size: 1.5, speed: 7, flock: [1, 1],
    verse: 'A folded deckchair with somewhere to be.', hint: 'Alone, slow, early or late.' },
  { id: 'oystercatcher', name: 'Oystercatcher', tier: 'rare', map: 'cove', shape: 'gull', body: 0xf2f0ea, wing: 0x16161a, head: 0x16161a, bill: 0xe86a1c, breast: 0x16161a, size: 0.75, speed: 14, flock: [2, 4],
    verse: 'Shouts its own name, mostly.', hint: 'Black, white and a carrot of a beak. Not often.' },
  { id: 'barnowl', name: 'Barn Owl', tier: 'epic', map: 'cove', shape: 'owl', when: NIGHT, body: 0xf0e8d8, wing: 0xd8b078, head: 0xd8b078, bill: 0xd8c8b0, breast: 0xf6f0e4, size: 0.9, speed: 8, flock: [1, 1],
    verse: 'A pale face that knows exactly where you are.', hint: 'Only after dark.' },
  { id: 'snowyowl', name: 'Snowy Owl', tier: 'legendary', map: 'cove', shape: 'owl', when: [[17, 8]], body: 0xf6f6f2, wing: 0xeeeee8, head: 0xfafaf6, bill: 0x2a2a2a, accent: 0x5a5a5a, size: 1.15, speed: 9, flock: [1, 1],
    verse: 'A long way from home, and not bothered.', hint: 'Once in a very long while, from dusk to morning.' },

  // El Nido.
  { id: 'egret', name: 'Great Egret', tier: 'common', map: 'philippines', shape: 'heron', when: DAY, body: 0xf2efe6, wing: 0xe8e4da, head: 0xf4f0e8, bill: 0xe0a830, size: 1.3, speed: 8, flock: [2, 4],
    verse: 'Very white, very serious.', hint: 'By day, along the beaches.' },
  { id: 'phduck', name: 'Philippine Duck', tier: 'common', map: 'philippines', shape: 'duck', body: 0x8a7458, wing: 0x4a6a5a, head: 0xb8946a, bill: 0x4a5a6a, accent: 0x1c1c1c, size: 1, speed: 11, flock: [3, 6],
    verse: 'Found nowhere else, and quite smug about it.', hint: 'Over the bay at any hour.' },
  { id: 'swallow', name: 'Pacific Swallow', tier: 'common', map: 'philippines', shape: 'small', when: DAY, body: 0xe8dccc, wing: 0x1a2a50, head: 0x1e2e58, bill: 0x101010, breast: 0xc06a3a, size: 0.45, speed: 15, flock: [4, 8],
    verse: 'Gone before you finished pointing.', hint: 'Quick little flocks by day.' },
  { id: 'kingfisher', name: 'Collared Kingfisher', tier: 'uncommon', map: 'philippines', shape: 'small', when: DAY, body: 0xf0ece0, wing: 0x2a7a9c, head: 0x2a7a9c, bill: 0x20201e, breast: 0xf4f0e6, size: 0.62, speed: 14, flock: [1, 2],
    verse: 'A blue streak with a fishing licence.', hint: 'By day, in ones and twos.' },
  { id: 'kite', name: 'Brahminy Kite', tier: 'uncommon', map: 'philippines', shape: 'raptor', when: [[6, 18.5]], body: 0xa04a24, wing: 0xa04a24, head: 0xf2efe6, bill: 0xe8d080, breast: 0xf2efe6, accent: 0x2a1a10, size: 1.3, speed: 9, flock: [1, 2],
    verse: 'Circles the boats, just in case.', hint: 'Through the hot middle of the day.' },
  { id: 'seaeagle', name: 'White-bellied Sea Eagle', tier: 'rare', map: 'philippines', shape: 'raptor', when: [[6, 18.5]], body: 0xf2f0ea, wing: 0x5a5e66, head: 0xf4f2ee, bill: 0x5a5e66, accent: 0x2a2c30, size: 1.7, speed: 9, flock: [1, 1],
    verse: 'Owns the cliffs. Has the paperwork.', hint: 'Big and pale, high over the karst, by day.' },
  { id: 'scopsowl', name: 'Palawan Scops Owl', tier: 'epic', map: 'philippines', shape: 'owl', when: NIGHT, body: 0x9a6a40, wing: 0x7a5232, head: 0xa87448, bill: 0xd8c8a0, breast: 0xc89a68, size: 0.6, speed: 8, flock: [1, 1],
    verse: 'Small, round, and certain it is invisible.', hint: 'Only at night.' },
  { id: 'hornbill', name: 'Palawan Hornbill', tier: 'epic', map: 'philippines', shape: 'hornbill', when: [[6, 17.5]], body: 0x1a1a1a, wing: 0x1e1e1e, head: 0xf0ece0, bill: 0xe8e0c8, accent: 0xf4f2ec, size: 1.4, speed: 9, flock: [1, 2],
    verse: 'Wears its hat on its nose.', hint: 'By day, rarely, with a great whoosh of wings.' },
  { id: 'cockatoo', name: 'Philippine Cockatoo', tier: 'legendary', map: 'philippines', shape: 'parrot', when: [[6, 18]], body: 0xf6f4ee, wing: 0xf2f0ea, head: 0xf6f4ee, bill: 0x3a3a3a, breast: 0xf6f4ee, accent: 0xd83a2a, size: 0.9, speed: 12, flock: [1, 2],
    verse: 'Almost nobody has seen one. Now you have.', hint: 'A white bird, by day, hardly ever.' },

  // Moraine Lake.
  { id: 'cangoose', name: 'Canada Goose', tier: 'common', map: 'canada', shape: 'goose', body: 0x8a7c68, wing: 0x5e5244, head: 0x1a1a1a, bill: 0x1a1a1a, breast: 0xd8d0c0, accent: 0xf2f0ea, size: 1.5, speed: 10, flock: [5, 9],
    verse: 'Honks first, asks questions never.', hint: 'Big untidy V shapes, any time.' },
  { id: 'nutcracker', name: "Clark's Nutcracker", tier: 'common', map: 'canada', shape: 'corvid', when: DAY, body: 0x9a9a98, wing: 0x26262a, head: 0xa8a8a6, bill: 0x20242a, accent: 0xf2f2ee, size: 0.66, speed: 13, flock: [2, 4],
    verse: 'Has buried thirty thousand seeds and remembers every one.', hint: 'By day, along the scree.' },
  { id: 'merganser', name: 'Common Merganser', tier: 'common', map: 'canada', shape: 'duck', body: 0xf2efe8, wing: 0x2a2c30, head: 0x1e4a38, bill: 0xc83a2a, size: 1, speed: 12, flock: [2, 5],
    verse: 'A duck with a saw for a beak.', hint: 'Low over the lake, any hour.' },
  { id: 'canjay', name: 'Canada Jay', tier: 'uncommon', map: 'canada', shape: 'corvid', when: DAY, body: 0x9aa0a8, wing: 0x6a7078, head: 0xf0f0ec, bill: 0x1a1a1a, accent: 0x2a2a2e, size: 0.6, speed: 11, flock: [1, 3],
    verse: 'Will take the cheese out of your hand.', hint: 'By day, curious, in ones and twos.' },
  { id: 'loon', name: 'Common Loon', tier: 'uncommon', map: 'canada', shape: 'loon', body: 0x2a2c30, wing: 0x1e2024, head: 0x14181a, bill: 0x20242a, breast: 0xf0f0ec, accent: 0xf0f0ec, size: 1.1, speed: 12, flock: [1, 3],
    verse: 'Its call is the sound of the lake at night.', hint: 'Any time, but you hear it more than see it.' },
  { id: 'harlequin', name: 'Harlequin Duck', tier: 'rare', map: 'canada', shape: 'duck', body: 0x3a4a6a, wing: 0x2a3450, head: 0x2a3450, bill: 0x4a4a50, breast: 0xa8502c, accent: 0xf4f2ee, size: 0.85, speed: 13, flock: [2, 3],
    verse: 'Dressed for a party nobody else was told about.', hint: 'Rarely, in pairs, fast and low.' },
  { id: 'baldeagle', name: 'Bald Eagle', tier: 'rare', map: 'canada', shape: 'raptor', when: [[6, 19]], body: 0x3a2a1e, wing: 0x34261a, head: 0xf6f4ee, bill: 0xf0c030, accent: 0xf6f4ee, size: 1.8, speed: 9, flock: [1, 1],
    verse: 'Looks cross. Is just like that.', hint: 'Alone and high, by day.' },
  { id: 'hornedowl', name: 'Great Horned Owl', tier: 'epic', map: 'canada', shape: 'owl', when: NIGHT, body: 0x8a6a48, wing: 0x6a5038, head: 0x7a5a3a, bill: 0x2a2a2a, breast: 0xb09070, accent: 0x3a2a1c, size: 1.1, speed: 8, flock: [1, 1],
    verse: 'Two ears that are not ears, and yellow eyes that are very much eyes.', hint: 'Only after dark.' },
  { id: 'whoopingcrane', name: 'Whooping Crane', tier: 'legendary', map: 'canada', shape: 'heron', when: DAY, body: 0xf6f6f2, wing: 0xf2f2ee, head: 0xf6f6f2, bill: 0x6a5a40, accent: 0xc82a2a, size: 1.7, speed: 9, flock: [1, 2],
    verse: 'Once there were fifteen left in the world.', hint: 'Enormous and white, by day, almost never.' },
];

const TIER_WEIGHT: Record<Tier, number> = { common: 100, uncommon: 36, rare: 12, epic: 3.5, legendary: 1 };

/** Every bird of one place, commonest first. */
export function birdsOf(map: MapId): BirdKind[] {
  return BIRDS.filter((b) => b.map === map).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
}

export function birdById(id: string): BirdKind | undefined {
  return BIRDS.find((b) => b.id === id);
}

export function fliesAt(b: BirdKind, hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return !b.when || b.when.some((w) => inWindow(h, w));
}

/** Which kind the next flock is: by rarity, among those about at this hour. One never shot is a little keener. */
export function pickBird(map: MapId, hour: number, rnd: () => number, seen: (id: string) => boolean = () => false): BirdKind {
  const pool = birdsOf(map).filter((b) => fliesAt(b, hour));
  const list = pool.length ? pool : birdsOf(map).filter((b) => b.tier === 'common');
  const weight = (b: BirdKind) => TIER_WEIGHT[b.tier] * (seen(b.id) ? 1 : 1.3);
  const total = list.reduce((t, b) => t + weight(b), 0);
  let r = rnd() * total;
  for (const b of list) {
    r -= weight(b);
    if (r <= 0) return b;
  }
  return list[list.length - 1];
}

const NEON = [0x2ae8d8, 0x4aa8ff, 0x9a6aff, 0xff5ad8, 0x5affa0, 0x38d0ff];
const neonCache = new Map<string, BirdKind>();

/** The same bird, glowing: one neon colour per kind, so it's always the same one. */
export function neonBird(b: BirdKind): BirdKind {
  let n = neonCache.get(b.id);
  if (!n) {
    let h = 0;
    for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) >>> 0;
    const c = NEON[h % NEON.length];
    n = { ...b, body: c, wing: c, head: 0xf2fbff, breast: 0xf2fbff, accent: 0xffffff, bill: 0xf2fbff };
    neonCache.set(b.id, n);
  }
  return n;
}

export interface BirdEntry {
  /** How many of those came down glowing. */
  neon?: number;
  count: number;
  /** Metres, the longest shot that brought one down. */
  longest: number;
  firstHour: number;
}
