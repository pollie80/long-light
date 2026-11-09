// The cast, the wait, the small tug, the slow reel. Nothing here can fail.
import * as THREE from 'three';
import { groundY, ISLETS, JETTY, MAGIC_SPOTS, swellAt } from '../world/land';
import { Builder, solid, TRS } from '../world/builder';
import { paintedMaterial } from '../render/shared';
import { damp, mulberry32 } from '../core/noise';
import { nightMagic } from '../core/time';
import { pickCatch, Species, Zone } from './fishdata';
import { disposeFish, fishModel } from './fishart';
import type { Water } from '../world/water';
import type { AudioWorld } from '../audio/audio';
import { CharacterLook, choiceOf } from '../actors/look';
import { DifficultyRules, RULES, SWEET_HALF } from './difficulty';

export type FishState = 'idle' | 'charge' | 'flight' | 'wait' | 'bite' | 'reel' | 'landed' | 'released';

export function zoneAt(x: number, z: number, hour = 12): Zone {
  if (nightMagic(hour) > 0.5) {
    for (const m of MAGIC_SPOTS) if (Math.hypot(x - m.x, z - m.z) < m.r) return 'magic';
  }
  for (const i of ISLETS) if (Math.hypot(x - i.x, z - i.z) < i.r * 2.3) return 'reef';
  if (x > JETTY.endX - 10 && x < JETTY.startX && Math.abs(z) < 13) return 'jetty';
  return groundY(x, z) > -3.4 ? 'shallows' : 'deep';
}

/** The float, in any of the styles the wardrobe offers. Its origin sits at the waterline. */
function bobberGeo(style: string): THREE.BufferGeometry {
  const b = new Builder(121);
  switch (style) {
    case 'cork':
      b.sphere(0.058, 0xc89a64, TRS(0, 0.04, 0, 0, 0, 0, 1, 1.5, 1), { jit: 0.12 }, 10, 8);
      b.cyl(0.006, 0.01, 0.15, 0xc23a2c, TRS(0, 0.17, 0), {}, 5);
      b.cyl(0.004, 0.006, 0.1, 0x6a4a2a, TRS(0, -0.07, 0), {}, 5);
      break;
    case 'quill':
      b.cyl(0.008, 0.013, 0.34, 0xeee8d8, TRS(0, 0.06, 0), {}, 6);
      b.cyl(0.0088, 0.0088, 0.05, 0x1a1a1a, TRS(0, 0.0, 0), {}, 6);
      b.cyl(0.004, 0.008, 0.06, 0xd8342a, TRS(0, 0.25, 0), {}, 6);
      break;
    case 'yellow':
      b.sphere(0.075, 0x1d1d20, TRS(0, 0.02, 0), {}, 10, 8);
      b.sphere(0.078, 0xf0c41c, TRS(0, 0.06, 0, 0, 0, 0, 1, 0.65, 1), {}, 10, 6);
      b.cyl(0.008, 0.012, 0.2, 0xf0c41c, TRS(0, 0.17, 0), {}, 5);
      break;
    case 'glow':
      // The kind with a light stick in the top, for fishing after dark.
      b.sphere(0.075, 0x2a2c30, TRS(0, 0.02, 0), {}, 10, 8);
      b.sphere(0.078, 0x7dff9a, TRS(0, 0.06, 0, 0, 0, 0, 1, 0.65, 1), { emis: 0.85 }, 10, 6);
      b.cyl(0.009, 0.013, 0.22, 0xa6ffbc, TRS(0, 0.18, 0), { emis: 1 }, 5);
      break;
    case 'duck':
      b.sphere(0.085, 0xf2c81c, TRS(0, 0.03, 0.01, 0, 0, 0, 1, 0.72, 1.25), {}, 12, 8);
      b.sphere(0.052, 0xf2c81c, TRS(0, 0.115, -0.055), {}, 10, 8);
      b.box(0.042, 0.016, 0.05, 0xf07a1c, TRS(0, 0.105, -0.11), {}, 0.007);
      b.sphere(0.009, 0x111111, TRS(0.032, 0.13, -0.085), {}, 6, 4);
      b.sphere(0.009, 0x111111, TRS(-0.032, 0.13, -0.085), {}, 6, 4);
      b.box(0.03, 0.04, 0.05, 0xf2c81c, TRS(0, 0.07, 0.1, 0.6, 0, 0), {}, 0.012);
      break;
    case 'donut':
      b.add(new THREE.TorusGeometry(0.07, 0.036, 8, 18), 0xd29a5a, TRS(0, 0.02, 0, Math.PI / 2, 0, 0));
      b.add(new THREE.TorusGeometry(0.07, 0.031, 8, 18), 0xf07ab4, TRS(0, 0.036, 0, Math.PI / 2, 0, 0, 1, 1, 0.85));
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        b.box(0.016, 0.006, 0.006, [0xf4f0e0, 0x5ac8f0, 0xf0d040][i % 3], TRS(Math.cos(a) * 0.07, 0.064, Math.sin(a) * 0.07, 0, a * 1.7, 0), {}, 0.002);
      }
      break;
    case 'eyeball':
      b.sphere(0.08, 0xf4f0e8, TRS(0, 0.03, 0), {}, 12, 10);
      b.sphere(0.04, 0x3a7ad0, TRS(0, 0.062, -0.042), {}, 10, 8);
      b.sphere(0.02, 0x0c0c0e, TRS(0, 0.075, -0.06), {}, 8, 6);
      break;
    case 'skull':
      b.sphere(0.07, 0xece6d4, TRS(0, 0.065, 0), {}, 10, 8);
      b.box(0.08, 0.045, 0.07, 0xece6d4, TRS(0, 0.005, -0.02), {}, 0.015);
      b.sphere(0.019, 0x141414, TRS(0.027, 0.062, -0.056), {}, 6, 4);
      b.sphere(0.019, 0x141414, TRS(-0.027, 0.062, -0.056), {}, 6, 4);
      b.box(0.012, 0.016, 0.01, 0x141414, TRS(0, 0.032, -0.07), {}, 0.002);
      break;
    case 'boot':
      b.box(0.08, 0.15, 0.09, 0x4a3424, TRS(0, 0.06, 0.03), { jit: 0.12 }, 0.02);
      b.box(0.085, 0.06, 0.17, 0x3e2c1e, TRS(0, -0.005, -0.03), { jit: 0.12 }, 0.02);
      b.box(0.09, 0.016, 0.18, 0x221812, TRS(0, -0.04, -0.03), {}, 0.005);
      break;
    default:
      b.sphere(0.075, 0xe6dccb, TRS(0, 0.02, 0), {}, 10, 8);
      b.sphere(0.078, 0xc23a2c, TRS(0, 0.06, 0, 0, 0, 0, 1, 0.65, 1), {}, 10, 6);
      b.cyl(0.008, 0.012, 0.2, 0xc23a2c, TRS(0, 0.17, 0), {}, 5);
  }
  return b.build();
}

export function makeBobber(style = 'classic'): THREE.Group {
  const g = new THREE.Group();
  g.add(solid(bobberGeo(style), paintedMaterial(), false));
  g.userData.style = style;
  return g;
}

/** Swaps the float for another style, in place. */
export function setBobberStyle(g: THREE.Group, style: string) {
  if (g.userData.style === style) return;
  const m = g.children[0] as THREE.Mesh;
  m.geometry.dispose();
  m.geometry = bobberGeo(style);
  g.userData.style = style;
}

/** The line in the colour picked for it. Each line has its own copy of the material. */
export function setLineColour(mat: THREE.Material, id: string) {
  const u = (mat as THREE.ShaderMaterial).uniforms;
  if (!u?.uCol) return;
  u.uCol.value.setHex(choiceOf('line', id).color ?? 0xf4eedb, THREE.LinearSRGBColorSpace);
  u.uA.value = id === 'clear' ? 0.62 : 0.86;
}

export class Fishing {
  state: FishState = 'idle';
  charge = 0;
  lure = new THREE.Vector3();
  private lureFrom = new THREE.Vector3();
  private lureTo = new THREE.Vector3();
  private flightT = 0;
  private flightDur = 1;
  /** Seconds until a bite, and until the next nibble. The fish in the water set these when one is coming. */
  waitT = 0;
  nibbleT = 0;
  /** The fish already on its way to the bobber, which is the one that will bite, and how long it is. */
  preset: Species | null = null;
  presetSize = 0;
  /** How long the fish on the line is, in metres. */
  size = 0;
  private biteT = 0;
  private dip = 0;
  private dipV = 0;
  species: Species | null = null;
  private fishDist = 0;
  private fightT = 0;
  private fightDur = 8;
  private fishAng = 0;
  bobber: THREE.Group;
  /** Thin line drawn on top of the paint, in the late pass. */
  line: THREE.Line;
  private linePos: Float32Array;
  private model: THREE.Group | null = null;
  private modelSwing = 0;
  private rnd = mulberry32(Date.now() & 0xffff);
  reelSpin = 0;
  private clickAcc = 0;
  private releaseT = 0;
  landedSize = 0;
  private scene: THREE.Object3D;
  onLanded: ((s: Species, size: number) => void) | null = null;
  onSlip: (() => void) | null = null;
  onBite: (() => void) | null = null;
  /** Hooked, and whether it was answered smartly. */
  onHook: ((strike: boolean) => void) | null = null;
  /** Let go and back in the water, here, heading this way. */
  onFreed: ((s: Species, x: number, z: number, heading: number, size: number) => void) | null = null;
  /** Answered within a moment of the bite: a better hook, and often a better fish. */
  strike = false;
  private biteAge = 0;
  /** A fish on the line leaps clear now and then. -1 while it's under. */
  private leapK = -1;
  private leapT = 0;
  private leaps = 0;
  private freeFrom = new THREE.Vector3();
  private freeTo = new THREE.Vector3();
  private rodBaseSeen = new THREE.Vector3();
  private previewing = false;
  seen: (id: string) => boolean = () => false;
  /** How the fishing plays: Easy, Relaxed or Challenging. */
  rules: DifficultyRules = RULES.relaxed;
  /** Challenging: the cast power swings to and fro, and this is where its sweet spot sits. */
  sweetAt = 0.7;
  private chargeDir = 1;
  /** The last cast was let go in the sweet spot. */
  perfect = false;
  /** How hard the line is pulling, 0 to 1. At 1 it snaps. Challenging only. */
  tension = 0;
  /** Seconds left of the fish's run, when it pulls line off the reel, and until the next one. */
  runT = 0;
  runGap = 0;
  /** Counts fish scared off by a strike at nothing, so the one in the water can bolt. */
  spooks = 0;
  onCast: ((perfect: boolean) => void) | null = null;
  onSpook: (() => void) | null = null;
  onSnap: (() => void) | null = null;

  constructor(scene: THREE.Object3D, lineMat: THREE.Material) {
    this.scene = scene;
    this.bobber = makeBobber();
    this.bobber.visible = false;
    scene.add(this.bobber);

    const N = 26;
    this.linePos = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(g, lineMat.clone());
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  /** The float and line the wardrobe picked. */
  setGear(look: CharacterLook) {
    setBobberStyle(this.bobber, look.bobber);
    setLineColour(this.line.material as THREE.Material, look.line);
  }

  /** In front of the mirror: the float hangs from the rod tip, so it can be seen. */
  preview(on: boolean, tip: THREE.Vector3, t: number) {
    if (this.state !== 'idle') return;
    if (!on) {
      if (this.previewing) {
        this.bobber.visible = false;
        this.line.visible = false;
        this.previewing = false;
      }
      return;
    }
    this.previewing = true;
    this.bobber.visible = true;
    this.line.visible = true;
    this.bobber.position.set(tip.x + Math.sin(t * 1.3) * 0.02, tip.y - 0.62, tip.z + Math.cos(t * 1.1) * 0.02);
    this.bobber.rotation.set(0, t * 0.4, 0);
    const N = this.linePos.length / 3;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      this.linePos[i * 3] = tip.x + (this.bobber.position.x - tip.x) * k;
      this.linePos[i * 3 + 1] = tip.y + (this.bobber.position.y + 0.2 - tip.y) * k;
      this.linePos[i * 3 + 2] = tip.z + (this.bobber.position.z - tip.z) * k;
    }
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Seconds to the next bite, from a random number 0 to 1. */
  static biteWait(r: number): number {
    return 5 + 115 * Math.pow(r, 1.7);
  }

  /** The next wait, for this mode and this cast. */
  private nextWait(): number {
    return Fishing.biteWait(this.rnd()) * this.rules.waitScale * (this.perfect ? 0.6 : 1);
  }

  get active(): boolean {
    return this.state !== 'idle';
  }

  private clearModel() {
    if (this.model) {
      disposeFish(this.model);
      this.model = null;
    }
  }

  beginCharge() {
    this.previewing = false;
    this.state = 'charge';
    this.charge = 0;
    this.chargeDir = 1;
    this.sweetAt = 0.5 + this.rnd() * 0.38;
  }

  /** Release the cast. Lands `range` metres out along `dir`, on the water. */
  release(from: THREE.Vector3, dir: THREE.Vector3, audio: AudioWorld) {
    this.perfect = this.rules.castSweet && Math.abs(this.charge - this.sweetAt) <= SWEET_HALF;
    const range = (6 + this.charge * 24) * (this.perfect ? 1.12 : 1);
    this.lureFrom.copy(from);
    this.lureTo.set(from.x + dir.x * range, 0, from.z + dir.z * range);
    // Pull in short of land, so a cast never rests on the grass.
    for (let i = 0; i < 12 && groundY(this.lureTo.x, this.lureTo.z) > -0.4; i++) {
      this.lureTo.x -= dir.x * 2.2;
      this.lureTo.z -= dir.z * 2.2;
    }
    this.flightT = 0;
    this.flightDur = 0.5 + range * 0.03;
    this.state = 'flight';
    this.bobber.visible = true;
    this.line.visible = true;
    audio.castWhoosh(this.charge);
    this.onCast?.(this.perfect);
  }

  reelIn() {
    this.state = 'idle';
    this.preset = null;
    this.presetSize = 0;
    this.bobber.visible = false;
    this.line.visible = false;
    this.clearModel();
  }

  private splashAt(water: Water, audio: AudioWorld, size: number) {
    water.splash(this.lure.x, this.lure.z, 0.45 + size * 0.6, 0.1 + size * 0.2);
    audio.splash(size);
  }

  update(dt: number, t: number, hour: number, actionHeld: boolean, actionPressed: boolean, rodBase: THREE.Vector3, rodTip: THREE.Vector3, water: Water, audio: AudioWorld) {
    const swell = swellAt(this.lure.x, this.lure.z, t);
    switch (this.state) {
      case 'charge':
        if (this.rules.castSweet) {
          // Up and back down again: let go at the right moment.
          this.charge += dt * 0.95 * this.chargeDir;
          if (this.charge >= 1) {
            this.charge = 1;
            this.chargeDir = -1;
          } else if (this.charge <= 0) {
            this.charge = 0;
            this.chargeDir = 1;
          }
        } else {
          this.charge = Math.min(1, this.charge + dt * 0.62);
        }
        break;
      case 'flight': {
        this.flightT += dt;
        const k = Math.min(1, this.flightT / this.flightDur);
        const h = 4 * k * (1 - k) * (2.2 + this.flightDur * 2.8);
        this.lure.lerpVectors(this.lureFrom, this.lureTo, k);
        this.lure.y = THREE.MathUtils.lerp(this.lureFrom.y, 0, k) + h;
        if (k >= 1) {
          this.lure.y = 0;
          this.splashAt(water, audio, 0.25);
          this.state = 'wait';
          // A patient wait: as little as five seconds, as long as two minutes, most often under one.
          this.waitT = this.nextWait();
          this.nibbleT = 2.5 + this.rnd() * 4;
        }
        break;
      }
      case 'wait': {
        if (this.rules.earlySpooks && actionPressed) {
          // Struck at a nibble: whatever was coming is gone, and the next one is a while off.
          this.spooks += 1;
          this.waitT = this.nextWait() + 6;
          this.nibbleT = 3;
          this.preset = null;
          this.presetSize = 0;
          this.dipV = -1.2;
          water.splash(this.lure.x, this.lure.z, 0.3, 0.06);
          this.onSpook?.();
        }
        this.waitT -= dt;
        this.nibbleT -= dt;
        if (this.nibbleT <= 0 && this.waitT > 1.5) {
          this.nibbleT = 2 + this.rnd() * 5;
          this.dipV = -0.5 - this.rnd() * 0.5;
          water.splash(this.lure.x, this.lure.z, 0.22, 0.03);
        }
        if (this.waitT <= 0) {
          this.state = 'bite';
          this.biteT = this.rules.biteWindow;
          this.biteAge = 0;
          this.species = this.preset ?? pickCatch(zoneAt(this.lure.x, this.lure.z, hour), hour, this.rnd, this.seen);
          this.size = this.preset && this.presetSize > 0 ? this.presetSize : this.species.length * (0.82 + this.rnd() * 0.42);
          this.preset = null;
          this.presetSize = 0;
          this.dipV = -3.4;
          this.splashAt(water, audio, 0.4);
          audio.bite();
          this.onBite?.();
        }
        break;
      }
      case 'bite': {
        this.biteT -= dt;
        this.biteAge += dt;
        // Repeated tugs until answered.
        if (Math.sin(t * 7) > 0.92) {
          this.dipV = -1.7;
          water.splash(this.lure.x, this.lure.z, 0.3, 0.05);
        }
        if (actionPressed || (this.rules.autoHook && this.biteAge > 0.5)) {
          this.state = 'reel';
          this.strike = this.biteAge < 0.8;
          this.onHook?.(this.strike);
          this.leapK = -1;
          this.leaps = 0;
          this.leapT = 1.6 + this.rnd() * 2.4;
          this.fightT = 0;
          // Well hooked, it comes in quicker.
          this.fightDur = (this.species?.fight ?? 7) * (this.strike ? 0.7 : 1) * this.rules.fightScale;
          this.tension = 0;
          this.runT = 0;
          this.runGap = 1.8 + this.rnd() * 2;
          this.fishDist = Math.hypot(this.lure.x - rodBase.x, this.lure.z - rodBase.z);
          this.fishAng = Math.atan2(this.lure.z - rodBase.z, this.lure.x - rodBase.x);
          this.model = this.species ? fishModel(this.species, this.size) : null;
          if (this.model) this.scene.add(this.model);
          this.bobber.visible = true;
          this.splashAt(water, audio, 0.55);
        } else if (this.biteT <= 0) {
          this.state = 'wait';
          this.waitT = this.nextWait();
          this.nibbleT = 3;
          this.onSlip?.();
        }
        break;
      }
      case 'reel': {
        this.fightT += dt;
        let pull = actionHeld ? 1 : -this.rules.slack;
        if (this.rules.tension) {
          // Now and then it runs. Reel against a run and the line takes the strain; let it go and it takes line instead.
          if (this.runT > 0) {
            this.runT -= dt;
            if (!actionHeld) pull = -0.55;
          } else {
            this.runGap -= dt;
            if (this.runGap <= 0 && this.fishDist > 4 && this.leapK < 0) {
              this.runT = 1 + this.rnd() * 0.9;
              this.runGap = 2.6 + this.rnd() * 3.2;
              this.splashAt(water, audio, 0.35);
            }
          }
          if (!actionHeld) this.tension = Math.max(0, this.tension - dt * 0.6);
          else if (this.runT > 0) this.tension += dt * 0.9;
          else if (this.leapK >= 0) this.tension += dt * 0.7;
          else this.tension += (0.35 - this.tension) * (1 - Math.exp(-dt * 1.2));
          if (this.tension >= 1) {
            // Snapped. The fish goes back to the water, heading away.
            const sp = this.species;
            const ax = this.lure.x - rodBase.x;
            const az = this.lure.z - rodBase.z;
            const lx = this.lure.x;
            const lz = this.lure.z;
            const size = this.size;
            this.tension = 0;
            this.runT = 0;
            this.splashAt(water, audio, 0.6);
            audio.snap();
            this.reelIn();
            if (sp) this.onFreed?.(sp, lx, lz, Math.atan2(-ax, -az), size);
            this.onSnap?.();
            break;
          }
        }
        const speed = (this.fishDist + 6) / (this.fightDur + 1) * pull;
        this.fishDist = Math.max(0, Math.min(34, this.fishDist - speed * dt));
        // The fish swings from side to side, and you just let it.
        const wander = Math.sin(this.fightT * 0.9) * 0.34 + Math.sin(this.fightT * 2.13) * 0.11;
        const ang = this.fishAng + wander * Math.min(1, this.fishDist / 7);
        const nx = rodBase.x + Math.cos(ang) * this.fishDist;
        const nz = rodBase.z + Math.sin(ang) * this.fishDist;
        const ok = groundY(nx, nz) < -0.05;
        if (ok) {
          this.lure.x = nx;
          this.lure.z = nz;
        }
        this.lure.y = 0;
        if (actionHeld) {
          this.reelSpin += dt * 13;
          this.clickAcc += dt;
          if (this.clickAcc > 0.09) {
            this.clickAcc = 0;
            audio.reelClick();
          }
        }
        if (Math.sin(this.fightT * 3.3) > 0.94) {
          water.splash(this.lure.x, this.lure.z, 0.42, 0.07);
          if (Math.random() < 0.08) audio.splash(0.15);
        }
        // Now and then it comes clean out of the water, shakes, and goes back in with a smack.
        if (this.leapK < 0) {
          this.leapT -= dt;
          if (this.leapT <= 0 && this.fishDist > 3.5 && this.leaps < 2 && this.runT <= 0) {
            this.leapK = 0;
            this.leaps += 1;
            this.splashAt(water, audio, 0.5);
          }
        } else {
          this.leapK += dt / 0.8;
          if (this.leapK >= 1) {
            this.leapK = -1;
            this.leapT = 2.6 + this.rnd() * 3;
            this.splashAt(water, audio, 0.65);
          }
        }
        const len = this.size || 0.3;
        const leapS = this.leapK >= 0 ? Math.sin(this.leapK * Math.PI) : 0;
        // Friends see the leap through the height of the lure.
        this.lure.y = this.leapK >= 0 ? leapS * (0.45 + len * 0.55) : 0;
        if (this.model) {
          const dirA = ang + Math.sin(t * 2.2) * 0.45 + Math.PI;
          this.model.position.set(this.lure.x, -0.28 + leapS * (0.28 + 0.45 + len * 0.55), this.lure.z);
          const pitch = this.leapK >= 0 ? (0.5 - this.leapK) * 1.7 : 0;
          const shake = this.leapK >= 0 ? Math.sin(t * 26) * 0.35 : Math.sin(t * 7) * 0.12;
          this.model.rotation.set(pitch, -dirA + Math.PI / 2, shake, 'YXZ');
        }
        if (this.fishDist < 2.4) {
          this.state = 'landed';
          this.splashAt(water, audio, 0.75);
          audio.landed();
          this.modelSwing = 1;
          this.landedSize = this.size;
          if (this.species) this.onLanded?.(this.species, this.landedSize);
          this.bobber.visible = false;
        }
        break;
      }
      case 'landed': {
        // The fish hangs from the rod tip, turning slowly in the light.
        this.modelSwing = damp(this.modelSwing, 0.12, 0.8, dt);
        if (this.model) {
          const target = new THREE.Vector3(rodTip.x, rodTip.y - 0.56 - Math.max(0, (this.size || 0.3) * 0.4), rodTip.z);
          target.x += Math.sin(t * 2.1) * 0.07 * this.modelSwing * 3;
          target.z += Math.cos(t * 1.6) * 0.05 * this.modelSwing * 3;
          this.model.position.lerp(target, 1 - Math.exp(-dt * 5));
          this.model.rotation.set(-Math.PI / 2 + Math.sin(t * 5.5) * this.modelSwing * 0.3, t * 0.6, Math.sin(t * 6.5) * 0.14 * this.modelSwing, 'YXZ');
        }
        this.lure.copy(this.model ? this.model.position : rodTip);
        break;
      }
      case 'released': {
        // Tossed out in a short arc, and gone with a flick of the tail.
        this.releaseT += dt;
        if (this.model) {
          const k = Math.min(1, this.releaseT / 0.62);
          this.model.position.lerpVectors(this.freeFrom, this.freeTo, k);
          this.model.position.y += Math.sin(k * Math.PI) * 0.45;
          this.model.rotation.x = -Math.PI / 2 + k * 2.2;
          this.model.rotation.z += dt * 4;
          this.lure.copy(this.model.position);
          if (k >= 1) {
            water.splash(this.freeTo.x, this.freeTo.z, 0.55, 0.18);
            audio.splash(0.5);
            const heading = Math.atan2(-(this.freeTo.x - this.freeFrom.x), -(this.freeTo.z - this.freeFrom.z));
            if (this.species) this.onFreed?.(this.species, this.freeTo.x, this.freeTo.z, heading, this.size);
            this.clearModel();
            this.reelIn();
          }
        } else {
          this.reelIn();
        }
        break;
      }
      default:
    }

    // Bobber rides the swell, with a soft spring for the dips.
    if (this.state === 'wait' || this.state === 'bite' || this.state === 'reel') {
      this.dipV += (-this.dip * 42 - this.dipV * 5) * dt;
      this.dip += this.dipV * dt;
      this.bobber.position.set(this.lure.x, swell + this.dip * 0.14 - 0.02, this.lure.z);
      this.bobber.rotation.set(Math.sin(t * 1.3) * 0.12, 0, Math.cos(t * 1.1) * 0.12);
      if (this.state === 'reel') this.bobber.position.y -= 0.03;
    } else if (this.state === 'flight') {
      this.bobber.position.copy(this.lure);
    }

    this.rodBaseSeen.copy(rodBase);
    // Line: sag when slack, taut when a fish is on it.
    if (this.line.visible && !this.previewing) {
      const a = rodTip;
      const b = this.state === 'flight' ? this.lure : this.state === 'landed' ? this.lure : this.leapK >= 0 && this.model ? this.model.position : this.bobber.position;
      const taut = this.state === 'reel' || this.state === 'landed' ? 0.05 : this.state === 'bite' ? 0.25 : 0.65;
      const N = this.linePos.length / 3;
      const dist = a.distanceTo(b);
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const sag = Math.sin(k * Math.PI) * dist * 0.075 * taut;
        this.linePos[i * 3] = a.x + (b.x - a.x) * k;
        this.linePos[i * 3 + 1] = a.y + (b.y - a.y) * k - sag;
        this.linePos[i * 3 + 2] = a.z + (b.z - a.z) * k;
      }
      (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  letGo() {
    if (this.state !== 'landed') return;
    this.state = 'released';
    this.releaseT = 0;
    this.line.visible = false;
    // Out over the water, away from whoever is holding it; straight down if that would be land.
    const from = this.model ? this.model.position : this.lure;
    this.freeFrom.copy(from);
    const dx = from.x - this.rodBaseSeen.x;
    const dz = from.z - this.rodBaseSeen.z;
    const d = Math.hypot(dx, dz) || 1;
    this.freeTo.set(from.x + (dx / d) * 1.7, -0.1, from.z + (dz / d) * 1.7);
    if (groundY(this.freeTo.x, this.freeTo.z) > -0.3) this.freeTo.set(from.x, -0.1, from.z);
  }

  bendAmount(t: number): number {
    switch (this.state) {
      case 'charge': return 0.05 + this.charge * 0.1;
      case 'bite': return 0.26 + Math.max(0, Math.sin(t * 7)) * 0.22;
      case 'reel': return 0.52 + Math.sin(t * 3.1) * 0.13;
      case 'landed': return 0.42;
      default: return 0.05;
    }
  }
}
