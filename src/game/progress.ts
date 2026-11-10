// What you have found so far, worked out from the journal: everything the Progress page shows.
import { ALL_SPECIES, placeSpecies, Tier, TIER_LABEL, TIERS } from './fishdata';
import { BIRDS, BirdEntry, birdsOf } from './birddata';
import { MAP_ORDER, MapId, MAPS } from '../world/maps';
import type { Journal } from '../ui/ui';

export interface Count {
  got: number;
  of: number;
}

export interface PlaceProgress {
  id: MapId;
  name: string;
  fish: Count;
  birds: Count;
  /** Kinds of fish here that have come up glowing at least once. */
  neon: Count;
}

export interface TierProgress {
  tier: Tier;
  label: string;
  fish: Count;
  birds: Count;
}

/** One line of the records: what, how much, and a word on which. */
export interface Feat {
  label: string;
  value: string;
  note: string;
}

export interface ProgressView {
  /** Every kind of fish and bird, in every place. */
  all: Count;
  places: PlaceProgress[];
  tiers: TierProgress[];
  feats: Feat[];
}

/** A length said the way the catch card says it. */
export function lengthWords(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`;
}

export function progressOf(journal: Journal, birds: Record<string, BirdEntry>, bestShot: number): ProgressView {
  const caught = (id: string) => (journal[id]?.count ?? 0) > 0;
  const shot = (id: string) => (birds[id]?.count ?? 0) > 0;
  const count = <T>(list: T[], has: (x: T) => boolean): Count => ({ got: list.filter(has).length, of: list.length });

  const places = MAP_ORDER.map((id): PlaceProgress => {
    const fish = placeSpecies(id);
    return {
      id,
      name: MAPS[id].name,
      fish: count(fish, (s) => caught(s.id)),
      birds: count(birdsOf(id), (b) => shot(b.id)),
      neon: count(fish, (s) => (journal[s.id]?.neon ?? 0) > 0),
    };
  });

  const tiers = TIERS.map((tier): TierProgress => ({
    tier,
    label: TIER_LABEL[tier],
    fish: count(ALL_SPECIES.filter((s) => s.tier === tier), (s) => caught(s.id)),
    birds: count(BIRDS.filter((b) => b.tier === tier), (b) => shot(b.id)),
  }));

  const feats: Feat[] = [];
  const fishTotal = Object.values(journal).reduce((t, e) => t + (e?.count ?? 0), 0);
  feats.push({ label: 'Fish caught', value: String(fishTotal), note: fishTotal ? `${count(ALL_SPECIES, (s) => caught(s.id)).got} different kinds` : 'none yet' });
  let big: { name: string; m: number } | null = null;
  for (const s of ALL_SPECIES) {
    const m = journal[s.id]?.biggest ?? 0;
    if (m > 0 && (!big || m > big.m)) big = { name: s.name, m };
  }
  feats.push({ label: 'Biggest fish', value: big ? lengthWords(big.m) : '-', note: big ? big.name : 'none yet' });
  let rare: { name: string; tier: Tier } | null = null;
  for (const s of ALL_SPECIES) {
    if (caught(s.id) && (!rare || TIERS.indexOf(s.tier) > TIERS.indexOf(rare.tier))) rare = { name: s.name, tier: s.tier };
  }
  feats.push({ label: 'Rarest catch', value: rare ? TIER_LABEL[rare.tier] : '-', note: rare ? rare.name : 'none yet' });
  const glowing = Object.values(journal).reduce((t, e) => t + (e?.neon ?? 0), 0) + Object.values(birds).reduce((t, e) => t + (e?.neon ?? 0), 0);
  feats.push({ label: 'Glowing ones', value: String(glowing), note: glowing ? 'caught or brought down after dark' : 'they only come out at night' });
  const birdTotal = Object.values(birds).reduce((t, e) => t + (e?.count ?? 0), 0);
  feats.push({ label: 'Birds brought down', value: String(birdTotal), note: birdTotal ? `${count(BIRDS, (b) => shot(b.id)).got} different kinds` : 'none yet' });
  const longest = Math.max(bestShot, ...Object.values(birds).map((e) => e?.longest ?? 0));
  feats.push({ label: 'Longest shot', value: longest > 0 ? `${Math.round(longest)} m` : '-', note: longest > 0 ? 'at a bird in flight' : 'none yet' });

  const fishAll = count(ALL_SPECIES, (s) => caught(s.id));
  const birdAll = count(BIRDS, (b) => shot(b.id));
  return { all: { got: fishAll.got + birdAll.got, of: fishAll.of + birdAll.of }, places, tiers, feats };
}
