// The places you can fish. A map is chosen before the world is built, because the land, the planting and
// the shaders are all made once from it. Changing map reloads the game. Pure data, no rendering.

export type MapId = 'cove' | 'philippines' | 'canada';

export interface Islet {
  x: number;
  z: number;
  r: number;
  h: number;
}

type Rgb = [number, number, number];

export interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  blurb: string;
  islets: Islet[];
  terrain: {
    /** Multiplies the hills behind the shore. */
    hills: number;
    /** Extra height of the ranges far inland, in metres. */
    peaks: number;
    beach: [number, number];
    /** How deep the open water gets, compared with the cove. */
    depth: number;
    cliffs: number;
    /** Steep limestone towers rather than rounded islands. */
    karst: boolean;
    /** Hills closing off the far side, making a lake of the bay. */
    enclosed: boolean;
    /** A wall of real mountains around everything, with named high points. */
    rockies: boolean;
  };
  colours: {
    grass: [Rgb, Rgb, Rgb, Rgb];
    rock: [Rgb, Rgb];
    sand: [Rgb, Rgb];
    seabed: Rgb;
    dirt: [Rgb, Rgb];
    stone: [Rgb, Rgb];
    /** Height sand reaches up the shore. */
    sandTop: number;
    snowLine: number;
    /** How much jungle clings to bare rock, and how much coral darkens the sand under water. */
    rockGreen: number;
    coral: number;
  };
  water: {
    /** How quickly each colour is lost with depth. Less red loss with less green loss is a brighter lagoon. */
    absorb: Rgb;
    scatter: Rgb;
  };
  mood: {
    cover: number;
    cirrus: number;
    alto: number;
    fog: number;
    mist: number;
    sat: number;
    warmth: number;
  };
  trees: {
    tall: 'pine' | 'palm' | 'spruce';
    /** Share of trees that are the tall kind. */
    tallShare: number;
    minY: number;
    maxY: number;
    /** Palms only grow near the sea. */
    tallBelowY: number;
    /** The other kind of tree: broad-leaved, or larch, which is a conifer that turns gold. */
    round: 'broadleaf' | 'larch';
    /** Every hand-placed tree along the walk is the tall kind. */
    heroesTall: boolean;
    /** Coconut palms along the top of the beach. */
    beachPalms: number;
    /** Reeds in the shallows, as a share of the cove's. */
    reeds: number;
    tallHi: [Rgb, Rgb];
    tallLo: Rgb;
    roundHi: [Rgb, Rgb][];
    roundLo: Rgb;
  };
  far: { height: number; snow: number };
  props: {
    wall: number;
    roof: number;
    wood: number;
    woodDark: number;
    woodPale: number;
    lighthouse: number;
    band: number;
    house: 'cottage' | 'nipa' | 'lodge';
    beacon: boolean;
    kit: 'none' | 'bangka' | 'canoe';
  };
}

const COVE: MapDef = {
  id: 'cove',
  name: 'Long Light Cove',
  tagline: 'a quiet place to fish',
  blurb: 'The original. Green hills, a cottage, and the sun going down over the bay.',
  islets: [
    { x: -250, z: -196, r: 30, h: 13 },
    { x: -352, z: -74, r: 54, h: 24 },
    { x: -120, z: -128, r: 7, h: 3.2 },
    { x: -196, z: 118, r: 11, h: 4.6 },
  ],
  terrain: { hills: 1, peaks: 0, beach: [4.5, 18], depth: 1, cliffs: 1, karst: false, enclosed: false, rockies: false },
  colours: {
    grass: [[98, 128, 58], [142, 148, 66], [62, 100, 66], [176, 152, 86]],
    rock: [[112, 104, 112], [150, 128, 114]],
    sand: [[226, 200, 158], [206, 174, 134]],
    seabed: [60, 84, 88],
    dirt: [[150, 118, 84], [176, 142, 100]],
    stone: [[170, 160, 150], [138, 128, 128]],
    sandTop: 1.25,
    snowLine: 1e5,
    rockGreen: 0,
    coral: 0,
  },
  water: { absorb: [0.42, 0.11, 0.075], scatter: [1, 1, 1] },
  mood: { cover: 0, cirrus: 0, alto: 0, fog: 1, mist: 1, sat: 1, warmth: 1 },
  trees: {
    tall: 'pine', tallShare: 0.42, minY: 2.4, maxY: 1e5, tallBelowY: 1e5, round: 'broadleaf', heroesTall: false, beachPalms: 0, reeds: 1,
    tallHi: [[0.1, 0.21, 0.09], [0.05, 0.07, 0.03]],
    tallLo: [0.012, 0.055, 0.05],
    roundHi: [[[0.15, 0.25, 0.07], [0.12, 0.1, 0.04]]],
    roundLo: [0.012, 0.04, 0.03],
  },
  far: { height: 1, snow: 1e5 },
  props: { wall: 0xeadcc2, roof: 0xa2583c, wood: 0x7a5a42, woodDark: 0x4a3428, woodPale: 0xa98a68, lighthouse: 0xefe7d6, band: 0xb5392e, house: 'cottage', beacon: true, kit: 'none' },
};

const PHILIPPINES: MapDef = {
  id: 'philippines',
  name: 'El Nido, Palawan',
  tagline: 'a quiet bay in the Philippines',
  blurb: 'Bacuit Bay: limestone islands, coconut palms, double-outrigger bangkas and clear turquoise water.',
  islets: [
    { x: -250, z: -196, r: 34, h: 58 },
    { x: -352, z: -74, r: 62, h: 92 },
    { x: -120, z: -128, r: 9, h: 24 },
    { x: -196, z: 118, r: 14, h: 34 },
    { x: -160, z: -48, r: 8, h: 26 },
    { x: -265, z: 44, r: 18, h: 44 },
    { x: -330, z: 124, r: 26, h: 62 },
    { x: -92, z: 104, r: 7, h: 18 },
    { x: -430, z: 44, r: 34, h: 74 },
    { x: -300, z: -250, r: 16, h: 40 },
    { x: -205, z: -112, r: 6, h: 16 },
    // The great cliffs behind the town, as Taraw stands over El Nido.
    { x: 178, z: 104, r: 62, h: 128 },
    { x: 232, z: -82, r: 74, h: 150 },
  ],
  terrain: { hills: 0.85, peaks: 40, beach: [12, 34], depth: 0.42, cliffs: 0.75, karst: true, enclosed: false, rockies: false },
  colours: {
    grass: [[78, 132, 50], [108, 150, 54], [42, 106, 54], [140, 156, 68]],
    rock: [[104, 104, 102], [168, 162, 148]],
    sand: [[250, 240, 214], [238, 224, 192]],
    seabed: [150, 210, 196],
    dirt: [[176, 146, 104], [198, 170, 126]],
    stone: [[196, 186, 164], [170, 160, 140]],
    sandTop: 3.1,
    snowLine: 1e5,
    rockGreen: 0.62,
    coral: 0.6,
  },
  water: { absorb: [0.34, 0.052, 0.05], scatter: [0.55, 1.45, 1.35] },
  mood: { cover: 0.07, cirrus: -0.04, alto: -0.04, fog: 0.85, mist: 0.45, sat: 1.12, warmth: 1.12 },
  trees: {
    tall: 'palm', tallShare: 0.82, minY: 1.5, maxY: 1e5, tallBelowY: 15, round: 'broadleaf', heroesTall: true, beachPalms: 90, reeds: 0.08,
    tallHi: [[0.14, 0.36, 0.07], [0.09, 0.14, 0.04]],
    tallLo: [0.012, 0.07, 0.03],
    roundHi: [[[0.06, 0.24, 0.05], [0.06, 0.12, 0.03]], [[0.1, 0.32, 0.06], [0.06, 0.1, 0.03]]],
    roundLo: [0.006, 0.045, 0.02],
  },
  far: { height: 0.55, snow: 1e5 },
  props: { wall: 0xc9ad78, roof: 0xb49e64, wood: 0x8a6c44, woodDark: 0x5a452c, woodPale: 0xc4ae7c, lighthouse: 0xf4efe2, band: 0xf4efe2, house: 'nipa', beacon: false, kit: 'bangka' },
};

const CANADA: MapDef = {
  id: 'canada',
  name: 'Moraine Lake, Alberta',
  tagline: 'a quiet lake in the Canadian Rockies',
  blurb: 'The Valley of the Ten Peaks: glacier-fed turquoise water, red canoes, spruce and golden larch.',
  islets: [
    { x: -250, z: -196, r: 24, h: 9 },
    { x: -352, z: -74, r: 40, h: 16 },
    { x: -120, z: -128, r: 6, h: 3 },
    { x: -196, z: 118, r: 9, h: 4.5 },
  ],
  terrain: { hills: 1.25, peaks: 120, beach: [3, 9], depth: 1.1, cliffs: 1.2, karst: false, enclosed: true, rockies: true },
  colours: {
    grass: [[84, 104, 58], [112, 118, 62], [58, 84, 58], [152, 124, 66]],
    rock: [[100, 100, 104], [132, 124, 118]],
    sand: [[166, 158, 146], [132, 126, 118]],
    seabed: [96, 138, 134],
    dirt: [[122, 98, 72], [146, 120, 90]],
    stone: [[150, 148, 146], [118, 116, 118]],
    sandTop: 0.95,
    snowLine: 118,
    rockGreen: 0,
    coral: 0,
  },
  // Rock flour from the glacier hangs in the water: little gets through, and what comes back is turquoise.
  water: { absorb: [0.46, 0.12, 0.085], scatter: [0.62, 1.42, 1.34] },
  mood: { cover: -0.07, cirrus: 0.07, alto: 0, fog: 0.62, mist: 1.1, sat: 1.05, warmth: 0.88 },
  trees: {
    tall: 'spruce', tallShare: 0.68, minY: 1.8, maxY: 100, tallBelowY: 1e5, round: 'larch', heroesTall: false, beachPalms: 0, reeds: 0.12,
    tallHi: [[0.05, 0.14, 0.08], [0.03, 0.05, 0.03]],
    tallLo: [0.008, 0.035, 0.035],
    roundHi: [[[0.72, 0.5, 0.07], [0.14, 0.12, 0.03]], [[0.62, 0.42, 0.05], [0.14, 0.12, 0.03]]],
    roundLo: [0.05, 0.03, 0.012],
  },
  far: { height: 1.3, snow: 300 },
  props: { wall: 0x8a6440, roof: 0x5e8468, wood: 0x6e4c30, woodDark: 0x402c1e, woodPale: 0x9a7c58, lighthouse: 0xefe7d6, band: 0xb5392e, house: 'lodge', beacon: false, kit: 'canoe' },
};

export const MAPS: Record<MapId, MapDef> = { cove: COVE, philippines: PHILIPPINES, canada: CANADA };
export const MAP_ORDER: MapId[] = ['cove', 'philippines', 'canada'];
export const MAP_KEY = 'longlight.map';

/** An invite link names its map, because everyone in a cove has to be standing in the same world. */
export function mapFromHash(hash: string): MapId | null {
  const m = /[#&]map=([a-z]+)/.exec(hash);
  return m && MAP_ORDER.includes(m[1] as MapId) ? (m[1] as MapId) : null;
}

function chooseMap(): MapId {
  if (typeof location === 'undefined') return 'cove';
  const linked = mapFromHash(location.hash);
  if (linked) return linked;
  try {
    const saved = localStorage.getItem(MAP_KEY);
    if (saved && MAP_ORDER.includes(saved as MapId)) return saved as MapId;
  } catch {
    /* A private window has no storage. */
  }
  return 'cove';
}

export const MAP: MapDef = MAPS[chooseMap()];

/** Goes to another map. The world is built once, so this reloads the game. */
export function switchMap(id: MapId) {
  try {
    localStorage.setItem(MAP_KEY, id);
  } catch {
    /* Without storage, the link below still carries it. */
  }
  // Replaced, not added: an extra history entry would stop Quit from closing the window.
  history.replaceState(null, '', `#map=${id}`);
  location.reload();
}

const glslRgb = (c: Rgb) => `hexv(${c[0].toFixed(1)}, ${c[1].toFixed(1)}, ${c[2].toFixed(1)})`;

/** This map's ground colours as GLSL, read by the terrain and the grass. */
export const MAP_GLSL = (() => {
  const c = MAP.colours;
  return `
#define GRASS_A ${glslRgb(c.grass[0])}
#define GRASS_B ${glslRgb(c.grass[1])}
#define GRASS_C ${glslRgb(c.grass[2])}
#define GRASS_D ${glslRgb(c.grass[3])}
#define ROCK_A ${glslRgb(c.rock[0])}
#define ROCK_B ${glslRgb(c.rock[1])}
#define SAND_A ${glslRgb(c.sand[0])}
#define SAND_B ${glslRgb(c.sand[1])}
#define SEABED ${glslRgb(c.seabed)}
#define DIRT_A ${glslRgb(c.dirt[0])}
#define DIRT_B ${glslRgb(c.dirt[1])}
#define STONE_A ${glslRgb(c.stone[0])}
#define STONE_B ${glslRgb(c.stone[1])}
#define SAND_TOP ${c.sandTop.toFixed(2)}
#define SNOW_LINE ${c.snowLine.toFixed(1)}
#define ROCK_GREEN ${c.rockGreen.toFixed(2)}
#define CORAL ${c.coral.toFixed(2)}
`;
})();
