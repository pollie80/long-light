// A clinker rowing boat: hull, oars, stern lantern, and gentle physics.
import * as THREE from 'three';
import { Builder, solid, TRS } from '../world/builder';
import { BOAT_MOOR, groundY, JETTY, swellAt } from '../world/land';
import { paintedMaterial } from '../render/shared';
import { clamp, damp } from '../core/noise';
import type { Water } from '../world/water';
import { CharacterLook, choiceOf, DEFAULT_LOOK } from './look';

const L_HULL = 4.2;
/** How fast the boat swings round, in radians a second. */
const TURN_RATE = 1.0;
/** How wide this hull is, and whether it comes to a point at the stern as well as the bow. */
let beamK = 1;
let pointedStern = false;
const halfBeam = (u: number) => beamK * 0.78 * (pointedStern ? Math.pow(Math.sin(Math.PI * clamp(u * 0.985 + 0.012, 0, 1)), 0.62) : Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.82 + 0.18)), 0.68));
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

/**
 * Where passengers sit, in the boat's own space, facing the bow and the rower. Everyone can fit, if not comfortably:
 * two on the stern seat's side, then the floor, then the bow.
 */
const PASSENGER_SEATS: [number, number, number][] = [
  [0, -0.03, 1.42],
  [0.3, -0.2, 0.58],
  [-0.3, -0.2, 0.58],
  [0.28, -0.2, -0.62],
  [-0.28, -0.2, -0.62],
  [0, 0.05, -1.08],
  [0, 0.14, 1.95],
];

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
  private oarDir = 1;
  onBump: (() => void) | null = null;
  onCatch: ((power: number) => void) | null = null;
  onDrip: (() => void) | null = null;

  /** Where a pet sits, in the boat's own space. */
  petSeat = new THREE.Vector3(0, 0.46, -1.05);
  private petSeatBase = new THREE.Vector3(0, 0.46, -1.05);
  /** A passenger's place, by their position in the queue. */
  passengerSeat(i: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = PASSENGER_SEATS[Math.max(0, i) % PASSENGER_SEATS.length];
    return out.set(x * this.beamNow, y, z);
  }

  /** The pet comes closer to be patted, along the middle of the boat. */
  petSeatAt(patting: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.petSeatBase).setZ(this.petSeatBase.z + (0.58 - 0.0) * patting);
  }

  /** Lantern colour, for the light it throws. */
  lanternRGB = new THREE.Color(1.0, 0.55, 0.2);
  private beamNow = 1;
  private hullMesh: THREE.Mesh | null = null;
  private lookKey = '';
  private lanternAt = new THREE.Vector3(0.42, sheer(0) + 0.9, 1.92);

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    this.applyLook(look);
    this.group.add(this.body);
    this.group.position.set(this.x, 0, this.z);
  }

  /** Rebuilds the boat to the given look. Nothing happens if none of the boat's own parts changed. */
  applyLook(look: CharacterLook) {
    const key = [look.boatStyle, look.boatHull, look.boatTrim, look.boatStripe, look.boatOars, look.boatLantern, look.boatFigure, look.boatFlag, look.boatSail].join('|');
    if (key === this.lookKey) return;
    this.lookKey = key;
    if (this.hullMesh) {
      this.body.remove(this.hullMesh);
      this.hullMesh.geometry.dispose();
    }
    for (const o of this.oarGroups) {
      this.body.remove(o);
      o.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    }
    this.oarGroups = [];

    const colour = (k: Parameters<typeof choiceOf>[0], id: string) => choiceOf(k, id).color ?? 0xffffff;
    const hullCol = colour('boatHull', look.boatHull);
    const trimCol = colour('boatTrim', look.boatTrim);
    const stripeCol = colour('boatStripe', look.boatStripe);
    const lightCol = colour('boatLantern', look.boatLantern);
    const style = look.boatStyle;
    const hasHull = style === 'dinghy' || style === 'canoe' || style === 'bangka';
    beamK = hasHull && style !== 'dinghy' ? 0.62 : 1;
    pointedStern = style === 'canoe' || style === 'bangka';
    this.beamNow = beamK;
    this.lanternRGB.set(lightCol);

    const b = new Builder(808);
    let lockX = 0;
    let lockY = 0;
    let lockZ = 0;
    let bowY = sheer(1);
    let bowZ = -L_HULL / 2;
    let sternX = 0.42 * Math.max(beamK, 0.72);
    let sternY = sheer(0);
    let sternZ = 1.92;
    if (hasHull) {
      const strakes = 7;
      const colOut = (i: number) => {
        if (i === strakes - 1) return trimCol;
        if (i === strakes - 2) return stripeCol;
        if (i <= 1) return 0x5a2c28; // antifoul below the water
        return hullCol;
      };
      const edges = [0, 0.16, 0.33, 0.48, 0.62, 0.75, 0.84, 1.0];
      for (let i = 0; i < strakes; i++) {
        for (const side of [-1, 1]) {
          b.add(strake(edges[i], edges[i + 1], side, 0, false), colOut(i), undefined, { jit: 0.06 });
          b.add(strake(edges[i], edges[i + 1], side, 0.028, true), 0x9c7a55, undefined, { jit: 0.12 });
        }
      }
      if (!pointedStern) {
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
        b.add(transom, hullCol, TRS(0, 0, L_HULL / 2 - 0.02), { jit: 0.05 });
        b.box(1.02, 0.07, 0.04, trimCol, TRS(0, sheer(0) - 0.06, L_HULL / 2 + 0.02), {}, 0.01);
        b.add(transom, 0x9c7a55, TRS(0, 0, L_HULL / 2 - 0.06), {});
      } else {
        sternZ = 1.62;
        sternY = sheer(0.1);
        sternX = 0.16;
      }
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
      const boards = beamK < 1 ? 3 : 5;
      for (let i = -boards; i <= boards; i++) {
        const x = i * 0.105;
        const zLen = (pointedStern ? 2.5 : 3.2) - Math.abs(i) * 0.2;
        b.box(0.095, 0.022, zLen, 0xa98a68, TRS(x, 0.13, pointedStern ? 0 : 0.18), { jit: 0.2 }, 0.006);
      }
      // Thwarts.
      const seat = (z: number, w: number, h: number) => {
        b.box(w * 2 * beamK, 0.04, 0.26, 0xb1926c, TRS(0, h, z), { jit: 0.1 }, 0.012);
        b.box(0.07, h - 0.13, 0.08, 0x6e5238, TRS(0, (h + 0.13) / 2, z), {}, 0.012);
      };
      seat(1.42, pointedStern ? 0.42 : 0.56, 0.36);
      seat(-0.02, 0.72, 0.36);
      seat(-1.05, 0.5, 0.44);
      // Tackle box and bucket, a coil of rope in the bow.
      b.box(0.34 * beamK, 0.16, 0.2, 0x3d6a70, TRS(0.32 * beamK, 0.23, 0.95, 0, 0.2, 0), {}, 0.015);
      b.box(0.2 * beamK, 0.02, 0.04, 0xc9b184, TRS(0.32 * beamK, 0.325, 0.95, 0, 0.2, 0), {}, 0.005);
      b.lathe([[0, 0], [0.11, 0], [0.14, 0.2], [0.13, 0.2], [0.095, 0.02], [0, 0.02]], 0xc9ab62, TRS(-0.36 * beamK, 0.14, 0.78), { jit: 0.1 });
      for (let r = 0; r < 3; r++) {
        b.add(new THREE.TorusGeometry(0.18 - r * 0.01, 0.022, 6, 16), 0xc4ab7d, TRS(0, 0.165 + r * 0.04, -1.46, Math.PI / 2, 0, 0), {});
      }
      // Oarlocks.
      const lock = hullPoint(0.4, 1);
      lockX = lock.x;
      lockY = lock.y;
      lockZ = lock.z;
      if (style === 'bangka') {
        // Two bamboo arms carrying a float on each side, the way a Philippine bangka stays upright.
        for (const z of [-1.3, 1.25]) {
          b.cyl(0.035, 0.035, 4.5, 0xc9b878, TRS(0, sheer(0.5) + 0.02, z, 0, 0, Math.PI / 2), { jit: 0.05 }, 7);
        }
        for (const side of [-1, 1]) {
          b.cyl(0.075, 0.075, 3.6, 0xc9b878, TRS(side * 2.15, 0.07, 0, Math.PI / 2, 0, 0), { jit: 0.05 }, 8);
          for (const z of [-1.3, 1.25]) b.box(0.045, 0.42, 0.045, 0xa89660, TRS(side * 2.15, 0.28, z, 0, 0, side * 0.2), {}, 0.01);
        }
      }
    } else if (style === 'raft') {
      // Lashed logs. The hull colour goes on the crate, there being no hull.
      for (let i = -3; i <= 3; i++) {
        b.cyl(0.155, 0.17, 4.0, 0x82633f, TRS(i * 0.29, 0.1, 0, Math.PI / 2, 0, 0), { jit: 0.2 }, 9);
      }
      for (const z of [-1.5, 0.9]) b.box(2.15, 0.05, 0.08, 0xc4ab7d, TRS(0, 0.26, z), {}, 0.01);
      b.box(0.62, 0.2, 0.42, hullCol, TRS(0, 0.27, 0), { jit: 0.1 }, 0.02);
      b.box(0.34, 0.26, 0.26, trimCol, TRS(0.55, 0.36, 1.2, 0, 0.3, 0), { jit: 0.1 }, 0.02);
      lockX = 0.98;
      lockY = 0.3;
      lockZ = 0.42;
      bowY = 0.28;
      bowZ = -1.9;
      sternX = -0.72;
      sternY = 0.25;
      sternZ = 1.7;
      this.petSeat.set(0, 0.27, -1.05);
    } else if (style === 'pizza') {
      // A large pizza, somehow seaworthy. Hull colour is the sauce; the rest is not negotiable.
      b.cyl(2.05, 2.0, 0.26, 0xd8a860, TRS(0, 0.08, 0), { jit: 0.04 }, 28);
      b.add(new THREE.TorusGeometry(2.0, 0.13, 8, 34), 0xc48a44, TRS(0, 0.22, 0, Math.PI / 2, 0, 0), { jit: 0.05 });
      b.cyl(1.88, 1.88, 0.03, 0xb8362a, TRS(0, 0.225, 0), {}, 28);
      b.cyl(1.82, 1.82, 0.03, 0xf0d060, TRS(0, 0.245, 0), { jit: 0.05 }, 28);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39996;
        const r = 0.55 + (i % 4) * 0.34;
        b.cyl(0.2, 0.2, 0.025, 0xa83226, TRS(Math.cos(a) * r, 0.27, Math.sin(a) * r), { jit: 0.1 }, 12);
      }
      b.box(0.5, 0.14, 0.36, 0xb1926c, TRS(0, 0.33, 0), { jit: 0.1 }, 0.02);
      lockX = 1.5;
      lockY = 0.32;
      lockZ = 0.42;
      bowY = 0.3;
      bowZ = -1.9;
      sternX = -0.72;
      sternY = 0.25;
      sternZ = 1.45;
      this.petSeat.set(0, 0.3, -1.05);
    } else {
      // The bathtub, enamelled, on four claw feet that are no help at all.
      b.lathe([[0, 0.05], [0.7, 0.05], [0.84, 0.3], [0.88, 0.62], [0.95, 0.66], [0.95, 0.72], [0.82, 0.7], [0.74, 0.3], [0.62, 0.16], [0, 0.16]], hullCol, TRS(0, 0, 0, 0, 0, 0, 1, 1, 2.1), { jit: 0.03 }, 24);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sphere(0.09, trimCol, TRS(sx * 0.5, 0.0, sz * 1.25), {}, 8, 6);
      for (const sx of [-1, 1]) b.cyl(0.03, 0.03, 0.22, trimCol, TRS(sx * 0.13, 0.82, 1.8), {}, 8);
      b.box(0.24, 0.04, 0.04, trimCol, TRS(0, 0.92, 1.8), {}, 0.01);
      b.box(0.5, 0.2, 0.36, 0xb1926c, TRS(0, 0.26, 0), { jit: 0.1 }, 0.02);
      lockX = 0.92;
      lockY = 0.68;
      lockZ = 0.42;
      bowY = 0.72;
      bowZ = -1.98;
      sternX = -0.34;
      sternY = 0.7;
      sternZ = 1.62;
    }
    if (hasHull) this.petSeat.set(0, 0.46, -1.05);
    if (style === 'tub') this.petSeat.set(0, 0.2, -1.05);
    this.petSeatBase.copy(this.petSeat);

    // Oarlocks stand wherever the oars do.
    for (const side of [-1, 1]) b.box(0.04, 0.1, 0.04, 0x2a2a30, TRS(lockX * side, lockY + 0.06, lockZ), {}, 0.01);

    // Stern lantern on a pole, for the dark rows home.
    b.box(0.035, 0.95, 0.035, 0x5a4230, TRS(sternX, sternY + 0.42, sternZ), {}, 0.01);
    b.box(0.13, 0.02, 0.13, 0x2a2a30, TRS(sternX, sternY + 0.8, sternZ), {}, 0.005);
    b.box(0.09, 0.13, 0.09, lightCol, TRS(sternX, sternY + 0.88, sternZ), { emis: 1 }, 0.005);
    b.add(new THREE.ConeGeometry(0.09, 0.08, 4), 0x2a2a30, TRS(sternX, sternY + 0.98, sternZ, 0, 0.78, 0));
    this.lanternAt.set(sternX, sternY + 0.9, sternZ);

    this.addFigure(b, look.boatFigure, bowY, bowZ);
    this.addFlag(b, look.boatFlag, -sternX, sternY, sternZ);
    this.addSail(b, look.boatSail, hasHull ? 0.2 : 0.25);

    this.hullMesh = solid(b.build(), this.mat);
    this.body.add(this.hullMesh);

    // Oars.
    const bladeCol = colour('boatOars', look.boatOars);
    for (const side of [-1, 1]) {
      const o = new THREE.Group();
      o.position.set(lockX * side, lockY + 0.1, lockZ);
      const ob = new Builder(30 + side);
      // Local x runs from the handle (inboard, negative) out to the blade.
      ob.cyl(0.02, 0.027, 2.65, 0xc4a578, TRS(0.72, 0, 0, 0, 0, Math.PI / 2), { jit: 0.08 }, 7);
      ob.box(0.5, 0.012, 0.13, bladeCol, TRS(2.1, 0, 0), {}, 0.005);
      ob.box(0.14, 0.03, 0.03, 0x7b5a3f, TRS(-0.58, 0, 0), {}, 0.008);
      const m = solid(ob.build(), this.mat);
      o.add(m);
      o.scale.x = side;
      this.oarGroups.push(o);
      this.body.add(o);
    }
    this.mat.side = THREE.DoubleSide;
  }

  private addFigure(b: Builder, kind: string, y: number, z: number) {
    const v = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz);
    if (kind === 'swan') {
      b.tube([v(0, y - 0.08, z + 0.15), v(0, y + 0.3, z - 0.08), v(0, y + 0.72, z - 0.02), v(0, y + 0.92, z - 0.14)], 0.055, 0xf2eee4, {}, 18, 8);
      b.sphere(0.085, 0xf2eee4, TRS(0, y + 0.96, z - 0.18, 0, 0, 0, 0.85, 0.85, 1.2));
      b.add(new THREE.ConeGeometry(0.035, 0.11, 6), 0xe08a2a, TRS(0, y + 0.94, z - 0.31, -1.75, 0, 0));
      for (const s of [-1, 1]) b.sphere(0.012, 0x15110f, TRS(s * 0.06, y + 0.98, z - 0.22), {}, 6, 4);
    } else if (kind === 'duck') {
      b.sphere(0.27, 0xf0c22e, TRS(0, y + 0.13, z - 0.02, 0, 0, 0, 0.9, 0.8, 1.15), { jit: 0.04 });
      b.sphere(0.17, 0xf0c22e, TRS(0, y + 0.43, z - 0.16));
      b.box(0.16, 0.05, 0.16, 0xe8742a, TRS(0, y + 0.4, z - 0.33), {}, 0.02);
      for (const s of [-1, 1]) b.sphere(0.024, 0x15110f, TRS(s * 0.085, y + 0.49, z - 0.27), {}, 6, 4);
    } else if (kind === 'dragon') {
      b.tube([v(0, y - 0.05, z + 0.2), v(0, y + 0.3, z - 0.06), v(0, y + 0.72, z - 0.1), v(0, y + 0.85, z - 0.3)], 0.08, 0x3d7a3a, {}, 18, 8);
      b.sphere(0.14, 0x3d7a3a, TRS(0, y + 0.88, z - 0.36, 0, 0, 0, 0.85, 0.85, 1.25));
      b.box(0.14, 0.07, 0.17, 0x3d7a3a, TRS(0, y + 0.82, z - 0.52), {}, 0.02);
      for (const s of [-1, 1]) {
        b.add(new THREE.ConeGeometry(0.028, 0.2, 5), 0xe8dcc0, TRS(s * 0.07, y + 1.03, z - 0.27, 0.7, 0, 0));
        b.sphere(0.024, 0xf2c12e, TRS(s * 0.095, y + 0.92, z - 0.44), { emis: 0.6 }, 6, 4);
      }
      for (let i = 0; i < 3; i++) b.add(new THREE.ConeGeometry(0.03, 0.1, 4), 0xb5392e, TRS(0, y + 0.42 + i * 0.2, z + 0.02 - i * 0.04, 0.2, 0, 0));
    } else if (kind === 'flamingo') {
      const pink = 0xf08ab0;
      b.sphere(0.32, pink, TRS(0, y + 0.1, z + 0.14, 0, 0, 0, 0.9, 0.7, 1.35), { jit: 0.03 });
      b.tube([v(0, y + 0.1, z - 0.18), v(0, y + 0.55, z - 0.34), v(0, y + 1.0, z - 0.14), v(0, y + 1.15, z - 0.36)], 0.075, pink, {}, 18, 8);
      b.sphere(0.12, pink, TRS(0, y + 1.17, z - 0.38));
      b.add(new THREE.ConeGeometry(0.05, 0.2, 7), 0x2a2a2a, TRS(0, y + 1.1, z - 0.53, -2.1, 0, 0));
      for (const s of [-1, 1]) b.sphere(0.018, 0x15110f, TRS(s * 0.09, y + 1.2, z - 0.42), {}, 6, 4);
    } else if (kind === 'skull') {
      b.box(0.05, 0.42, 0.05, 0x5a4230, TRS(0, y + 0.18, z + 0.04), {}, 0.01);
      b.sphere(0.15, 0xe9e2cf, TRS(0, y + 0.47, z + 0.02));
      b.box(0.14, 0.08, 0.1, 0xe9e2cf, TRS(0, y + 0.35, z - 0.06), {}, 0.02);
      for (const s of [-1, 1]) b.sphere(0.04, 0x15110f, TRS(s * 0.055, y + 0.48, z - 0.115), {}, 8, 6);
    }
  }

  /** A flat shape showing on both sides. */
  private flat(b: Builder, pts: THREE.Vector3[], color: number) {
    const pos: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1], pts[0], pts[i + 1], pts[i]]) pos.push(p.x, p.y, p.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, color, undefined, { jit: 0.03 });
  }

  private addFlag(b: Builder, kind: string, x: number, y: number, z: number) {
    if (kind === 'none') return;
    const h = 1.15;
    b.cyl(0.014, 0.018, h, 0x6e5238, TRS(x, y + h / 2, z), {}, 6);
    const top = y + h;
    const v = (dz: number, dy: number) => new THREE.Vector3(x, top + dy, z + dz);
    if (kind === 'rainbow') {
      const cols = [0xc23a2c, 0xe8862a, 0xefcf3a, 0x4f9a48, 0x3e78c8, 0x7a4fb0];
      cols.forEach((c, i) => this.flat(b, [v(0, -i * 0.06), v(0.56, -i * 0.06), v(0.56, -(i + 1) * 0.06), v(0, -(i + 1) * 0.06)], c));
    } else if (kind === 'sock') {
      this.flat(b, [v(0.04, 0), v(0.28, 0), v(0.28, -0.3), v(0.56, -0.42), v(0.56, -0.56), v(0.12, -0.56), v(0.04, -0.46)], 0xe8e4d8);
      this.flat(b, [v(0.04, 0.001), v(0.28, 0.001), v(0.28, -0.07), v(0.04, -0.07)], 0xc23a2c);
    } else if (kind === 'pirate') {
      this.flat(b, [v(0, 0), v(0.56, 0), v(0.56, -0.36), v(0, -0.36)], 0x17140f);
      b.sphere(0.06, 0xe9e2cf, TRS(x + 0.012, top - 0.15, z + 0.28), {}, 8, 6);
      b.sphere(0.06, 0xe9e2cf, TRS(x - 0.012, top - 0.15, z + 0.28), {}, 8, 6);
      for (const a of [0.6, -0.6]) b.box(0.012, 0.03, 0.26, 0xe9e2cf, TRS(x, top - 0.26, z + 0.28, a, 0, 0), {}, 0.005);
    } else {
      const col = kind === 'red' ? 0xc23a2c : 0x2f62b8;
      this.flat(b, [v(0, 0), v(0.72, -0.13), v(0, -0.28)], col);
    }
  }

  private addSail(b: Builder, kind: string, deck: number) {
    if (kind === 'none') return;
    const mastZ = -0.72;
    const h = 3.6;
    b.cyl(0.032, 0.048, h, 0x7b5a3f, TRS(0, deck + h / 2, mastZ), { jit: 0.06 }, 8);
    b.cyl(0.024, 0.024, 2.25, 0x7b5a3f, TRS(0, deck + 0.95, mastZ + 1.12, Math.PI / 2, 0, 0), {}, 7);
    const col = kind === 'red' ? 0xa83226 : kind === 'pirate' ? 0x201c1a : 0xe6dcc4;
    const foot = deck + 1.0;
    const v = (dz: number, y: number) => new THREE.Vector3(0.02, y, mastZ + dz);
    if (kind === 'pants') {
      // Y-fronts, hoisted with pride: a waistband across the yard, and a leg hole each side.
      const y0 = foot;
      const top = deck + h - 0.2;
      const mid = y0 + (top - y0) * 0.42;
      this.flat(b, [v(0.03, top), v(2.2, top), v(2.2, mid), v(1.5, y0), v(1.1, y0 + 0.22), v(0.72, y0), v(0.03, mid)], 0xf4f0e6);
      this.flat(b, [v(0.03, top), v(2.2, top), v(2.2, top - 0.2), v(0.03, top - 0.2)], 0x2f62b8);
      this.flat(b, [v(0.98, top - 0.24), v(1.24, top - 0.24), v(1.2, y0 + 0.5), v(1.02, y0 + 0.5)], 0xdcd6c8);
    } else if (kind === 'stripes') {
      const rows = 6;
      for (let i = 0; i < rows; i++) {
        const k0 = i / rows;
        const k1 = (i + 1) / rows;
        const y0 = foot + (h - 1.08) * k0;
        const y1 = foot + (h - 1.08) * k1;
        this.flat(b, [v(0.03, y0), v(2.2 * (1 - k0), y0), v(2.2 * (1 - k1) + 0.01, y1), v(0.03, y1)], i % 2 ? 0xf0e8d4 : 0xb5392e);
      }
    } else {
      this.flat(b, [v(0.03, foot), v(2.2, foot), v(0.03, deck + h - 0.08)], col);
    }
    if (kind === 'pirate') b.sphere(0.2, 0xe9e2cf, TRS(0.05, foot + 0.72, mastZ + 0.62, 0, 0, 0, 0.25, 1, 1), {}, 10, 8);
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
      this.speed *= 1 - clamp((d - 640) / 160, 0, 1) * 0.12;
    }
  }

  update(dt: number, t: number, forwardInput: number, turnInputRaw: number, oarsOut: boolean, water: Water) {
    // Backing water, left takes the stern left, the way anyone reversing expects.
    const turnInput = forwardInput < -0.05 ? -turnInputRaw : turnInputRaw;
    this.oarOut = damp(this.oarOut, oarsOut ? 1 : 0, 4, dt);
    const active = oarsOut && (Math.abs(forwardInput) > 0.05 || Math.abs(turnInput) > 0.05);
    this.rowing = active;
    // Backing water is the stroke run the other way round: blades in at the bow end, pushing towards the stern.
    if (forwardInput < -0.05) this.oarDir = -1;
    else if (forwardInput > 0.05) this.oarDir = 1;
    const TWO_PI = Math.PI * 2;
    if (active || (((this.oarPhase % TWO_PI) + TWO_PI) % TWO_PI) < Math.PI) {
      this.oarPhase += (this.oarDir * dt * TWO_PI * Math.min(3.2, Math.sqrt(this.power))) / 2.35;
      this.oarPhase = ((this.oarPhase % TWO_PI) + TWO_PI) % TWO_PI;
    }
    const pulling = Math.sin(this.oarPhase) > 0;
    const pull = Math.max(0, Math.sin(this.oarPhase));
    let thrust = 0;
    if (active) {
      const leftP = clamp(forwardInput + turnInput * 0.55, -1, 1);
      const rightP = clamp(forwardInput - turnInput * 0.55, -1, 1);
      thrust = ((leftP + rightP) * 0.5 * pull) * 1.9 * this.power;
    }
    this.speed += thrust * dt;
    // Thrust up and water drag down by the same factor scales the top speed by exactly that factor.
    this.speed *= Math.exp(-dt * (0.42 + (Math.abs(this.speed) * 0.1) / this.power));
    // Turns as soon as you ask, whatever the oars are doing, and at the same rate at any speed.
    const wantTurn = active ? -turnInput * TURN_RATE : 0;
    this.turnRate += (wantTurn - this.turnRate) * (1 - Math.exp(-dt * 5));
    this.heading += this.turnRate * dt;

    const fwd = this.forward();
    // Small steps, so a fast boat can't jump clean over a jetty or a spit of land.
    const steps = Math.min(12, Math.max(1, Math.ceil((Math.abs(this.speed) * dt) / 0.6)));
    for (let i = 0; i < steps; i++) {
      const was = [this.x, this.z];
      this.x += (fwd.x * this.speed * dt) / steps;
      this.z += (fwd.z * this.speed * dt) / steps;
      this.collide();
      // Ashore at speed: a bump, not a drive up the beach.
      const end = Math.sign(this.speed || 1) * 2.1;
      if (Math.abs(this.speed) > 3 && groundY(this.x + fwd.x * end, this.z + fwd.z * end) > -0.12) {
        this.x = was[0];
        this.z = was[1];
        this.speed *= -0.22;
        this.onBump?.();
        break;
      }
    }
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
    // At speed the bow rides up, but only so far.
    const planing = clamp(this.speed, -2, 11);
    const targetPitch = Math.atan2(yF - yB, 3) + planing * 0.012 + pull * 0.008;
    const targetRoll = Math.atan2(yL - yR, 1.2) + clamp(this.turnRate * planing * 0.05, -0.16, 0.16);
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
      const s = Math.min(Math.abs(this.speed), 7);
      // The leading end, whichever way the boat is going.
      const ahead = this.speed < -0.05 ? -1 : 1;
      const fx = fwd.x * ahead;
      const fz = fwd.z * ahead;
      const sideX = -fz;
      const sideZ = fx;
      const k = 0.016 + s * 0.025;
      water.splash(this.x + fx * 1.9, this.z + fz * 1.9, 0.5, k);
      water.splash(this.x + fx * 0.6 + sideX * 0.75, this.z + fz * 0.6 + sideZ * 0.75, 0.42, k * 0.7);
      water.splash(this.x + fx * 0.6 - sideX * 0.75, this.z + fz * 0.6 - sideZ * 0.75, 0.42, k * 0.7);
      water.splash(this.x - fx * 2.0, this.z - fz * 2.0, 0.55, k * 0.8);
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
    return out.copy(this.lanternAt).applyMatrix4(this.body.matrixWorld);
  }

  isNearMoor(): boolean {
    return Math.hypot(this.x - this.home.x, this.z - this.home.z) < 8;
  }
}
