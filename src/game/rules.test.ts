import { describe, expect, it } from 'vitest';
import { advanceHour, DAY_SECONDS, hoursPerSecond, keyIsMoon, lookAt, moonDir, phaseOf, sunDir, SUNSET } from '../core/time';
import { available, inWindow, pickSpecies, SPECIES, Zone } from './fishdata';
import { BOAT_MOOR, COTTAGE, DECK_Y, groundY, ISLETS, JETTY, MAGIC_SPOTS, onJetty, PATH, PATH_LENGTH, pathPoint, slopeAt } from '../world/land';
import { zoneAt } from './fishing';
import { mulberry32 } from '../core/noise';

describe('the day', () => {
  it('takes about thirty real minutes', () => {
    let secs = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const h = (i + 0.5) * (24 / n);
      secs += (24 / n) / hoursPerSecond(h);
    }
    expect(Math.abs(secs - DAY_SECONDS)).toBeLessThan(5);
  });

  it('spends real time on the sunset', () => {
    let secs = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const h = 18 + (i + 0.5) * (2 / n);
      secs += (2 / n) / hoursPerSecond(h);
    }
    expect(secs).toBeGreaterThan(420);
  });

  it('wraps cleanly at midnight', () => {
    expect(advanceHour(23.999, 10)).toBeGreaterThanOrEqual(0);
    expect(advanceHour(23.999, 10)).toBeLessThan(1);
  });

  it('has the sun down at night and up at noon, setting over the bay', () => {
    expect(sunDir(12.5)[1]).toBeGreaterThan(0.6);
    expect(sunDir(23)[1]).toBeLessThan(0);
    const set = sunDir(SUNSET);
    expect(Math.abs(set[1])).toBeLessThan(0.02);
    expect(set[0]).toBeLessThan(-0.9); // west, over the water
  });

  it('keeps the moon over the bay and above the horizon whenever it is the key light', () => {
    for (let h = 0; h < 24; h += 0.1) {
      if (!keyIsMoon(h)) continue;
      expect(moonDir(h)[1]).toBeGreaterThan(0.05);
      expect(moonDir(h)[0]).toBeLessThan(0);
    }
  });

  it('never hands the light to a sun below the horizon with any strength', () => {
    for (let h = 0; h < 24; h += 0.05) {
      if (keyIsMoon(h)) continue;
      if (sunDir(h)[1] < -0.12) expect(lookAt(h).keyI).toBeLessThan(0.3);
    }
  });

  it('names every hour', () => {
    for (let h = 0; h < 24; h += 0.25) expect(typeof phaseOf(h)).toBe('string');
  });
});

describe('the fish', () => {
  const zones: Zone[] = ['shallows', 'jetty', 'reef', 'deep'];

  it('has something to catch in every zone at every hour', () => {
    for (const z of zones) {
      for (let h = 0; h < 24; h += 0.25) expect(available(z, h).length).toBeGreaterThan(0);
    }
  });

  it('can reach every species', () => {
    const reachable = new Set<string>();
    for (const z of [...zones, 'magic' as Zone]) for (let h = 0; h < 24; h += 0.05) available(z, h).forEach((s) => reachable.add(s.id));
    expect(reachable.size).toBe(SPECIES.length);
  });

  it('handles windows that cross midnight', () => {
    expect(inWindow(23, [20.4, 4.9])).toBe(true);
    expect(inWindow(2, [20.4, 4.9])).toBe(true);
    expect(inWindow(12, [20.4, 4.9])).toBe(false);
  });

  it('keeps the namesake fish to the last minutes of the sun', () => {
    expect(available('deep', 18.5).some((s) => s.id === 'salmon')).toBe(true);
    expect(available('deep', 12).some((s) => s.id === 'salmon')).toBe(false);
    expect(available('deep', 22).some((s) => s.id === 'salmon')).toBe(false);
  });

  it('favours fish you have not met', () => {
    const rnd = mulberry32(5);
    let unseen = 0;
    for (let i = 0; i < 3000; i++) {
      if (pickSpecies('jetty', 12, rnd, (id) => id !== 'mullet').id === 'mullet') unseen++;
    }
    const rnd2 = mulberry32(5);
    let seen = 0;
    for (let i = 0; i < 3000; i++) {
      if (pickSpecies('jetty', 12, rnd2, () => true).id === 'mullet') seen++;
    }
    expect(unseen).toBeGreaterThan(seen);
  });
});

describe('the magic pools', () => {
  it('only count as their own fishing ground after dark', () => {
    const m = MAGIC_SPOTS[0];
    expect(zoneAt(m.x, m.z, 23)).toBe('magic');
    expect(zoneAt(m.x, m.z, 12)).not.toBe('magic');
    expect(zoneAt(m.x + m.r + 5, m.z, 23)).not.toBe('magic');
  });

  it('hold fish found nowhere else, at any hour of the night', () => {
    for (const h of [20, 22, 0, 3, 5]) {
      expect(available('magic', h).length).toBeGreaterThan(0);
      for (const s of available('magic', h)) expect(s.zones).toEqual(['magic']);
    }
    expect(available('magic', 12).length).toBe(0);
  });

  it('sit on open water', () => {
    for (const m of MAGIC_SPOTS) expect(groundY(m.x, m.z)).toBeLessThan(-0.5);
  });
});

describe('the place', () => {
  it('has water under the end of the jetty, deep enough for the boat', () => {
    expect(groundY(JETTY.endX, 0)).toBeLessThan(-1.5);
    expect(groundY(BOAT_MOOR.x, BOAT_MOOR.z)).toBeLessThan(-0.8);
  });

  it('starts the jetty on the beach, at deck height', () => {
    expect(onJetty(JETTY.startX, 0)).toBe(true);
    expect(Math.abs(groundY(JETTY.startX, 0) - DECK_Y)).toBeLessThan(0.45);
  });

  it('has a path gentle enough to stroll from the cottage to the jetty', () => {
    for (const p of PATH) {
      expect(groundY(p.x, p.z)).toBeGreaterThan(0.3);
      expect(slopeAt(p.x, p.z, 0.6)).toBeLessThan(0.75);
    }
    for (let s = 1; s < PATH_LENGTH; s += 1) {
      const a = pathPoint(s - 1);
      const b = pathPoint(s);
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.35);
    }
  });

  it('is a real walk: well over a minute from door to boat at a stroll', () => {
    const toBoat = PATH_LENGTH + (JETTY.startX - BOAT_MOOR.x);
    expect(toBoat / 2.5).toBeGreaterThan(75);
  });

  it('levels the ground for the cottage', () => {
    expect(Math.abs(groundY(COTTAGE.x, COTTAGE.z) - COTTAGE.y)).toBeLessThan(0.1);
  });

  it('keeps every island above water', () => {
    for (const i of ISLETS) expect(groundY(i.x, i.z)).toBeGreaterThan(0.5);
  });

  it('keeps the setting sun clear of the big island', () => {
    const big = ISLETS[1];
    const az = (x: number, z: number) => Math.atan2(z - 0, x - JETTY.endX);
    const sunAz = Math.atan2(sunDir(SUNSET)[2], sunDir(SUNSET)[0]);
    const a = az(big.x, big.z);
    let d = Math.abs(a - sunAz);
    if (d > Math.PI) d = Math.PI * 2 - d;
    expect(d).toBeGreaterThan(0.2);
  });
});
