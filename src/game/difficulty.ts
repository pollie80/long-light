// Three ways to play. Relaxed is the game as it always was; Easy smooths it further; Challenging asks for timing:
// a cast that swings to and fro with a sweet spot, a strike that has to be quick and not too soon, and a line that
// can snap if you reel against a running fish.
export type Difficulty = 'easy' | 'relaxed' | 'challenging';

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'relaxed', 'challenging'];

export interface DifficultyRules {
  label: string;
  /** Said once when the mode is picked. */
  blurb: string;
  /** Multiplies the wait for a bite. */
  waitScale: number;
  /** A bite left alone hooks itself. */
  autoHook: boolean;
  /** Seconds to answer a bite before it slips away. */
  biteWindow: number;
  /** Multiplies how long a fish takes to reel in. */
  fightScale: number;
  /** How much line a fish takes back while you're not reeling, as a share of reeling speed. */
  slack: number;
  /** The cast power swings up and back down, and letting go in the sweet spot casts further and brings a bite sooner. */
  castSweet: boolean;
  /** The line has a strain that builds against runs and leaps, and snaps at the top. */
  tension: boolean;
  /** Striking before a real bite scares the fish off. */
  earlySpooks: boolean;
  /** Multiplies how far shots stray. */
  aimSpread: number;
  /** Multiplies how fast birds fly. */
  birdSpeed: number;
  /** Multiplies how long hard rowing lasts. */
  sprintScale: number;
}

export const RULES: Record<Difficulty, DifficultyRules> = {
  easy: {
    label: 'Easy', blurb: 'quicker bites, fish hook themselves, a steadier aim.',
    waitScale: 0.4, autoHook: true, biteWindow: 9, fightScale: 0.6, slack: 0,
    castSweet: false, tension: false, earlySpooks: false, aimSpread: 0.6, birdSpeed: 0.85, sprintScale: 1.5,
  },
  relaxed: {
    label: 'Relaxed', blurb: 'the game as it always was.',
    waitScale: 1, autoHook: false, biteWindow: 9, fightScale: 1, slack: 0.1,
    castSweet: false, tension: false, earlySpooks: false, aimSpread: 1, birdSpeed: 1, sprintScale: 1,
  },
  challenging: {
    label: 'Challenging', blurb: 'time the cast, strike quick but not too soon, and mind the line.',
    waitScale: 1, autoHook: false, biteWindow: 1.4, fightScale: 1, slack: 0.35,
    castSweet: true, tension: true, earlySpooks: true, aimSpread: 1.25, birdSpeed: 1.2, sprintScale: 0.75,
  },
};

/** Half the width of the cast's sweet spot, as a share of full power. */
export const SWEET_HALF = 0.06;

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTY_ORDER as string[]).includes(v);
}
