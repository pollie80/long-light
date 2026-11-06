import { describe, expect, it } from 'vitest';
import { Beer, BeerEvent, SIPS_PER_BOTTLE } from './beer';

function run(b: Beer, seconds: number): BeerEvent[] {
  const out: BeerEvent[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...b.update(0.05));
  return out;
}

describe('a beer', () => {
  it('opens once, then sips', () => {
    const b = new Beer();
    expect(b.press()).toBe(true);
    const ev = run(b, 4);
    expect(ev.filter((e) => e === 'open').length).toBe(1);
    expect(ev).toContain('sip');
    expect(ev).toContain('ah');
    expect(b.sips).toBe(SIPS_PER_BOTTLE - 1);
    expect(b.phase).toBe('held');
    expect(b.lift).toBe(0);
    expect(b.out).toBe(1);
  });

  it('ignores presses while the hand is moving', () => {
    const b = new Beer();
    b.press();
    run(b, 1);
    expect(b.phase).toBe('raising');
    expect(b.press()).toBe(false);
  });

  it('is finished after the last sip and goes back in the basket', () => {
    const b = new Beer();
    const ev: BeerEvent[] = [];
    b.press();
    ev.push(...run(b, 4));
    for (let i = 1; i < SIPS_PER_BOTTLE; i++) {
      expect(b.press()).toBe(true);
      ev.push(...run(b, 3.5));
    }
    ev.push(...run(b, 1));
    expect(ev).toContain('empty');
    expect(ev.filter((e) => e === 'sip').length).toBe(SIPS_PER_BOTTLE);
    expect(b.phase).toBe('away');
    expect(b.sips).toBe(0);
  });

  it('opens a fresh bottle after an empty one', () => {
    const b = new Beer();
    b.press();
    run(b, 4);
    for (let i = 1; i < SIPS_PER_BOTTLE; i++) {
      b.press();
      run(b, 3.5);
    }
    run(b, 1);
    b.press();
    expect(run(b, 4)).toContain('open');
    expect(b.sips).toBe(SIPS_PER_BOTTLE - 1);
  });

  it('keeps a part-drunk bottle, with no second pop', () => {
    const b = new Beer();
    b.press();
    run(b, 4);
    b.putAway();
    run(b, 1);
    expect(b.phase).toBe('away');
    expect(b.sips).toBe(SIPS_PER_BOTTLE - 1);
    b.press();
    expect(run(b, 4)).not.toContain('open');
  });

  it('stows by itself if left idle', () => {
    const b = new Beer();
    b.press();
    run(b, 4);
    run(b, 10);
    expect(b.phase).toBe('away');
  });

  it('can be put away from mid-sip, with the arm coming down', () => {
    const b = new Beer();
    b.press();
    run(b, 2);
    expect(b.lift).toBeGreaterThan(0.9);
    b.putAway();
    run(b, 1);
    expect(b.phase).toBe('away');
    expect(b.lift).toBe(0);
    expect(b.out).toBe(0);
  });
});
