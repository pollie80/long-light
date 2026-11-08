import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapFromHash, MAP_ORDER, MAPS } from '../world/maps';
import { codeFromHash } from '../net/protocol';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('invite links name the map', () => {
  it('reads it back, and ignores nonsense', () => {
    expect(mapFromHash('#join=abc234&map=canada')).toBe('canada');
    expect(mapFromHash('#map=philippines')).toBe('philippines');
    expect(mapFromHash('#join=abc234')).toBeNull();
    expect(mapFromHash('#map=<script>')).toBeNull();
    expect(mapFromHash('#map=constructor')).toBe(null);
    expect(codeFromHash('#join=abc234&map=canada')).toBe('abc234');
  });
});

describe.each(MAP_ORDER)('the %s map', (id) => {
  const load = async () => {
    vi.resetModules();
    vi.stubGlobal('location', { hash: `#map=${id}` });
    return import('../world/land');
  };

  it('is the one chosen', async () => {
    const maps = await (async () => {
      vi.resetModules();
      vi.stubGlobal('location', { hash: `#map=${id}` });
      return import('../world/maps');
    })();
    expect(maps.MAP.id).toBe(id);
    expect(MAPS[id].name.length).toBeGreaterThan(0);
  });

  it('has water at every boat place, and the jetty is over water', async () => {
    const land = await load();
    for (const s of land.BOAT_SLOTS) expect(land.groundY(s.x, s.z)).toBeLessThan(-0.3);
    expect(land.groundY(-24, 0)).toBeLessThan(-0.3);
  });

  it('has a walkable path the whole way to the jetty', async () => {
    const land = await load();
    for (let i = 1; i < land.PATH.length; i++) {
      const a = land.PATH[i - 1];
      const b = land.PATH[i];
      expect(Math.abs(b.y - a.y) / Math.max(b.s - a.s, 0.01)).toBeLessThan(0.2);
      expect(b.y).toBeGreaterThan(0.2);
    }
  });

  it('keeps magic spots in the water and islands out of it', async () => {
    const land = await load();
    for (const m of land.MAGIC_SPOTS) expect(land.groundY(m.x, m.z)).toBeLessThan(-0.3);
    for (const i of land.ISLETS) expect(land.groundY(i.x, i.z)).toBeGreaterThan(0.5);
  });

  it('has open water to row out into', async () => {
    const land = await load();
    let open = 0;
    for (let x = -40; x > -420; x -= 20) if (land.groundY(x, 0) < -0.3) open += 1;
    expect(open).toBeGreaterThan(10);
  });

  it('never leaves a fish missing, wherever and whenever you cast', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { hash: `#map=${id}` });
    const fish = await import('./fishdata');
    for (const zone of ['shallows', 'jetty', 'reef', 'deep'] as const) {
      for (let h = 0; h < 24; h += 1.5) expect(fish.available(zone, h).length).toBeGreaterThan(0);
    }
  });
});

describe('how rare a fish is', () => {
  it('makes rarer tiers come up much less often, on every map', async () => {
    for (const id of MAP_ORDER) {
      vi.resetModules();
      vi.stubGlobal('location', { hash: `#map=${id}` });
      const fish = await import('./fishdata');
      const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      let seed = 7;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = 0; i < 40000; i++) {
        const zone = (['shallows', 'jetty', 'reef', 'deep'] as const)[i % 4];
        counts[fish.pickSpecies(zone, rnd() * 24, rnd, () => true).tier] += 1;
      }
      expect(counts.common).toBeGreaterThan(counts.uncommon);
      expect(counts.uncommon).toBeGreaterThan(counts.rare);
      expect(counts.rare).toBeGreaterThan(counts.epic);
      expect(counts.epic).toBeGreaterThan(counts.legendary);
      expect(counts.legendary).toBeGreaterThan(0);
      expect(counts.legendary / 40000).toBeLessThan(0.01);
      for (const t of fish.TIERS) expect(fish.SPECIES.some((s) => s.tier === t)).toBe(true);
    }
  });
});

describe('neon fish', () => {
  const share = async (zone: 'magic' | 'deep', hour: number) => {
    vi.resetModules();
    const fish = await import('./fishdata');
    let seed = 11;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let lit = 0;
    for (let i = 0; i < 6000; i++) {
      const c = fish.pickCatch(zone, hour, rnd, () => true);
      if (c.neon || c.pattern === 'glow') lit += 1;
    }
    return lit / 6000;
  };

  it('never come up by day, often at night, nearly always in awake water', async () => {
    expect(await share('deep', 12)).toBe(0);
    const night = await share('deep', 23);
    expect(night).toBeGreaterThan(0.2);
    expect(night).toBeLessThan(0.45);
    expect(await share('magic', 23)).toBeGreaterThan(0.85);
  });

  it('keep the name and rarity of the fish they are', async () => {
    const fish = await import('./fishdata');
    const sp = fish.SPECIES[0];
    const n = fish.neonOf(sp);
    expect(n.id).toBe(sp.id);
    expect(n.tier).toBe(sp.tier);
    expect(n.neon).toBe(true);
    expect(n.glow).toBeTruthy();
  });
});

describe('the journal', () => {
  it('has every fish of every place on at least one page', async () => {
    const fish = await import('./fishdata');
    for (const place of MAP_ORDER) {
      const pages = new Set(fish.BANDS.flatMap((b) => fish.speciesIn(place, b.id).map((s) => s.id)));
      for (const s of fish.placeSpecies(place)) expect(pages.has(s.id), `${place}: ${s.id}`).toBe(true);
      for (const b of fish.BANDS) expect(fish.speciesIn(place, b.id).length, `${place}: ${b.id}`).toBeGreaterThan(0);
    }
  });

  it('opens on the part of the day it is', async () => {
    const fish = await import('./fishdata');
    expect(fish.bandAt(5.5)).toBe('dawn');
    expect(fish.bandAt(12)).toBe('day');
    expect(fish.bandAt(18)).toBe('golden');
    expect(fish.bandAt(23)).toBe('night');
    expect(fish.bandAt(2)).toBe('night');
  });
});
