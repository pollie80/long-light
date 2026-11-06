import { describe, expect, it } from 'vitest';
import { cleanLook, DEFAULT_LOOK, PICKS, randomLook, SLIDERS } from '../actors/look';
import { buildBody } from '../actors/outfit';
import { mulberry32 } from '../core/noise';
import { nightMagic } from '../core/time';

describe('the wardrobe', () => {
  it('builds every single option without error', () => {
    for (const row of PICKS) {
      for (const c of row.choices) {
        const parts = buildBody({ ...DEFAULT_LOOK, [row.key]: c.id });
        expect(parts.head, `${row.key}=${c.id}`).not.toBeNull();
        expect(parts.torso, `${row.key}=${c.id}`).not.toBeNull();
        expect(parts.upper[0].attributes.position.count).toBeGreaterThan(0);
      }
    }
  });

  it('has silly and sensible choices in every non-colour row that offers silliness', () => {
    for (const row of PICKS) {
      expect(row.choices.some((c) => !c.silly), row.key).toBe(true);
    }
    expect(PICKS.filter((r) => r.choices.some((c) => c.silly)).length).toBeGreaterThan(12);
  });

  it('never lets an old or damaged save break the character', () => {
    expect(cleanLook(undefined)).toEqual(DEFAULT_LOOK);
    const dirty = { hat: 'not-a-hat', height: 99, eyes: 'googly', head: Number.NaN } as never;
    const c = cleanLook(dirty);
    expect(c.hat).toBe(DEFAULT_LOOK.hat);
    expect(c.eyes).toBe('googly');
    expect(c.height).toBe(SLIDERS[0].max);
    expect(c.head).toBe(DEFAULT_LOOK.head);
  });

  it('keeps a sensible surprise sensible', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      const l = randomLook(false, rnd);
      for (const row of PICKS) expect(row.choices.find((c) => c.id === l[row.key])?.silly ?? false, row.key).toBe(false);
      for (const s of SLIDERS) {
        expect(l[s.key]).toBeGreaterThanOrEqual(s.saneMin);
        expect(l[s.key]).toBeLessThanOrEqual(s.saneMax);
      }
    }
  });

  it('makes a silly surprise actually silly', () => {
    const rnd = mulberry32(4);
    const l = randomLook(true, rnd);
    const daft = PICKS.filter((r) => r.choices.find((c) => c.id === l[r.key])?.silly).length;
    expect(daft).toBeGreaterThan(3);
  });
});

describe('the magic', () => {
  it('wakes after dark and sleeps by day', () => {
    expect(nightMagic(23)).toBe(1);
    expect(nightMagic(2)).toBe(1);
    expect(nightMagic(12)).toBe(0);
    expect(nightMagic(18.5)).toBe(0);
    expect(nightMagic(7)).toBe(0);
  });
});
