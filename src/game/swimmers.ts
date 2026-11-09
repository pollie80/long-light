// Fish you can see before you cast: a few real catches cruising just under the surface around you. Cast
// near one and you'll watch it come to the bobber; cast anywhere else and one swims in from out of sight, so
// every bite is a fish you saw arrive. Each player has their own.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { Q } from '../core/quality';
import { JETTY, groundY } from '../world/land';
import type { Water } from '../world/water';
import { disposeFish, fishModel } from './fishart';
import { pickCatch, Species } from './fishdata';
import { Fishing, zoneAt } from './fishing';

interface Swimmer {
  catch: Species;
  model: THREE.Group;
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  tx: number;
  tz: number;
  mode: 'wander' | 'approach' | 'nibble' | 'flee' | 'free' | 'shot';
  phase: number;
  ripple: number;
  /** 0 to 1 coming in, back to 0 going out. */
  show: number;
  /** Its length in metres: the same fish, the same size, from here to the card. */
  size: number;
  /** Which side of the float it holds station on, once there. */
  holdA: number;
  wake: number;
  /** Where its body sway is up to. Kept per fish so a change of pace never jolts it. */
  sway: number;
  gone: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Turns towards an angle no faster than `rate` radians a second, so it swims round rather than snapping. */
const turnTo = (from: number, to: number, rate: number, dt: number) => {
  const d = wrap(to - from);
  return from + Math.max(-rate * dt, Math.min(rate * dt, d));
};
const SWIM_IN = 1.5;

export class Swimmers {
  group = new THREE.Group();
  /** The one coming to the bobber now, if any. */
  approacher: Swimmer | null = null;
  private fish: Swimmer[] = [];
  private rnd = mulberry32(31337);
  private lastState = 'idle';
  private want = Q.id === 'low' ? 3 : 5;

  constructor(private seen: (id: string) => boolean) {}

  get count(): number {
    return this.fish.filter((f) => !f.gone && f.mode !== 'flee' && f.mode !== 'free' && f.mode !== 'shot').length;
  }

  /** One just let go: it shakes itself and swims off, down and away, and is gone. */
  release(sp: Species, x: number, z: number, heading: number, size = sp.length) {
    const model = fishModel(sp, size);
    this.group.add(model);
    this.fish.push({
      catch: sp, model, x, z, y: -0.12, heading, speed: 0.4, tx: x, tz: z, mode: 'free', phase: this.rnd() * 6,
      ripple: 0.25, show: 1, gone: false, size, holdA: 0, wake: 0, sway: 0,
    });
  }

  private spawn(x: number, z: number, hour: number): Swimmer | null {
    if (groundY(x, z) > -0.9) return null;
    if (x < JETTY.startX + 4 && x > JETTY.endX - 4 && Math.abs(z) < 5) return null;
    const sp = pickCatch(zoneAt(x, z, hour), hour, this.rnd, this.seen);
    const size = sp.length * (0.82 + this.rnd() * 0.42);
    const model = fishModel(sp, size);
    model.scale.setScalar(0.001);
    this.group.add(model);
    const s: Swimmer = {
      catch: sp, model, x, z,
      y: -0.2 - Math.min(0.25, sp.length * 0.2),
      heading: this.rnd() * Math.PI * 2,
      speed: 0.6, tx: x, tz: z, mode: 'wander', phase: this.rnd() * 6, ripple: this.rnd() * 3, show: 0, gone: false, size, holdA: 0, wake: 0, sway: 0,
    };
    this.fish.push(s);
    return s;
  }

  private drop(s: Swimmer) {
    disposeFish(s.model);
    s.gone = true;
  }

  private newTarget(s: Swimmer) {
    const a = this.rnd() * Math.PI * 2;
    const r = 3 + this.rnd() * 6;
    const x = s.x + Math.cos(a) * r;
    const z = s.z + Math.sin(a) * r;
    if (groundY(x, z) < -0.9) {
      s.tx = x;
      s.tz = z;
    }
  }

  update(dt: number, t: number, center: THREE.Vector3, hour: number, water: Water, fishing: Fishing) {
    // Keep a few in view, somewhere you could reach with a cast.
    if (this.count < this.want) {
      const a = this.rnd() * Math.PI * 2;
      const r = 8 + this.rnd() * 22;
      this.spawn(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, hour);
    }
    this.handleBobber(fishing, hour);
    for (const s of this.fish) {
      if (s.gone) continue;
      const lure = fishing.lure;
      let tx = s.tx;
      let tz = s.tz;
      let want = 0.55;
      if (s.mode === 'shot') {
        // Up to the top, belly up, a slow drift, and down again.
        s.wake += dt;
        const k = s.wake;
        s.model.position.set(s.x, Math.min(-0.03, -0.3 + k * 0.9) - Math.max(0, k - 5) * 0.2, s.z);
        s.model.rotation.set(0, s.heading, Math.min(Math.PI, k * 5));
        s.model.scale.setScalar(Math.max(0.001, Math.min(1, 1.6 - (k - 5) * 0.5)));
        if (k > 8) {
          this.drop(s);
        }
        continue;
      }
      if (s.mode === 'nibble') {
        // Holds just off the float, nose to it, easing in and back: no chasing round in circles.
        const hold = 0.2 + s.size * 0.5 + Math.sin(t * 1.9 + s.phase) * 0.05;
        const hx = lure.x + Math.cos(s.holdA) * hold;
        const hz = lure.z + Math.sin(s.holdA) * hold;
        s.x += (hx - s.x) * (1 - Math.exp(-dt * 2.5));
        s.z += (hz - s.z) * (1 - Math.exp(-dt * 2.5));
        s.heading = turnTo(s.heading, Math.atan2(-(lure.x - s.x), -(lure.z - s.z)), 1.6, dt);
        s.speed += (0.15 - s.speed) * (1 - Math.exp(-dt * 2));
      } else if (s.mode === 'approach') {
        // Comes in, slowing as it gets close.
        tx = lure.x;
        tz = lure.z;
        const d = Math.hypot(tx - s.x, tz - s.z);
        const off = Math.abs(wrap(Math.atan2(-(tx - s.x), -(tz - s.z)) - s.heading));
        want = Math.min(SWIM_IN, 0.35 + d * 0.6) * (d < 1.4 && off > 1 ? 0.4 : 1);
        if (d < 0.3 + s.size * 0.5) this.settle(s, lure);
      } else if (s.mode === 'flee') {
        want = 2.6;
      } else if (s.mode === 'free') {
        // A moment to get its bearings, then off.
        want = 1.7;
        s.y = Math.max(-0.75, s.y - dt * 0.12);
      } else if (Math.hypot(tx - s.x, tz - s.z) < 0.8) {
        this.newTarget(s);
      }
      const dx = tx - s.x;
      const dz = tz - s.z;
      if (s.mode !== 'nibble') {
        if (s.mode !== 'flee' && s.mode !== 'free' && Math.hypot(dx, dz) > 0.05) {
          s.heading = turnTo(s.heading, Math.atan2(-dx, -dz), s.mode === 'wander' ? 0.9 : 2.2, dt);
        }
        s.speed += (want - s.speed) * (1 - Math.exp(-dt * 2));
        const nx = s.x - Math.sin(s.heading) * s.speed * dt;
        const nz = s.z - Math.cos(s.heading) * s.speed * dt;
        if (groundY(nx, nz) < -0.6 || s.mode !== 'wander') {
          s.x = nx;
          s.z = nz;
        } else {
          // Shallows ahead: a new way to go, and a gentle turn towards it rather than a flip.
          this.newTarget(s);
        }
      }
      const far = Math.hypot(s.x - center.x, s.z - center.z);
      const leaving = s.mode === 'flee' || s.mode === 'free' || far > 48;
      s.show = Math.max(0, Math.min(1, s.show + (leaving ? -dt * (s.mode === 'free' ? 0.3 : 0.8) : dt * 0.6)));
      if (leaving && s.show <= 0) {
        if (this.approacher === s) this.approacher = null;
        this.drop(s);
        continue;
      }
      // A slow sway of the body. The tail does the real work; the fish itself doesn't zigzag.
      s.sway += dt * (2.6 + s.speed * 2.4);
      const wiggle = Math.sin(s.sway + s.phase) * (0.04 + s.speed * 0.035);
      // Now and then one comes up until its back breaks the surface; one heading for the bobber stays up there.
      const rise = s.mode === 'wander' ? Math.pow(Math.max(0, Math.sin(t * 0.42 + s.phase * 3)), 6) : s.mode === 'free' ? 0 : 1;
      // Wandering, its back breaks the surface now and then. Coming to the float it stays down: a shape, not a show.
      const top = s.mode === 'approach' || s.mode === 'nibble' ? -0.2 - s.size * 0.2 : -0.04;
      const y = s.y * (1 - rise) + top * rise;
      s.model.position.set(s.x, y + Math.sin(t * 0.7 + s.phase) * 0.02, s.z);
      s.model.rotation.set(0, s.heading + wiggle, 0);
      s.model.scale.setScalar(Math.max(0.001, s.show));
      // A fish heading in leaves a little V on the water behind it.
      if (s.mode === 'approach' || (s.mode === 'free' && s.show > 0.55)) {
        // Only the faintest stir above it.
        s.wake -= dt;
        if (s.wake <= 0) {
          s.wake = 0.45;
          water.splash(s.x, s.z, 0.24, 0.012);
        }
      }
      // A ring on the surface now and then gives each one away, more often when it's busy.
      s.ripple -= dt;
      if (s.ripple <= 0) {
        s.ripple = s.mode === 'wander' ? (rise > 0.5 ? 0.5 : 1.8 + this.rnd() * 2) : 1.6;
        water.splash(s.x, s.z, 0.3, s.mode === 'wander' ? (rise > 0.5 ? 0.03 : 0.016) : 0.01);
      }
    }
    this.fish = this.fish.filter((s) => !s.gone);
  }

  /** A shot along a line: the nearest fish close enough to it is hit. It turns belly up and drifts, then sinks. */
  fire(origin: THREE.Vector3, dir: THREE.Vector3, reach: number, spread: (along: number) => number): Swimmer | null {
    let best: Swimmer | null = null;
    let bestAlong = Infinity;
    const to = new THREE.Vector3();
    for (const s of this.fish) {
      if (s.gone || s.show < 0.4 || s.mode === 'shot') continue;
      to.set(s.x - origin.x, s.model.position.y - origin.y, s.z - origin.z);
      const along = to.dot(dir);
      if (along < 1 || along > reach) continue;
      const miss = to.clone().addScaledVector(dir, -along).length();
      if (miss > spread(along) * 0.6 + s.size * 0.35) continue;
      if (along < bestAlong) {
        bestAlong = along;
        best = s;
      }
    }
    if (best) {
      if (this.approacher === best) this.approacher = null;
      best.mode = 'shot';
      best.speed = 0;
      best.wake = 0;
    }
    return best;
  }

  /** Ties what's in the water to what bites. */
  private handleBobber(f: Fishing, hour: number) {
    const state = f.state;
    const settled = state === 'wait' && this.lastState !== 'wait';
    const lure = f.lure;
    if (state === 'wait' && !this.approacher) {
      // The nearest one in sight sets off when it has just time enough to arrive for the bite.
      let best: Swimmer | null = null;
      let bd = 11;
      for (const s of this.fish) {
        if (s.gone || s.mode !== 'wander') continue;
        const d = Math.hypot(s.x - lure.x, s.z - lure.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best && f.waitT <= bd / (SWIM_IN * 0.85) + 1.6) {
        f.waitT = Math.max(f.waitT, bd / (SWIM_IN * 0.85) + 1.2);
        this.sendIn(best, f, false);
      }
    }
    // Nothing nearby: one comes in from out of sight, in time to take it.
    if (state === 'wait' && !this.approacher && f.waitT < 4.2) {
      // Starts as far out as it can and still arrive on time, so the bite comes when it was going to.
      const dist = Math.max(1.2, Math.min(6.5, (f.waitT - 0.6) * SWIM_IN * 0.85));
      for (let i = 0; i < 10 && !this.approacher; i++) {
        const a = this.rnd() * Math.PI * 2;
        const s = this.spawn(lure.x + Math.cos(a) * dist, lure.z + Math.sin(a) * dist, hour);
        if (s) {
          s.show = 0.4;
          this.sendIn(s, f, false);
        }
      }
    }
    // Hooked: the fish on the line takes over from the one in the water.
    if (state === 'reel' && this.approacher) {
      this.drop(this.approacher);
      this.approacher = null;
    }
    // Got away, or reeled in empty: it leaves.
    if (this.approacher && (state === 'idle' || (state === 'wait' && this.lastState === 'bite'))) {
      this.approacher.mode = 'flee';
      this.approacher.heading += Math.PI;
      this.approacher = null;
      f.preset = null;
    }
    // A bite before it got there: it darts the rest of the way.
    if (state === 'bite' && this.lastState !== 'bite' && this.approacher && this.approacher.mode === 'approach') this.settle(this.approacher, lure);
    this.lastState = state;
  }

  /** Arrived: it holds station on the side it came from. */
  private settle(s: Swimmer, lure: THREE.Vector3) {
    s.mode = 'nibble';
    const dx = s.x - lure.x;
    const dz = s.z - lure.z;
    s.holdA = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dz, dx) : Math.atan2(Math.cos(s.heading), Math.sin(s.heading));
  }

  private sendIn(s: Swimmer, f: Fishing, setWait = true) {
    s.mode = 'approach';
    this.approacher = s;
    f.preset = s.catch;
    f.presetSize = s.size;
    const d = Math.hypot(s.x - f.lure.x, s.z - f.lure.z);
    // Arrive, look it over, then take it.
    if (setWait) f.waitT = d / (SWIM_IN * 0.85) + 1.2 + this.rnd() * 1.5;
    f.nibbleT = Math.max(0.2, f.waitT - 0.6);
  }
}
