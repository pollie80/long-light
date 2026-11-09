// The three guns for the birds: what each one does, and how each one is built. Every model is laid along -z
// from where the right hand grips it, so the fisher can hold any of them the same way.
import * as THREE from 'three';
import { Builder, TRS } from '../world/builder';

export type GunKind = 'pistol' | 'rifle' | 'shotgun';
export const GUN_ORDER: GunKind[] = ['pistol', 'rifle', 'shotgun'];

export interface GunSpec {
  kind: GunKind;
  name: string;
  /** Rounds it holds, and seconds to fill it again. */
  magazine: number;
  reload: number;
  /** Seconds before it can fire again: working the bolt, say. */
  cycle: number;
  /** How far a shot can still drop a bird, in metres. */
  reach: number;
  /** How far off the line of the shot a bird can be and still be hit, at a given distance. */
  spread: (along: number) => number;
  /** How hard the view jumps. */
  kick: number;
  /** Held to the shoulder rather than out in both hands. */
  long: boolean;
  /** From the grip to the muzzle, and the muzzle's height above the grip. */
  length: number;
  muzzleUp: number;
  scope: boolean;
}

export const GUNS: Record<GunKind, GunSpec> = {
  // A Desert Eagle in .50 holds seven.
  pistol: { kind: 'pistol', name: 'Desert Eagle', magazine: 7, reload: 1.7, cycle: 0.12, reach: 110, spread: (a) => 0.5 + a * 0.016, kick: 0.036, long: false, length: 0.3, muzzleUp: 0.066, scope: false },
  // A bolt-action with a scope: slow to work, and very far and very exact.
  rifle: { kind: 'rifle', name: 'Hunting rifle', magazine: 5, reload: 2.6, cycle: 0.95, reach: 260, spread: (a) => 0.32 + a * 0.004, kick: 0.05, long: true, length: 0.72, muzzleUp: 0.035, scope: true },
  // Two barrels of birdshot: close, wide, and often more than one.
  shotgun: { kind: 'shotgun', name: 'Double-barrel shotgun', magazine: 2, reload: 2.1, cycle: 0.22, reach: 50, spread: (a) => 1.0 + a * 0.075, kick: 0.08, long: true, length: 0.68, muzzleUp: 0.03, scope: false },
};

export interface GunFinish {
  metal: number;
  dark: number;
  grip: number;
  wood: number;
  /** A bright tip, for the toy. */
  tip?: number;
}

export const FINISHES: Record<string, GunFinish> = {
  steel: { metal: 0xa8acb2, dark: 0x45474c, grip: 0x1e1e22, wood: 0x7a4a26 },
  black: { metal: 0x404247, dark: 0x1e1f22, grip: 0x17171a, wood: 0x2c2724 },
  walnut: { metal: 0x5c6068, dark: 0x2a2c31, grip: 0x5e3418, wood: 0x6a3a1a },
  gold: { metal: 0xd9aa3a, dark: 0x9c7420, grip: 0xece2cc, wood: 0xece2cc },
  pink: { metal: 0xf08cc0, dark: 0xcf5a98, grip: 0xfdf3f8, wood: 0xf6b6d6 },
  toy: { metal: 0x2f7be0, dark: 0xf0c020, grip: 0xf07a20, wood: 0x2f7be0, tip: 0xff6a1a },
};

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** The model for one gun in one finish. */
export function buildGun(kind: GunKind, finishId: string): THREE.BufferGeometry {
  const f = FINISHES[finishId] ?? FINISHES.steel;
  const g = new Builder(61);
  const BLACK = 0x18181a;
  const guard = () => g.add(new THREE.TorusGeometry(0.026, 0.0045, 6, 12), shade(f.dark, 0.85), TRS(0, -0.012, -0.056, 0, Math.PI / 2, 0));
  if (kind === 'pistol') {
    // A big, square, polished semi-automatic: long slide, deep muzzle, chunky grip.
    g.box(0.042, 0.055, 0.29, f.metal, TRS(0, 0.062, -0.1), { jit: 0.03 }, 0.006);
    g.box(0.038, 0.012, 0.22, shade(f.metal, 0.74), TRS(0, 0.096, -0.11), {}, 0.003);
    g.box(0.044, 0.062, 0.05, shade(f.metal, 0.84), TRS(0, 0.058, -0.235), {}, 0.006);
    g.cyl(0.0085, 0.0085, 0.006, f.tip ?? 0x101012, TRS(0, 0.066, -0.262, Math.PI / 2, 0, 0), {}, 8);
    g.box(0.04, 0.03, 0.2, f.dark, TRS(0, 0.018, -0.1), {}, 0.005);
    g.box(0.038, 0.13, 0.058, f.grip, TRS(0, -0.052, 0.012, -0.22, 0, 0), { jit: 0.05 }, 0.012);
    guard();
    g.box(0.008, 0.03, 0.008, BLACK, TRS(0, -0.01, -0.052, 0.3, 0, 0), {}, 0.002);
    g.box(0.012, 0.014, 0.012, BLACK, TRS(0, 0.098, -0.232), {}, 0.002);
    g.box(0.03, 0.014, 0.014, BLACK, TRS(0, 0.098, 0.03), {}, 0.003);
    g.box(0.014, 0.02, 0.016, shade(f.dark, 0.85), TRS(0, 0.086, 0.052, -0.4, 0, 0), {}, 0.003);
  } else if (kind === 'rifle') {
    // Walnut stock, blued barrel, a long scope on two rings, and the bolt handle on the right.
    g.box(0.044, 0.105, 0.3, f.wood, TRS(0, -0.035, 0.19, 0.07, 0, 0), { jit: 0.05 }, 0.012);
    g.box(0.05, 0.12, 0.022, BLACK, TRS(0, -0.045, 0.345, 0.07, 0, 0), {}, 0.006);
    g.box(0.04, 0.07, 0.1, f.wood, TRS(0, -0.012, 0.035, -0.3, 0, 0), { jit: 0.05 }, 0.01);
    g.box(0.048, 0.048, 0.36, f.wood, TRS(0, 0.004, -0.25), { jit: 0.04 }, 0.01);
    g.box(0.038, 0.042, 0.2, f.metal, TRS(0, 0.032, -0.045), {}, 0.006);
    g.cyl(0.0105, 0.0125, 0.5, f.dark, TRS(0, 0.035, -0.47, Math.PI / 2, 0, 0), {}, 10);
    g.cyl(0.011, 0.011, 0.012, f.tip ?? 0x101012, TRS(0, 0.035, -0.722, Math.PI / 2, 0, 0), {}, 10);
    g.cyl(0.0055, 0.0055, 0.06, f.metal, TRS(0.034, 0.036, 0.035, 0, 0, Math.PI / 2), {}, 6);
    g.sphere(0.011, f.metal, TRS(0.066, 0.034, 0.035), {}, 8, 6);
    g.cyl(0.0175, 0.0175, 0.24, f.dark, TRS(0, 0.098, -0.07, Math.PI / 2, 0, 0), {}, 12);
    g.cyl(0.024, 0.0185, 0.06, f.dark, TRS(0, 0.098, -0.215, Math.PI / 2, 0, 0), {}, 12);
    g.cyl(0.021, 0.021, 0.05, f.dark, TRS(0, 0.098, 0.07, Math.PI / 2, 0, 0), {}, 12);
    g.cyl(0.0175, 0.0175, 0.004, 0x3a6a8a, TRS(0, 0.098, -0.247, Math.PI / 2, 0, 0), { emis: 0.15 }, 12);
    g.box(0.012, 0.034, 0.016, f.dark, TRS(0, 0.068, -0.13), {}, 0.003);
    g.box(0.012, 0.034, 0.016, f.dark, TRS(0, 0.068, 0.005), {}, 0.003);
    guard();
    g.box(0.007, 0.028, 0.007, BLACK, TRS(0, -0.012, -0.05, 0.3, 0, 0), {}, 0.002);
  } else {
    // Side-by-side barrels on a plain action, a short fore-end, a bead at the muzzle.
    g.box(0.044, 0.105, 0.3, f.wood, TRS(0, -0.035, 0.19, 0.06, 0, 0), { jit: 0.05 }, 0.012);
    g.box(0.05, 0.118, 0.02, BLACK, TRS(0, -0.044, 0.345, 0.06, 0, 0), {}, 0.006);
    g.box(0.04, 0.064, 0.1, f.wood, TRS(0, -0.012, 0.035, -0.26, 0, 0), { jit: 0.05 }, 0.01);
    g.box(0.052, 0.058, 0.09, f.metal, TRS(0, 0.014, -0.04), { jit: 0.03 }, 0.008);
    for (const side of [-1, 1]) {
      g.cyl(0.0125, 0.0125, 0.6, f.dark, TRS(side * 0.0128, 0.03, -0.385, Math.PI / 2, 0, 0), {}, 10);
      g.cyl(0.0085, 0.0085, 0.006, f.tip ?? 0x0c0c0e, TRS(side * 0.0128, 0.03, -0.686, Math.PI / 2, 0, 0), {}, 8);
    }
    g.box(0.006, 0.005, 0.58, f.metal, TRS(0, 0.045, -0.39), {}, 0.002);
    g.sphere(0.0042, 0xf0e6c0, TRS(0, 0.049, -0.672), { emis: 0.1 }, 6, 4);
    g.box(0.046, 0.036, 0.22, f.wood, TRS(0, 0.004, -0.2), { jit: 0.04 }, 0.01);
    g.box(0.03, 0.012, 0.03, f.metal, TRS(0, 0.05, 0.0, -0.5, 0, 0), {}, 0.003);
    guard();
    g.box(0.007, 0.028, 0.007, BLACK, TRS(0, -0.012, -0.046, 0.3, 0, 0), {}, 0.002);
    g.box(0.007, 0.028, 0.007, BLACK, TRS(0, -0.012, -0.066, 0.3, 0, 0), {}, 0.002);
  }
  return g.build();
}
