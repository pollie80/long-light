// The cast, the wait, the small tug, the slow reel. Nothing here can fail.
import * as THREE from 'three';
import { groundY, ISLETS, JETTY, MAGIC_SPOTS, swellAt } from '../world/land';
import { Builder, solid, TRS } from '../world/builder';
import { paintedMaterial } from '../render/shared';
import { damp, mulberry32 } from '../core/noise';
import { nightMagic } from '../core/time';
import { pickCatch, Species, Zone } from './fishdata';
import { fishModel } from './fishart';
import type { Water } from '../world/water';
import type { AudioWorld } from '../audio/audio';

export type FishState = 'idle' | 'charge' | 'flight' | 'wait' | 'bite' | 'reel' | 'landed' | 'released';

export function zoneAt(x: number, z: number, hour = 12): Zone {
  if (nightMagic(hour) > 0.5) {
    for (const m of MAGIC_SPOTS) if (Math.hypot(x - m.x, z - m.z) < m.r) return 'magic';
  }
  for (const i of ISLETS) if (Math.hypot(x - i.x, z - i.z) < i.r * 2.3) return 'reef';
  if (x > JETTY.endX - 10 && x < JETTY.startX && Math.abs(z) < 13) return 'jetty';
  return groundY(x, z) > -3.4 ? 'shallows' : 'deep';
}

export function makeBobber(): THREE.Group {
  const b = new Builder(121);
  b.sphere(0.075, 0xe6dccb, TRS(0, 0.02, 0), {}, 10, 8);
  b.sphere(0.078, 0xc23a2c, TRS(0, 0.06, 0, 0, 0, 0, 1, 0.65, 1), {}, 10, 6);
  b.cyl(0.008, 0.012, 0.2, 0xc23a2c, TRS(0, 0.17, 0), {}, 5);
  const g = new THREE.Group();
  g.add(solid(b.build(), paintedMaterial(), false));
  return g;
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
  /** The fish already on its way to the bobber, which is the one that will bite. */
  preset: Species | null = null;
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
  seen: (id: string) => boolean = () => false;

  constructor(scene: THREE.Object3D, lineMat: THREE.Material) {
    this.scene = scene;
    this.bobber = makeBobber();
    this.bobber.visible = false;
    scene.add(this.bobber);

    const N = 26;
    this.linePos = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(g, lineMat);
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  get active(): boolean {
    return this.state !== 'idle';
  }

  private clearModel() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
    }
  }

  beginCharge() {
    this.state = 'charge';
    this.charge = 0;
  }

  /** Release the cast. Lands `range` metres out along `dir`, on the water. */
  release(from: THREE.Vector3, dir: THREE.Vector3, audio: AudioWorld) {
    const range = 6 + this.charge * 24;
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
  }

  reelIn() {
    this.state = 'idle';
    this.preset = null;
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
        this.charge = Math.min(1, this.charge + dt * 0.62);
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
          // A patient wait, but never a chore.
          this.waitT = 5 + this.rnd() * 14;
          this.nibbleT = 2.5 + this.rnd() * 4;
        }
        break;
      }
      case 'wait': {
        this.waitT -= dt;
        this.nibbleT -= dt;
        if (this.nibbleT <= 0 && this.waitT > 1.5) {
          this.nibbleT = 2 + this.rnd() * 5;
          this.dipV = -0.5 - this.rnd() * 0.5;
          water.splash(this.lure.x, this.lure.z, 0.22, 0.03);
        }
        if (this.waitT <= 0) {
          this.state = 'bite';
          this.biteT = 9;
          this.species = this.preset ?? pickCatch(zoneAt(this.lure.x, this.lure.z, hour), hour, this.rnd, this.seen);
          this.preset = null;
          this.dipV = -3.4;
          this.splashAt(water, audio, 0.4);
          audio.bite();
          this.onBite?.();
        }
        break;
      }
      case 'bite': {
        this.biteT -= dt;
        // Repeated tugs until answered.
        if (Math.sin(t * 7) > 0.92) {
          this.dipV = -1.7;
          water.splash(this.lure.x, this.lure.z, 0.3, 0.05);
        }
        if (actionPressed) {
          this.state = 'reel';
          this.fightT = 0;
          this.fightDur = this.species?.fight ?? 7;
          this.fishDist = Math.hypot(this.lure.x - rodBase.x, this.lure.z - rodBase.z);
          this.fishAng = Math.atan2(this.lure.z - rodBase.z, this.lure.x - rodBase.x);
          this.model = this.species ? fishModel(this.species) : null;
          if (this.model) this.scene.add(this.model);
          this.bobber.visible = true;
          this.splashAt(water, audio, 0.55);
        } else if (this.biteT <= 0) {
          this.state = 'wait';
          this.waitT = 6 + this.rnd() * 12;
          this.nibbleT = 3;
          this.onSlip?.();
        }
        break;
      }
      case 'reel': {
        this.fightT += dt;
        const speed = (this.fishDist + 6) / (this.fightDur + 1) * (actionHeld ? 1 : -0.1);
        this.fishDist = Math.max(0, this.fishDist - speed * dt);
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
        if (this.model) {
          const dirA = ang + Math.sin(t * 2.2) * 0.45 + Math.PI;
          this.model.position.set(this.lure.x, -0.28, this.lure.z);
          this.model.rotation.set(0, -dirA + Math.PI / 2, Math.sin(t * 7) * 0.12, 'YXZ');
        }
        if (this.fishDist < 2.4) {
          this.state = 'landed';
          this.splashAt(water, audio, 0.75);
          audio.landed();
          this.modelSwing = 1;
          const sizeK = 0.82 + this.rnd() * 0.42;
          this.landedSize = (this.species?.length ?? 0.3) * sizeK;
          if (this.species) this.onLanded?.(this.species, this.landedSize);
          this.bobber.visible = false;
        }
        break;
      }
      case 'landed': {
        // The fish hangs from the rod tip, turning slowly in the light.
        this.modelSwing = damp(this.modelSwing, 0.12, 0.8, dt);
        if (this.model) {
          const target = new THREE.Vector3(rodTip.x, rodTip.y - 0.56 - Math.max(0, (this.species?.length ?? 0.3) * 0.4), rodTip.z);
          target.x += Math.sin(t * 2.1) * 0.07 * this.modelSwing * 3;
          target.z += Math.cos(t * 1.6) * 0.05 * this.modelSwing * 3;
          this.model.position.lerp(target, 1 - Math.exp(-dt * 5));
          this.model.rotation.set(-Math.PI / 2 + Math.sin(t * 5.5) * this.modelSwing * 0.3, t * 0.6, Math.sin(t * 6.5) * 0.14 * this.modelSwing, 'YXZ');
        }
        this.lure.copy(this.model ? this.model.position : rodTip);
        break;
      }
      case 'released': {
        this.releaseT += dt;
        if (this.model) {
          this.model.position.y -= dt * (1.5 + this.releaseT * 9);
          this.model.rotation.z += dt * 3;
          if (this.model.position.y < 0) {
            water.splash(this.model.position.x, this.model.position.z, 0.55, 0.18);
            audio.splash(0.5);
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

    // Line: sag when slack, taut when a fish is on it.
    if (this.line.visible) {
      const a = rodTip;
      const b = this.state === 'flight' ? this.lure : this.state === 'landed' ? this.lure : this.bobber.position;
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
