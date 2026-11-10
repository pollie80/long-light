import { describe, expect, it } from 'vitest';
import { lengthWords, progressOf } from './progress';
import { ALL_SPECIES, placeSpecies } from './fishdata';
import { BIRDS, birdsOf } from './birddata';

describe('the progress page', () => {
  it('starts from nothing', () => {
    const v = progressOf({}, {}, 0);
    expect(v.all.got).toBe(0);
    expect(v.all.of).toBe(ALL_SPECIES.length + BIRDS.length);
    expect(v.places.map((p) => p.id)).toEqual(['cove', 'philippines', 'canada']);
    for (const p of v.places) {
      expect(p.fish).toEqual({ got: 0, of: placeSpecies(p.id).length });
      expect(p.birds).toEqual({ got: 0, of: birdsOf(p.id).length });
    }
    expect(v.tiers.reduce((t, x) => t + x.fish.of, 0)).toBe(ALL_SPECIES.length);
    expect(v.feats.find((f) => f.label === 'Fish caught')!.value).toBe('0');
  });

  it('counts catches, the biggest, the rarest, glowing ones and the longest shot', () => {
    const common = ALL_SPECIES.find((s) => s.tier === 'common')!;
    const epic = ALL_SPECIES.find((s) => s.tier === 'epic')!;
    const bird = BIRDS[0];
    const v = progressOf(
      { [common.id]: { count: 3, firstHour: 10, biggest: 0.42, neon: 1 }, [epic.id]: { count: 1, firstHour: 22, biggest: 1.3 } },
      { [bird.id]: { count: 2, longest: 61.4, firstHour: 9 } },
      48,
    );
    expect(v.all.got).toBe(3);
    const feat = (l: string) => v.feats.find((f) => f.label === l)!;
    expect(feat('Fish caught').value).toBe('4');
    expect(feat('Biggest fish')).toMatchObject({ value: '1.30 m', note: epic.name });
    expect(feat('Rarest catch')).toMatchObject({ value: 'Epic', note: epic.name });
    expect(feat('Glowing ones').value).toBe('1');
    expect(feat('Birds brought down').value).toBe('2');
    expect(feat('Longest shot').value).toBe('61 m');
    expect(v.tiers.find((t) => t.tier === 'epic')!.fish.got).toBe(1);
    expect(lengthWords(0.42)).toBe('42 cm');
  });
});
