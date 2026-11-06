// Everything about how the fisher looks, as plain data. The wardrobe reads this; so does the model.

export interface Choice {
  id: string;
  label: string;
  silly?: boolean;
  color?: number;
}

export interface CharacterLook {
  skin: string;
  markings: string;
  eyes: string;
  eyeColor: string;
  eyewear: string;
  brows: string;
  nose: string;
  ears: string;
  mouth: string;
  inMouth: string;
  facialHair: string;
  hairStyle: string;
  hairColor: string;
  hat: string;
  hatColor: string;
  outfit: string;
  coatColor: string;
  trouserColor: string;
  shoes: string;
  shoeColor: string;
  neck: string;
  neckColor: string;
  back: string;
  height: number;
  build: number;
  head: number;
}

export type PickKey = Exclude<keyof CharacterLook, 'height' | 'build' | 'head'>;
export type SliderKey = 'height' | 'build' | 'head';

export interface PickRow {
  key: PickKey;
  label: string;
  group: string;
  colours?: boolean;
  choices: Choice[];
}

export interface SliderRow {
  key: SliderKey;
  label: string;
  group: string;
  min: number;
  max: number;
  /** The most a sensible person would pick, used by the sensible surprise. */
  saneMin: number;
  saneMax: number;
}

const c = (id: string, label: string, color: number, silly = false): Choice => ({ id, label, color, silly });
const p = (id: string, label: string, silly = false): Choice => ({ id, label, silly });

const FABRIC: Choice[] = [
  c('mustard', 'mustard', 0xd29a2f), c('rust', 'rust', 0xa8502c), c('navy', 'navy', 0x2d3555), c('forest', 'forest', 0x3c5a3c),
  c('oilskin', 'oilskin yellow', 0xe6c02e), c('charcoal', 'charcoal', 0x3c3a3e), c('cream', 'cream', 0xe6dcc2), c('plum', 'plum', 0x5e3458),
  c('teal', 'teal', 0x2f7d80), c('red', 'red', 0xb8392e), c('sky', 'sky', 0x6fa8cc), c('tan', 'tan', 0xa98a68),
  c('pink', 'hot pink', 0xe8408c, true), c('neon', 'neon green', 0x7fe02c, true), c('purple', 'loud purple', 0x8a2ae0, true), c('white', 'bright white', 0xf4f2ea),
];

export const PICKS: PickRow[] = [
  { key: 'skin', label: 'skin', group: 'Face', colours: true, choices: [
    c('porcelain', 'porcelain', 0xf2cfb4), c('fair', 'fair', 0xe6b594), c('warm', 'warm', 0xd9a07c), c('tan', 'tan', 0xbd8257),
    c('brown', 'brown', 0x8f5a38), c('deep', 'deep', 0x5f3a26), c('ogre', 'ogre green', 0x7fa04a, true), c('blue', 'blue', 0x5d86c9, true),
    c('lobster', 'lobster', 0xd9543c, true), c('ghost', 'ghost', 0xe8ecef, true), c('lilac', 'alien lilac', 0xb28fd6, true),
  ] },
  { key: 'markings', label: 'cheeks and marks', group: 'Face', choices: [
    p('rosy', 'rosy cheeks'), p('none', 'none'), p('freckles', 'freckles'), p('scar', 'a scar'), p('weathered', 'weathered'),
    p('warpaint', 'war paint', true), p('clown', 'clown paint', true), p('whiskers', 'cat whiskers', true),
  ] },
  { key: 'eyes', label: 'eyes', group: 'Face', choices: [
    p('dots', 'dots'), p('round', 'round'), p('sleepy', 'sleepy'), p('wide', 'wide awake'), p('squint', 'smiling'),
    p('anime', 'enormous', true), p('googly', 'googly', true), p('cyclops', 'just the one', true), p('crossed', 'crossed out', true), p('stalks', 'on stalks', true),
  ] },
  { key: 'eyeColor', label: 'eye colour', group: 'Face', colours: true, choices: [
    c('brown', 'brown', 0x4a2e1c), c('blue', 'blue', 0x3a78b0), c('green', 'green', 0x4a8a4a), c('hazel', 'hazel', 0x8a6a2c), c('grey', 'grey', 0x7c8a94),
    c('red', 'red', 0xd02a2a, true), c('gold', 'gold', 0xf0c030, true), c('violet', 'violet', 0x9040e0, true),
  ] },
  { key: 'eyewear', label: 'on the eyes', group: 'Face', choices: [
    p('none', 'nothing'), p('round', 'round specs'), p('square', 'square glasses'), p('shades', 'sunglasses'), p('patch', 'eyepatch'), p('monocle', 'monocle'),
    p('stars', 'star shades', true), p('threeD', '3D glasses', true), p('snorkel', 'snorkel mask', true), p('groucho', 'fake nose and specs', true),
  ] },
  { key: 'brows', label: 'eyebrows', group: 'Face', choices: [
    p('none', 'none to speak of'), p('thin', 'thin'), p('normal', 'ordinary'), p('bushy', 'bushy'), p('angry', 'cross'), p('worried', 'worried'),
    p('unibrow', 'just the one', true), p('huge', 'enormous', true),
  ] },
  { key: 'nose', label: 'nose', group: 'Face', choices: [
    p('default', 'ordinary'), p('button', 'button'), p('long', 'long'), p('hooked', 'hooked'), p('big', 'big and round'),
    p('clown', 'red ball', true), p('carrot', 'carrot', true), p('pickle', 'pickle', true),
  ] },
  { key: 'ears', label: 'ears', group: 'Face', choices: [
    p('normal', 'ordinary'), p('small', 'small'), p('big', 'big'), p('elf', 'pointed', true), p('huge', 'dumbo', true), p('none', 'none', true),
  ] },
  { key: 'mouth', label: 'mouth', group: 'Face', choices: [
    p('none', 'keeps it shut'), p('smile', 'a small smile'), p('grin', 'a grin'), p('flat', 'a straight line'), p('frown', 'a bit glum'), p('oh', 'surprised'),
    p('teeth', 'buck teeth', true), p('tongue', 'tongue out', true),
  ] },
  { key: 'inMouth', label: 'in the mouth', group: 'Face', choices: [
    p('none', 'nothing'), p('grass', 'a blade of grass'), p('pipe', 'a pipe'), p('cigar', 'a cigar'),
    p('rose', 'a rose', true), p('fish', 'a small fish', true), p('gum', 'bubble gum', true),
  ] },
  { key: 'facialHair', label: 'facial hair', group: 'Hair', choices: [
    p('short', 'short beard'), p('none', 'clean shaven'), p('stubble', 'stubble'), p('moustache', 'moustache'), p('walrus', 'walrus moustache'), p('handlebar', 'handlebar'),
    p('goatee', 'goatee'), p('soul', 'soul patch'), p('chinstrap', 'chinstrap'), p('chops', 'mutton chops'), p('full', 'full beard'), p('long', 'long beard'),
    p('wizard', 'wizard beard', true), p('braids', 'viking braids', true), p('curly', 'curly villain', true),
  ] },
  { key: 'hairStyle', label: 'hair', group: 'Hair', choices: [
    p('short', 'short'), p('bald', 'bald'), p('receding', 'receding'), p('long', 'long'), p('ponytail', 'ponytail'), p('bun', 'bun'), p('mullet', 'mullet'), p('curls', 'curls'),
    p('afro', 'very big', true), p('mohawk', 'mohawk', true), p('pigtails', 'pigtails', true), p('spikes', 'spikes', true),
  ] },
  { key: 'hairColor', label: 'hair colour', group: 'Hair', colours: true, choices: [
    c('grey', 'grey', 0x5d524c), c('black', 'black', 0x1e1a1c), c('dark', 'dark brown', 0x3e2a20), c('chestnut', 'chestnut', 0x6b3f22), c('ginger', 'ginger', 0xb5561f),
    c('blonde', 'blonde', 0xd9b35a), c('white', 'white', 0xd9d5cc), c('pink', 'hot pink', 0xe8408c, true), c('blue', 'electric blue', 0x2a6ae8, true), c('lime', 'lime', 0x8fd42c, true), c('purple', 'purple', 0x7a3ac9, true),
  ] },
  { key: 'hat', label: 'hat', group: 'Hat', choices: [
    p('straw', 'straw hat'), p('none', 'no hat'), p('bucket', 'bucket hat'), p('cap', 'flat cap'), p('beanie', 'beanie'), p('souwester', "sou'wester"), p('captain', "captain's hat"), p('cowboy', 'cowboy hat'), p('top', 'top hat'),
    p('cone', 'traffic cone', true), p('viking', 'viking helmet', true), p('chef', "chef's hat", true), p('party', 'party hat', true), p('propeller', 'propeller beanie', true), p('fish', 'a whole fish', true), p('crown', 'crown', true), p('wizard', 'wizard hat', true), p('sombrero', 'sombrero', true),
  ] },
  { key: 'hatColor', label: 'hat colour', group: 'Hat', colours: true, choices: [
    c('straw', 'straw', 0xe0c684), ...FABRIC.filter((f) => f.id !== 'mustard'),
  ] },
  { key: 'outfit', label: 'wearing', group: 'Clothes', choices: [
    p('coat', 'long coat'), p('jacket', 'short jacket'), p('jumper', 'striped jumper'), p('dungarees', 'dungarees'), p('hoodie', 'hoodie'), p('hawaiian', 'holiday shirt'),
    p('tux', 'tuxedo', true), p('robe', 'long robe', true), p('tutu', 'tutu', true),
  ] },
  { key: 'coatColor', label: 'main colour', group: 'Clothes', colours: true, choices: FABRIC },
  { key: 'trouserColor', label: 'trousers', group: 'Clothes', colours: true, choices: [FABRIC[2], ...FABRIC.filter((f) => f.id !== 'navy')] },
  { key: 'shoes', label: 'on the feet', group: 'Clothes', choices: [
    p('boots', 'rubber boots'), p('work', 'work boots'), p('sneakers', 'sneakers'), p('sandals', 'sandals'), p('bare', 'bare feet'),
    p('clown', 'clown shoes', true), p('flippers', 'flippers', true), p('bunny', 'bunny slippers', true),
  ] },
  { key: 'shoeColor', label: 'shoe colour', group: 'Clothes', colours: true, choices: [
    c('oxblood', 'oxblood', 0x6a2b28), ...FABRIC,
  ] },
  { key: 'neck', label: 'round the neck', group: 'Clothes', choices: [
    p('scarf', 'scarf'), p('none', 'nothing'), p('bandana', 'bandana'), p('bowtie', 'bow tie'), p('tie', 'necktie'),
    p('lei', 'flower garland', true), p('boa', 'feather boa', true), p('bigbow', 'an enormous bow', true),
  ] },
  { key: 'neckColor', label: 'neck colour', group: 'Clothes', colours: true, choices: [
    c('red', 'red', 0xb8392e), ...FABRIC.filter((f) => f.id !== 'red'),
  ] },
  { key: 'back', label: 'on the back', group: 'Clothes', choices: [
    p('creel', 'wicker basket'), p('rucksack', 'rucksack'), p('none', 'nothing'),
    p('cape', 'cape', true), p('parrot', 'a parrot', true), p('cat', 'a cat', true), p('duck', 'duck ring', true), p('wings', 'wings', true),
  ] },
];

export const SLIDERS: SliderRow[] = [
  { key: 'height', label: 'height', group: 'Body', min: 0.72, max: 1.34, saneMin: 0.88, saneMax: 1.12 },
  { key: 'build', label: 'build', group: 'Body', min: 0.7, max: 1.7, saneMin: 0.85, saneMax: 1.3 },
  { key: 'head', label: 'head size', group: 'Body', min: 0.8, max: 2.2, saneMin: 0.92, saneMax: 1.12 },
];

export const GROUPS = ['Face', 'Hair', 'Hat', 'Clothes', 'Body'];

/** Exactly how the fisher looked before the wardrobe existed. */
export const DEFAULT_LOOK: CharacterLook = {
  skin: 'warm', markings: 'rosy', eyes: 'dots', eyeColor: 'brown', eyewear: 'none', brows: 'none', nose: 'default', ears: 'none', mouth: 'none', inMouth: 'none',
  facialHair: 'short', hairStyle: 'short', hairColor: 'grey', hat: 'straw', hatColor: 'straw', outfit: 'coat', coatColor: 'mustard', trouserColor: 'navy',
  shoes: 'boots', shoeColor: 'oxblood', neck: 'scarf', neckColor: 'red', back: 'creel', height: 1, build: 1, head: 1,
};

/** Fills gaps and drops anything no longer offered, so an old save can never break the character. */
export function cleanLook(saved: Partial<CharacterLook> | undefined): CharacterLook {
  const out: CharacterLook = { ...DEFAULT_LOOK };
  if (!saved) return out;
  for (const row of PICKS) {
    const v = saved[row.key];
    if (typeof v === 'string' && row.choices.some((x) => x.id === v)) out[row.key] = v;
  }
  for (const s of SLIDERS) {
    const v = saved[s.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  return out;
}

export function randomLook(silly: boolean, rnd: () => number = Math.random): CharacterLook {
  const out: CharacterLook = { ...DEFAULT_LOOK };
  for (const row of PICKS) {
    // A silly surprise still leans on the silly options, without making every single part silly.
    const sane = row.choices.filter((x) => !x.silly);
    const daft = row.choices.filter((x) => x.silly);
    const pool = silly && daft.length && rnd() < 0.62 ? daft : sane;
    out[row.key] = pool[Math.floor(rnd() * pool.length)].id;
  }
  for (const s of SLIDERS) {
    const lo = silly ? s.min : s.saneMin;
    const hi = silly ? s.max : s.saneMax;
    out[s.key] = lo + rnd() * (hi - lo);
  }
  return out;
}

export function choiceOf(key: PickKey, id: string): Choice {
  const row = PICKS.find((r) => r.key === key)!;
  return row.choices.find((x) => x.id === id) ?? row.choices[0];
}
