// What's kept between visits, in the browser's storage: the journal, the settings and the look.
import type { CharacterLook } from '../actors/look';
import type { Journal } from '../ui/ui';
import { BirdEntry, BIRDS } from './birddata';
import { Difficulty, isDifficulty } from './difficulty';

export const SAVE_KEY = 'longlight.save.v1';

export interface Save { journal: Journal; music: number; sfx: number; sensitivity: number; muteAway: boolean; name: string; walkSpeed: number; rowSpeed: number; fpsCap: number; resolution: number; quietAway: boolean; adapt: boolean; showFps: boolean; birds: Record<string, number>; bestShot: number; look?: Partial<CharacterLook>; birdLog: Record<string, BirdEntry>; weather: boolean; difficulty: Difficulty }

export function loadSave(): Save {
  const d: Save = { journal: {}, music: 0.7, sfx: 0.9, sensitivity: 1, muteAway: true, name: '', walkSpeed: 1, rowSpeed: 1, fpsCap: 60, resolution: 0, quietAway: true, adapt: true, showFps: false, birds: {}, bestShot: 0, birdLog: {}, weather: false, difficulty: 'relaxed' };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s: Save = { ...d, ...JSON.parse(raw) };
      if (!isDifficulty(s.difficulty)) s.difficulty = 'relaxed';
      // Birds brought down before the journal had a page for them.
      for (const [name, count] of Object.entries(s.birds ?? {})) {
        const b = BIRDS.find((x) => x.name === name);
        if (b && !s.birdLog[b.id]) s.birdLog[b.id] = { count, longest: 0, firstHour: 12 };
      }
      return s;
    }
  } catch {
    /* A private window has no storage. The game simply starts fresh. */
  }
  return d;
}
