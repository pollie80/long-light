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
