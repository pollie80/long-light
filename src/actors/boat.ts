// A clinker rowing boat: hull, oars, stern lantern, and gentle physics.
import * as THREE from 'three';
import { Builder, solid, TRS } from '../world/builder';
import { BOAT_MOOR, groundY, JETTY, swellAt } from '../world/land';
import { paintedMaterial } from '../render/shared';
import { clamp, damp } from '../core/noise';
import type { Water } from '../world/water';

const L_HULL = 4.2;
const halfBeam = (u: number) => 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.82 + 0.18)), 0.68);
const sheer = (u: number) => 0.46 + 0.24 * u * u * u + 0.05 * (1 - u) * (1 - u);
const keel = (u: number) => -0.15 + 0.36 * Math.pow(u, 4);

function hullPoint(u: number, v: number, inset = 0): THREE.Vector3 {
  const w = Math.max(0, halfBeam(u) - inset);
  const top = sheer(u);
  const bot = keel(u);
  const a = v * Math.PI * 0.5;
  const x = w * Math.pow(Math.sin(a), 0.72);
  const y = bot + (top - bot) * (1 - Math.cos(a)) + inset * 0.6;
  const z = L_HULL / 2 - u * L_HULL;
  return new THREE.Vector3(x, y, z);
}

function strake(v0: number, v1: number, side: number, inset: number, flip: boolean): THREE.BufferGeometry {
  const us = 26;
  const vs = 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= us; i++) {
    const u = i / us;
    for (let j = 0; j <= vs; j++) {
      const v = v0 + (v1 - v0) * (j / vs);
      // Each plank overlaps the one below, which is what makes the rows catch the light.
      const lap = inset === 0 ? (1 - j / vs) * 0.018 : 0;
      const p = hullPoint(u, v, inset - lap);
      pos.push(p.x * side, p.y, p.z);
    }
  }
  const stride = vs + 1;
  const wantFlip = (side < 0) !== flip;
  for (let i = 0; i < us; i++) {
    for (let j = 0; j < vs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      if (wantFlip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Boat {
  group = new THREE.Group();
  body = new THREE.Group();
  mat = paintedMaterial();
  x = BOAT_MOOR.x;
  z = BOAT_MOOR.z;
  heading = Math.PI / 2; // facing west
  speed = 0;
  turnRate = 0;
  y = 0;
  pitch = 0;
  roll = 0;
  /** 0 to 2 pi. Blades in the water for the first half. */
  oarPhase = Math.PI * 1.5;
  oarOut = 0;
  rowing = false;
  moored = true;
  /** The rowing speed setting: 1 is the natural pace. */
  power = 1;
  home = { x: BOAT_MOOR.x, z: BOAT_MOOR.z };
  private oarGroups: THREE.Group[] = [];
  private bladeWorld = [new THREE.Vector3(), new THREE.Vector3()];
  private lastPull = [false, false];
  private rippleAcc = 0;
  private forwardTmp = new THREE.Vector3();
  onCatch: ((power: number) => void) | null = null;
  onDrip: (() => void) | null = null;

  constructor() {
    const b = new Builder(808);
    const strakes = 7;
    const colOut = (i: number) => {
      if (i === strakes - 1) return 0xe9ddc2; // cream sheer strake
      if (i === strakes - 2) return 0xb5392e; // thin red line
      if (i <= 1) return 0x5a2c28; // antifoul below the water
      return 0x2f7d80; // sea-teal hull
    };
    const edges = [0, 0.16, 0.33, 0.48, 0.62, 0.75, 0.84, 1.0];
    for (let i = 0; i < strakes; i++) {
      for (const side of [-1, 1]) {
        b.add(strake(edges[i], edges[i + 1], side, 0, false), colOut(i), undefined, { jit: 0.06 });
        b.add(strake(edges[i], edges[i + 1], side, 0.028, true), 0x9c7a55, undefined, { jit: 0.12 });
      }
    }
    // Transom.
    const t = new THREE.Shape();
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const v = i / n;
      const p = hullPoint(0, v);
      if (i === 0) t.moveTo(p.x, p.y);
      else t.lineTo(p.x, p.y);
    }
    for (let i = n; i >= 0; i--) {
      const v = i / n;
      const p = hullPoint(0, v);
      t.lineTo(-p.x, p.y);
    }
    t.closePath();
    const transom = new THREE.ExtrudeGeometry(t, { depth: 0.035, bevelEnabled: false });
    b.add(transom, 0x2f7d80, TRS(0, 0, L_HULL / 2 - 0.02), { jit: 0.05 });
    b.box(1.02, 0.07, 0.04, 0xe9ddc2, TRS(0, sheer(0) - 0.06, L_HULL / 2 + 0.02), {}, 0.01);
    b.add(transom, 0x9c7a55, TRS(0, 0, L_HULL / 2 - 0.06), {});
    // Gunwale rails.
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const p = hullPoint(i / 14, 1);
        pts.push(new THREE.Vector3(p.x * side, p.y + 0.012, p.z));
      }
      b.tube(pts, 0.026, 0x7b5a3f, {}, 40, 6);
    }
    // Stem.
    const stem: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = 0.86 + (i / 6) * 0.14;
      stem.push(new THREE.Vector3(0, keel(u) + (sheer(u) - keel(u)) * (i / 6), L_HULL / 2 - u * L_HULL));
    }
    b.tube(stem, 0.035, 0x7b5a3f, {}, 14, 6);
    // Floorboards: above the water plane, so the bay never shows inside the boat.
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.105;
      const zLen = 3.2 - Math.abs(i) * 0.2;
      b.box(0.095, 0.022, zLen, 0xa98a68, TRS(x, 0.13, 0.18), { jit: 0.2 }, 0.006);
    }
    // Thwarts.
    const seat = (z: number, w: number, h: number) => {
      b.box(w * 2, 0.04, 0.26, 0xb1926c, TRS(0, h, z), { jit: 0.1 }, 0.012);
      b.box(0.07, h - 0.13, 0.08, 0x6e5238, TRS(0, (h + 0.13) / 2, z), {}, 0.012);
    };
    seat(1.42, 0.56, 0.36);
    seat(-0.02, 0.72, 0.36);
    seat(-1.05, 0.5, 0.44);
    // Tackle box and bucket, a coil of rope in the bow.
    b.box(0.34, 0.16, 0.2, 0x3d6a70, TRS(0.32, 0.23, 0.95, 0, 0.2, 0), {}, 0.015);
    b.box(0.2, 0.02, 0.04, 0xc9b184, TRS(0.32, 0.325, 0.95, 0, 0.2, 0), {}, 0.005);
    b.lathe([[0, 0], [0.11, 0], [0.14, 0.2], [0.13, 0.2], [0.095, 0.02], [0, 0.02]], 0xc9ab62, TRS(-0.36, 0.14, 0.78), { jit: 0.1 });
    for (let r = 0; r < 3; r++) {
      b.add(new THREE.TorusGeometry(0.18 - r * 0.01, 0.022, 6, 16), 0xc4ab7d, TRS(0, 0.165 + r * 0.04, -1.46, Math.PI / 2, 0, 0), {});
    }
    // Oarlocks.
    for (const side of [-1, 1]) {
      const p = hullPoint(0.4, 1);
      b.box(0.04, 0.1, 0.04, 0x2a2a30, TRS(p.x * side, p.y + 0.06, p.z), {}, 0.01);
    }
    // Stern lantern on a pole, for the dark rows home.
    b.box(0.035, 0.95, 0.035, 0x5a4230, TRS(0.42, sheer(0) + 0.42, 1.92), {}, 0.01);
    b.box(0.13, 0.02, 0.13, 0x2a2a30, TRS(0.42, sheer(0) + 0.8, 1.92), {}, 0.005);
    b.box(0.09, 0.13, 0.09, 0xffc070, TRS(0.42, sheer(0) + 0.88, 1.92), { emis: 1 }, 0.005);
    b.add(new THREE.ConeGeometry(0.09, 0.08, 4), 0x2a2a30, TRS(0.42, sheer(0) + 0.98, 1.92, 0, 0.78, 0));
    this.body.add(solid(b.build(), this.mat));

    // Oars.
    for (const side of [-1, 1]) {
      const o = new THREE.Group();
      const p = hullPoint(0.4, 1);
      o.position.set(p.x * side, p.y + 0.1, p.z);
      const ob = new Builder(30 + side);
      // Local x runs from the handle (inboard, negative) out to the blade.
      ob.cyl(0.02, 0.027, 2.65, 0xc4a578, TRS(0.72, 0, 0, 0, 0, Math.PI / 2), { jit: 0.08 }, 7);
      ob.box(0.5, 0.012, 0.13, 0xe0d4b4, TRS(2.1, 0, 0), {}, 0.005);
      ob.box(0.14, 0.03, 0.03, 0x7b5a3f, TRS(-0.58, 0, 0), {}, 0.008);
      const m = solid(ob.build(), this.mat);
      o.add(m);
      o.scale.x = side;
      this.oarGroups.push(o);
      this.body.add(o);
    }
    this.group.add(this.body);
    this.group.position.set(this.x, 0, this.z);
  }

  forward(out = this.forwardTmp): THREE.Vector3 {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  private collide() {
    const fwd = this.forward();
    const sideX = -fwd.z;
    const sideZ = fwd.x;
    const pts: [number, number][] = [
      [2.1, 0], [-2.1, 0], [0.9, 0.7], [0.9, -0.7], [-1.2, 0.5], [-1.2, -0.5],
    ];
    for (const [f, s] of pts) {
      const px = this.x + fwd.x * f + sideX * s;
      const pz = this.z + fwd.z * f + sideZ * s;
      const g = groundY(px, pz);
      if (g > -0.28) {
        // Slide gently off the shallows, up the slope of the seabed.
        const e = 1.2;
        const dx = groundY(px + e, pz) - groundY(px - e, pz);
        const dz = groundY(px, pz + e) - groundY(px, pz - e);
        const l = Math.hypot(dx, dz) || 1;
        const k = clamp((g + 0.28) * 0.5, 0, 0.22);
        this.x -= (dx / l) * k;
        this.z -= (dz / l) * k;
        this.speed *= 0.93;
      }
      if (px < JETTY.startX && px > JETTY.endX - 0.3 && Math.abs(pz) < JETTY.halfWidth + 0.28) {
        const sign = pz >= 0 ? 1 : -1;
        this.z += sign * (JETTY.halfWidth + 0.28 - Math.abs(pz)) * 0.5;
        this.speed *= 0.95;
      }
    }
    // The edge of the world is a slow current turning you back.
    const dx = this.x + 180;
    const dz = this.z;
    const d = Math.hypot(dx, dz);
    if (d > 640) {
      const k = (d - 640) * 0.004;
      this.x -= (dx / d) * k;
      this.z -= (dz / d) * k;
    }
  }

  update(dt: number, t: number, forwardInput: number, turnInput: number, oarsOut: boolean, water: Water) {
    this.oarOut = damp(this.oarOut, oarsOut ? 1 : 0, 4, dt);
    const active = oarsOut && (Math.abs(forwardInput) > 0.05 || Math.abs(turnInput) > 0.05);
    this.rowing = active;
    if (active || (this.oarPhase % (Math.PI * 2)) < Math.PI) {
      this.oarPhase += dt * (Math.PI * 2) / 2.35;
    }
    const pulling = Math.sin(this.oarPhase) > 0;
    const pull = Math.max(0, Math.sin(this.oarPhase));
    let thrust = 0;
    let yaw = 0;
    if (active) {
      const leftP = clamp(forwardInput + turnInput * 0.55, -1, 1);
      const rightP = clamp(forwardInput - turnInput * 0.55, -1, 1);
      thrust = ((leftP + rightP) * 0.5 * pull) * 1.9 * this.power;
      yaw = (leftP - rightP) * 0.5 * pull * 0.62;
      if (Math.abs(forwardInput) < 0.05) yaw *= 1.2;
    }
    this.speed += thrust * dt;
    // Thrust up and water drag down by the same factor scales the top speed by exactly that factor.
    this.speed *= Math.exp(-dt * (0.42 + (Math.abs(this.speed) * 0.1) / this.power));
    this.turnRate += -yaw * dt * 1.9;
    this.turnRate *= Math.exp(-dt * 1.5);
    this.heading += this.turnRate * dt * (0.55 + Math.min(1, Math.abs(this.speed)) * 0.45);

    const fwd = this.forward();
    this.x += fwd.x * this.speed * dt;
    this.z += fwd.z * this.speed * dt;
    this.collide();
    this.visuals(dt, t, active, Math.abs(forwardInput), water);
  }

  /** Follows a friend's boat from what the network says, with no physics of its own. */
  puppet(dt: number, t: number, x: number, z: number, heading: number, speed: number, oarPhase: number, oarsOut: boolean, rowing: boolean, water: Water) {
    this.x = damp(this.x, x, 9, dt);
    this.z = damp(this.z, z, 9, dt);
    this.heading += Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading)) * (1 - Math.exp(-dt * 9));
    this.speed = speed;
    this.oarPhase = oarPhase;
    this.oarOut = damp(this.oarOut, oarsOut ? 1 : 0, 4, dt);
    this.rowing = rowing;
    this.visuals(dt, t, rowing, rowing ? 1 : 0, water);
  }

  private visuals(dt: number, t: number, active: boolean, power: number, water: Water) {
    const fwd = this.forward();
    const pulling = Math.sin(this.oarPhase) > 0;
    const pull = Math.max(0, Math.sin(this.oarPhase));

    // Ride the real swell.
    const y0 = swellAt(this.x, this.z, t);
    const yF = swellAt(this.x + fwd.x * 1.5, this.z + fwd.z * 1.5, t);
    const yB = swellAt(this.x - fwd.x * 1.5, this.z - fwd.z * 1.5, t);
    const yL = swellAt(this.x - fwd.z * 0.6, this.z + fwd.x * 0.6, t);
    const yR = swellAt(this.x + fwd.z * 0.6, this.z - fwd.x * 0.6, t);
    this.y = damp(this.y, y0 + 0.03, 3.5, dt);
    const targetPitch = Math.atan2(yF - yB, 3) + this.speed * 0.012 + pull * 0.008;
    const targetRoll = Math.atan2(yL - yR, 1.2) + this.turnRate * this.speed * 0.05;
    this.pitch = damp(this.pitch, targetPitch, 3, dt);
    this.roll = damp(this.roll, targetRoll, 3, dt);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.set(0, this.heading, 0);
    this.body.position.y = this.y;
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');

    // Oars: blades sweep from aft to fore while pulling, and feather back above the water.
    const ph = this.oarPhase;
    const sweep = Math.cos(ph) * 0.5;
    const lift = pulling ? -0.015 : 0.11 + Math.sin(ph) * -0.14;
    for (let i = 0; i < 2; i++) {
      const o = this.oarGroups[i];
      const side = i === 0 ? -1 : 1;
      const shipYaw = 1.42; // laid along the gunwale, blades towards the stern
      const yawNow = THREE.MathUtils.lerp(shipYaw, sweep, this.oarOut);
      o.rotation.order = 'YXZ';
      o.rotation.y = side > 0 ? yawNow : -yawNow;
      const dip = THREE.MathUtils.lerp(-0.05, -0.285 + lift, this.oarOut);
      o.rotation.z = side > 0 ? dip : -dip;
    }
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) this.bladeWorld[i].set(2.1, 0, 0).applyMatrix4(this.oarGroups[i].matrixWorld);

    // Water feedback.
    for (let i = 0; i < 2; i++) {
      const was = this.lastPull[i];
      const p = this.bladeWorld[i];
      if (active && pulling && !was) {
        water.splash(p.x, p.z, 0.75, 0.2);
        if (i === 0 && this.onCatch) this.onCatch(power);
      }
      if (active && pulling) water.splash(p.x, p.z, 0.45, 0.012);
      if (active && !pulling && was && i === 0 && this.onDrip) this.onDrip();
      this.lastPull[i] = pulling && active;
    }
    this.rippleAcc += dt * Math.min(1, Math.abs(this.speed) * 1.4 + 0.1);
    if (this.rippleAcc > 0.09) {
      this.rippleAcc = 0;
      const s = Math.abs(this.speed);
      const sideX = -fwd.z;
      const sideZ = fwd.x;
      const k = 0.016 + s * 0.025;
      water.splash(this.x + fwd.x * 1.9, this.z + fwd.z * 1.9, 0.5, k);
      water.splash(this.x + fwd.x * 0.6 + sideX * 0.75, this.z + fwd.z * 0.6 + sideZ * 0.75, 0.42, k * 0.7);
      water.splash(this.x + fwd.x * 0.6 - sideX * 0.75, this.z + fwd.z * 0.6 - sideZ * 0.75, 0.42, k * 0.7);
      water.splash(this.x - fwd.x * 2.0, this.z - fwd.z * 2.0, 0.55, k * 0.8);
    }
  }

  /** Where each hand holds the oar, in world space. */
  handle(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(-0.56, 0, 0).applyMatrix4(this.oarGroups[i].matrixWorld);
  }

  /** Seat, in world space. Rower sits facing the stern. */
  seat(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0.38, -0.02).applyMatrix4(this.body.matrixWorld);
  }

  lanternWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0.42, sheer(0) + 0.9, 1.92).applyMatrix4(this.body.matrixWorld);
  }

  isNearMoor(): boolean {
    return Math.hypot(this.x - this.home.x, this.z - this.home.z) < 8;
  }
}
