// The fisher: straw hat, mustard coat, red scarf. Limbs are a hand-animated rig with two-bone arms.
import * as THREE from 'three';
import { Builder, solid, TRS } from '../world/builder';
import { L, paintedMaterial } from '../render/shared';
import { buildGun, GunKind, GUNS } from '../game/guns';
import { damp } from '../core/noise';
import { CharacterLook, figureKey, DEFAULT_LOOK } from './look';
import { buildBody } from './outfit';

const UP_LEN = 0.29;
const FO_LEN = 0.27;

export type PoseMode = 'stand' | 'row' | 'boatSit' | 'dockSit' | 'benchSit' | 'groundSit';

export interface PoseInput {
  mode: PoseMode;
  speed: number; // metres per second, for the walk cycle
  /** Oar handles in world space, used while rowing. */
  handleL?: THREE.Vector3;
  handleR?: THREE.Vector3;
  rowLean?: number; // -1 reaching forward, 1 leaning back
  /** Fishing. */
  fishing: boolean;
  rodDir?: THREE.Vector3; // world-space aim of the rod
  rodBend?: number;
  reelSpin?: number;
  twist?: number; // torso turn, used to face the cast while seated
  beerOut?: number; // 0 in the basket, 1 in the left hand
  beerLift?: number; // 0 held at the chest, 1 at the mouth
  air?: boolean; // off the ground, jumping
  gun?: boolean; // a gun up, pointing along rodDir
  gunKind?: GunKind; // which one: a pistol is held out in both hands, the others to the shoulder
  recoil?: number; // 1 the instant it fires, falling to 0
  pat?: number; // 0 upright, 1 crouched over the pet with a hand on it
  patAt?: THREE.Vector3; // the top of the pet's head, in world space
  cheers?: number; // 0 to 1, bottle raised to clink
  lounge?: number; // 0 upright, 1 leant right back to watch the sky
}

const Y_NEG = new THREE.Vector3(0, -1, 0);
const GUN_AXIS = new THREE.Vector3(0, 0, -1);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

export class Fisher {
  root = new THREE.Group();
  mat = paintedMaterial();
  hips = new THREE.Group();
  spine = new THREE.Group();
  head = new THREE.Group();
  thigh: THREE.Group[] = [];
  shin: THREE.Group[] = [];
  upper: THREE.Group[] = [];
  fore: THREE.Group[] = [];
  scarfA = new THREE.Group();
  scarfB = new THREE.Group();
  bottle = new THREE.Group();
  rodBase = new THREE.Vector3();
  rodTip = new THREE.Vector3();
  private rodGeo: THREE.BufferGeometry;
  private rodMesh: THREE.Mesh;
  private walkPhase = 0;
  private breath = 0;
  private a = { lean: 0, thigh: 0, shin: 0, seat: 0, dangle: 0, air: 0, land: 0 };
  private wasInAir = false;
  /** The gun in hand: laid along -z from the grip, placed in world space like the rod. */
  gun = new THREE.Group();
  gunKind: GunKind = 'pistol';
  private gunMesh: THREE.Mesh | null = null;
  private gunKey = '';
  private rodKey = '';
  /** Seen from inside the head: the head is left out of this player's own view, but not its reflection. */
  private fp = false;
  gunTip = new THREE.Vector3();
  private gunDirSmooth = new THREE.Vector3(0, 0, -1);
  private gunMat = paintedMaterial();
  private figure = '';
  private scarfVel = 0;
  private scarfAng = 0;
  private prevPos = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private rodDirSmooth = new THREE.Vector3(0, 0.5, 0.8);
  private rodBendSmooth = 0;
  private headLook = 0;
  onStep: ((foot: number) => void) | null = null;
  private lastSin = 0;

  /** Spins on a propeller hat. */
  spinner = new THREE.Group();
  /** Hangs from the shoulders and swings, for capes. */
  capeGroup = new THREE.Group();
  look: CharacterLook = { ...DEFAULT_LOOK };
  private k = 1;
  private skinMeshes: THREE.Mesh[] = [];

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    const build = (fn: (b: Builder) => void, seed = 1) => {
      const b = new Builder(seed);
      fn(b);
      return solid(b.build(), this.mat);
    };

    this.hips.position.y = 0.96;
    this.root.add(this.hips);
    this.hips.add(this.spine);
    this.spine.position.y = 0.05;
    this.scarfA.position.set(0.05, 0.45, 0.09);
    this.spine.add(this.scarfA);
    this.scarfB.position.set(0, -0.2, 0);
    this.scarfA.add(this.scarfB);
    this.head.position.y = 0.535;
    this.spine.add(this.head);
    this.spinner.position.set(0, 0.3, 0.004);
    this.head.add(this.spinner);
    this.capeGroup.position.set(0, 0.44, 0.14);
    this.spine.add(this.capeGroup);

    for (const side of [-1, 1]) {
      const up = new THREE.Group();
      up.position.set(side * 0.185, 0.355, 0);
      this.spine.add(up);
      const fo = new THREE.Group();
      fo.position.y = -UP_LEN;
      up.add(fo);
      this.upper.push(up);
      this.fore.push(fo);
    }
    for (const side of [-1, 1]) {
      const th = new THREE.Group();
      th.position.set(side * 0.082, -0.03, 0);
      this.hips.add(th);
      const sh = new THREE.Group();
      sh.position.y = -0.45;
      th.add(sh);
      this.thigh.push(th);
      this.shin.push(sh);
    }

    // A brown bottle, carried in the left hand. Its origin is where the fingers grip it.
    this.bottle.add(build((b) => {
      b.lathe([[0, -0.1], [0.04, -0.1], [0.043, -0.09], [0.043, 0.06], [0.038, 0.085], [0.018, 0.125], [0.016, 0.175], [0.019, 0.178], [0.019, 0.19], [0, 0.19]], 0x8a4a18, undefined, {}, 14);
      b.cyl(0.0445, 0.0445, 0.075, 0xe9dcb4, TRS(0, -0.03, 0), {}, 14);
      b.cyl(0.0205, 0.0205, 0.03, 0xc9a24a, TRS(0, 0.168, 0), {}, 10);
    }, 31));
    this.bottle.position.y = -FO_LEN - 0.03;
    this.bottle.visible = false;
    this.fore[0].add(this.bottle);

    // Rod: rebuilt each frame as it bends, parented to the scene through the root.
    this.rodGeo = new THREE.BufferGeometry();
    const RINGS = 16;
    const SIDES = 5;
    const count = (RINGS + 1) * SIDES;
    this.rodGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.rodGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const cols = new Float32Array(count * 3);
    const em = new Float32Array(count);
    const cA = new THREE.Color(0x4a3428);
    const cB = new THREE.Color(0xa9835a);
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / SIDES);
      const c = r < 3 ? cA : cB;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    this.rodGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.rodGeo.setAttribute('aEmis', new THREE.BufferAttribute(em, 1));
    const idx: number[] = [];
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < SIDES; s++) {
        const a = r * SIDES + s;
        const b = r * SIDES + (s + 1) % SIDES;
        const c = a + SIDES;
        const d = b + SIDES;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.rodGeo.setIndex(idx);
    this.rodMesh = solid(this.rodGeo, this.mat, false);
    this.rodMesh.frustumCulled = false;
    this.applyLook(look);
    this.gun.visible = false;
  }

  /** Which gun is in hand. Rebuilt only when the gun or its finish changes. */
  setGun(kind: GunKind) {
    this.gunKind = kind;
    const key = `${kind}:${this.look.gunFinish}`;
    if (key === this.gunKey) return;
    this.gunKey = key;
    if (this.gunMesh) {
      this.gun.remove(this.gunMesh);
      this.gunMesh.geometry.dispose();
    }
    this.gunMesh = solid(buildGun(kind, this.look.gunFinish), this.gunMat, false);
    this.gun.add(this.gunMesh);
  }

  /** The rod's two colours, grip and blank, or a pattern along it. */
  private paintRod(id: string) {
    if (id === this.rodKey) return;
    this.rodKey = id;
    const P: Record<string, [number, number, number]> = {
      cane: [0x4a3428, 0xa9835a, 0], carbon: [0x1c1c20, 0x34383f, 0], glass: [0xc8a070, 0xe8e2d4, 0], red: [0xc8a070, 0xa83226, 0],
      green: [0x262626, 0x2f5a36, 0], gold: [0x2a2622, 0xd9aa3a, 0.12], glow: [0x1c1c20, 0x7dffa0, 0.9], stick: [0x4e3a2a, 0x6e5438, 0],
    };
    const cols = this.rodGeo.attributes.color as THREE.BufferAttribute;
    const em = this.rodGeo.attributes.aEmis as THREE.BufferAttribute;
    const SIDES = 5;
    const c = new THREE.Color();
    const p = P[id] ?? P.cane;
    for (let i = 0; i < cols.count; i++) {
      const r = Math.floor(i / SIDES);
      let e = r < 3 ? 0 : p[2];
      if (id === 'candy') c.set(r < 3 ? 0xf4f0e8 : Math.floor(r / 1.5) % 2 ? 0xd8342a : 0xf4f0e8);
      else if (id === 'rainbow') {
        if (r < 3) c.set(0x262626);
        else c.setHSL((r - 3) / 13, 0.8, 0.55);
        e = r < 3 ? 0 : 0.15;
      } else c.set(r < 3 ? p[0] : p[1]);
      cols.setXYZ(i, c.r, c.g, c.b);
      em.setX(i, e);
    }
    cols.needsUpdate = true;
    em.needsUpdate = true;
  }

  /** The camera is in the head: leave the head out of this view, but keep it in the water's reflection. */
  setFirstPerson(on: boolean) {
    if (on === this.fp) return;
    this.fp = on;
    this.layerHead();
  }

  private layerHead() {
    this.head.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (this.fp) {
        m.layers.disable(L.OPAQUE);
        m.layers.enable(L.REFLECT_ONLY);
      } else {
        m.layers.enable(L.OPAQUE);
        m.layers.disable(L.REFLECT_ONLY);
      }
    });
  }

  /** Replaces every mesh on the rig with the given look. Cheap enough to call on each wardrobe click. */
  applyLook(look: CharacterLook) {
    this.look = look;
    this.paintRod(look.rod);
    this.setGun(this.gunKind);
    const key = figureKey(look);
    if (key === this.figure) return;
    this.figure = key;
    for (const m of this.skinMeshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    this.skinMeshes = [];
    const parts = buildBody(look);
    const put = (geo: THREE.BufferGeometry | null, parent: THREE.Object3D, sx = 1, sz = 1) => {
      if (!geo) return;
      const m = solid(geo, this.mat);
      m.scale.set(sx, 1, sz);
      parent.add(m);
      this.skinMeshes.push(m);
    };
    const w = look.build;
    put(parts.hips, this.hips, w, w);
    put(parts.torso, this.spine, w, w);
    put(parts.neck, this.spine);
    put(parts.scarfA, this.scarfA);
    put(parts.scarfB, this.scarfB);
    put(parts.head, this.head);
    put(parts.spin, this.spinner);
    put(parts.cape, this.capeGroup, Math.max(1, w));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      put(parts.upper[i], this.upper[i]);
      put(parts.fore[i], this.fore[i]);
      put(parts.thigh[i], this.thigh[i]);
      put(parts.shin[i], this.shin[i]);
      this.upper[i].position.x = side * (0.185 + (w - 1) * 0.09);
      this.thigh[i].position.x = side * (0.082 + (w - 1) * 0.045);
    }
    this.head.scale.setScalar(look.head);
    this.head.position.y = 0.535 - (look.head - 1) * 0.01;
    this.k = look.height;
    this.root.scale.setScalar(look.height);
    if (this.fp) this.layerHead();
  }

  /** Standing height of the fisher's eyes above the feet. */
  get eyeHeight(): number {
    return (1.62 + (this.look.head - 1) * 0.08) * this.k;
  }

  /** The rod lives in world space, so it must be added to the scene separately. */
  get rod(): THREE.Mesh {
    return this.rodMesh;
  }

  private updateRod(base: THREE.Vector3, dir: THREE.Vector3, bend: number) {
    const LEN = 2.75;
    const RINGS = 16;
    const SIDES = 5;
    const p = this.rodGeo.attributes.position as THREE.BufferAttribute;
    const n = this.rodGeo.attributes.normal as THREE.BufferAttribute;
    const side = v1.crossVectors(dir, v2.set(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const up = v2.crossVectors(side, dir).normalize();
    const pos = new THREE.Vector3();
    const prev = new THREE.Vector3().copy(base);
    const tang = new THREE.Vector3();
    const tip = new THREE.Vector3();
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS;
      pos.copy(base).addScaledVector(dir, t * LEN);
      pos.y -= bend * t * t * t * 1.05;
      pos.addScaledVector(dir, -bend * t * t * 0.12);
      tang.copy(pos).sub(prev);
      if (tang.lengthSq() < 1e-6) tang.copy(dir);
      tang.normalize();
      prev.copy(pos);
      if (r === RINGS) tip.copy(pos);
      const rad = THREE.MathUtils.lerp(0.024, 0.0085, t);
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        const nx = side.x * Math.cos(a) + up.x * Math.sin(a);
        const ny = side.y * Math.cos(a) + up.y * Math.sin(a);
        const nz = side.z * Math.cos(a) + up.z * Math.sin(a);
        p.setXYZ(r * SIDES + s, pos.x + nx * rad, pos.y + ny * rad, pos.z + nz * rad);
        n.setXYZ(r * SIDES + s, nx, ny, nz);
      }
    }
    p.needsUpdate = true;
    n.needsUpdate = true;
    this.rodTip.copy(tip);
    this.rodBase.copy(base);
  }

  private shoulderWorld(side: number, out: THREE.Vector3) {
    return out.setFromMatrixPosition(this.upper[side].matrixWorld);
  }

  /** Two-bone arm reach, keeping the elbow towards `pole`. */
  private reach(i: number, target: THREE.Vector3, pole: THREE.Vector3) {
    const up = this.upper[i];
    const fo = this.fore[i];
    const sh = this.shoulderWorld(i, new THREE.Vector3());
    const toT = new THREE.Vector3().subVectors(target, sh);
    let d = toT.length();
    const a = UP_LEN * this.k;
    const b = (FO_LEN + 0.03) * this.k;
    d = THREE.MathUtils.clamp(d, 0.08, a + b - 0.002);
    const dir = toT.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = v3.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = new THREE.Vector3().copy(sh).addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
    const hand = new THREE.Vector3().copy(sh).addScaledVector(dir, d);

    const upDir = new THREE.Vector3().subVectors(elbow, sh).normalize();
    const foDir = new THREE.Vector3().subVectors(hand, elbow).normalize();
    const parentQ = up.parent!.getWorldQuaternion(q1);
    const upWorld = new THREE.Quaternion().setFromUnitVectors(Y_NEG, upDir);
    up.quaternion.copy(parentQ.clone().invert().multiply(upWorld));
    const foWorld = new THREE.Quaternion().setFromUnitVectors(Y_NEG, foDir);
    fo.quaternion.copy(q2.copy(upWorld).invert().multiply(foWorld));
    up.updateMatrixWorld(true);
  }

  update(dt: number, t: number, pose: PoseInput) {
    this.breath += dt;
    const worldPos = new THREE.Vector3();
    this.root.getWorldPosition(worldPos);
    if (dt > 0) this.velocity.subVectors(worldPos, this.prevPos).divideScalar(dt);
    this.prevPos.copy(worldPos);

    const sitting = pose.mode !== 'stand';
    const speed = sitting ? 0 : pose.speed;
    const walkAmt = Math.min(1, speed / 1.6);

    // Past a run the legs stop speeding up, or a fast setting turns them into a blur.
    this.walkPhase += dt * (2.5 + Math.min(speed, 7) * 2.45);
    const ph = this.walkPhase;
    const s = Math.sin(ph);
    const inAir = !!pose.air && !sitting;
    if (this.wasInAir && !inAir) this.a.land = 1;
    this.wasInAir = inAir;
    this.a.air = damp(this.a.air, inAir ? 1 : 0, 16, dt);
    this.a.land = Math.max(0, this.a.land - dt * 5);
    const air = this.a.air;
    const land = this.a.land * this.a.land;
    const stride = walkAmt * (1 - air);
    if (!sitting && !inAir && walkAmt > 0.15 && (s > 0) !== (this.lastSin > 0)) this.onStep?.(s > 0 ? 0 : 1);
    this.lastSin = s;

    // Blend towards the pose's seated-ness.
    const seatedT = sitting ? 1 : 0;
    this.a.seat = damp(this.a.seat, seatedT, 7, dt);

    const breathe = Math.sin(this.breath * 1.3) * 0.012;
    const lounge = sitting ? pose.lounge ?? 0 : 0;
    if (pose.gunKind && pose.gunKind !== this.gunKind) this.setGun(pose.gunKind);
    const longGun = !!pose.gun && GUNS[this.gunKind].long;

    if (!sitting) {
      const bob = Math.abs(Math.cos(ph)) * 0.03 * walkAmt;
      const crouch = pose.pat ?? 0;
      this.hips.position.y = 0.96 + bob * (1 - air) - 0.012 * walkAmt - land * 0.06 - crouch * 0.4;
      this.hips.rotation.set(0, Math.sin(ph) * 0.05 * walkAmt, Math.sin(ph) * 0.03 * walkAmt);
      this.spine.rotation.set(-0.05 - walkAmt * 0.09 + breathe - air * 0.1 - land * 0.22 - crouch * 0.72, -Math.sin(ph) * 0.1 * stride, -Math.sin(ph) * 0.02 * stride);
      this.thigh[0].rotation.set(s * 0.58 * stride + air * 0.85 + land * 0.4 + crouch * 1.28, 0, -0.02);
      this.thigh[1].rotation.set(-s * 0.58 * stride + air * 0.5 + land * 0.4 + crouch * 1.1, 0, 0.02);
      const knee = (x: number) => -(0.1 + 0.85 * Math.max(0, Math.sin(x - 0.9)) * stride);
      this.shin[0].rotation.set(knee(ph + Math.PI) - air * 1.25 - land * 0.7 - crouch * 2.0, 0, 0);
      this.shin[1].rotation.set(knee(ph) - air * 0.95 - land * 0.7 - crouch * 1.7, 0, 0);
    } else if (pose.mode === 'row' || pose.mode === 'boatSit') {
      this.hips.position.y = 0.53 / this.k;
      const lean = pose.mode === 'row' ? pose.rowLean ?? 0 : -0.1;
      this.hips.rotation.set(lean * 0.12, (pose.twist ?? 0) * 0.35, 0);
      this.spine.rotation.set(lean * 0.34 - 0.05 + breathe + lounge * 0.5, (pose.twist ?? 0) * 0.55, 0);
      // Leant back, the legs go out long across the boards.
      this.thigh[0].rotation.set(1.28 + lounge * 0.2, 0, -0.1 - lounge * 0.06);
      this.thigh[1].rotation.set(1.28 + lounge * 0.2, 0, 0.1 + lounge * 0.06);
      this.shin[0].rotation.set(-1.25 + lounge * 0.75, 0, 0);
      this.shin[1].rotation.set(-1.25 + lounge * 0.6, 0, 0);
    } else if (pose.mode === 'groundSit') {
      // Down on the grass or the sand, legs out long, crossed at the ankles once leant right back.
      this.hips.position.y = 0.11 / this.k;
      this.hips.rotation.set(0, 0, 0);
      this.spine.rotation.set(0.1 + lounge * 0.38 + breathe, 0, 0);
      this.thigh[0].rotation.set(1.5, 0, -0.1 + lounge * 0.12);
      this.thigh[1].rotation.set(1.5 + lounge * 0.09, 0, 0.1 - lounge * 0.22);
      this.shin[0].rotation.set(-0.05, 0, 0);
      this.shin[1].rotation.set(-0.05 - lounge * 0.04, 0, 0);
    } else if (pose.mode === 'dockSit') {
      this.hips.position.y = 0.06 / this.k;
      this.hips.rotation.set(0, 0, 0);
      this.spine.rotation.set(-0.12 + breathe + lounge * 0.42, (pose.twist ?? 0) * 0.3, 0);
      const k = Math.sin(this.breath * 0.7);
      this.thigh[0].rotation.set(1.42, 0, -0.08);
      this.thigh[1].rotation.set(1.42, 0, 0.08);
      this.shin[0].rotation.set(-1.15 + k * 0.17, 0, 0);
      this.shin[1].rotation.set(-1.15 - k * 0.17, 0, 0);
    } else {
      this.hips.position.y = 0.48 / this.k;
      this.hips.rotation.set(0, 0, 0);
      this.spine.rotation.set(0.16 + breathe + lounge * 0.3, 0, 0);
      this.thigh[0].rotation.set(1.45, 0, -0.06);
      this.thigh[1].rotation.set(1.45, 0, 0.06);
      this.shin[0].rotation.set(-1.4, 0, 0);
      this.shin[1].rotation.set(-1.4, 0, 0);
    }

    this.spine.rotation.x += (pose.beerLift ?? 0) * 0.07;
    // Sitting down, there's only leaning over to do.
    if (sitting) this.spine.rotation.x -= (pose.pat ?? 0) * 0.62;
    // A long gun: side on to the shot, the left shoulder forward.
    if (longGun) this.spine.rotation.y -= 0.55;
    this.root.updateMatrixWorld(true);

    // Arms and rod.
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const chestPos = new THREE.Vector3(0, 0.26, 0).applyMatrix4(this.spine.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rootQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ);
    const worldUp = new THREE.Vector3(0, 1, 0);

    this.gun.visible = !!pose.gun;
    this.rod.visible = !pose.gun;
    if (pose.gun && pose.rodDir && longGun) {
      // Butt in the pocket of the right shoulder, cheek down on the stock, the left hand out along the fore-end.
      this.gunDirSmooth.lerp(pose.rodDir, 1 - Math.exp(-dt * 24)).normalize();
      const aim = this.gunDirSmooth;
      const kick = pose.recoil ?? 0;
      const spec = GUNS[this.gunKind];
      const up = new THREE.Vector3().copy(aim).addScaledVector(worldUp, kick * 0.22).normalize();
      const grip = this.shoulderWorld(1, new THREE.Vector3()).addScaledVector(right, -0.06).addScaledVector(worldUp, 0.03).addScaledVector(up, 0.3 - kick * 0.08);
      this.reach(1, grip.clone().addScaledVector(worldUp, -0.04), new THREE.Vector3().copy(right).multiplyScalar(0.7).addScaledVector(worldUp, -0.8));
      const fore = grip.clone().addScaledVector(up, this.gunKind === 'rifle' ? 0.27 : 0.22).addScaledVector(worldUp, -0.03);
      this.reach(0, fore, new THREE.Vector3().copy(right).multiplyScalar(-0.4).addScaledVector(worldUp, -0.9));
      this.gun.position.copy(grip);
      this.gun.quaternion.setFromUnitVectors(GUN_AXIS, up);
      this.gunTip.copy(grip).addScaledVector(up, spec.length).addScaledVector(worldUp, spec.muzzleUp);
    } else if (pose.gun && pose.rodDir) {
      // Held out in both hands, at the height of the eyes. It's heavy: the shot throws it well up and back.
      this.gunDirSmooth.lerp(pose.rodDir, 1 - Math.exp(-dt * 24)).normalize();
      const aim = this.gunDirSmooth;
      const kick = pose.recoil ?? 0;
      const shoulderR = this.shoulderWorld(1, new THREE.Vector3());
      const shoulderL = this.shoulderWorld(0, new THREE.Vector3());
      const middle = shoulderR.clone().lerp(shoulderL, 0.42);
      const grip = middle.addScaledVector(aim, 0.56 - kick * 0.09).addScaledVector(worldUp, 0.05);
      const cup = grip.clone().addScaledVector(right, -0.035).addScaledVector(worldUp, -0.05).addScaledVector(aim, 0.012);
      this.reach(1, grip.clone().addScaledVector(worldUp, -0.04), new THREE.Vector3().copy(right).multiplyScalar(0.8).addScaledVector(worldUp, -0.7));
      this.reach(0, cup, new THREE.Vector3().copy(right).multiplyScalar(-0.8).addScaledVector(worldUp, -0.7));
      this.gun.position.copy(grip);
      const up = new THREE.Vector3().copy(aim).addScaledVector(worldUp, kick * 0.42).normalize();
      this.gun.quaternion.setFromUnitVectors(GUN_AXIS, up);
      this.gunTip.copy(grip).addScaledVector(up, 0.3).addScaledVector(worldUp, 0.066);
    } else if (pose.mode === 'row' && !pose.fishing && pose.handleL && pose.handleR) {
      // The rod stows along the thwart while rowing.
      this.reach(0, pose.handleL, new THREE.Vector3().copy(right).multiplyScalar(-0.8).addScaledVector(worldUp, -0.6));
      // With a bottle out the oars are shipped, and the free hand rests on a knee.
      const knee = new THREE.Vector3(0.1, -0.02, -0.36).applyMatrix4(this.hips.matrixWorld);
      const rightTarget = pose.handleR.clone().lerp(knee, pose.beerOut ?? 0);
      this.reach(1, rightTarget, new THREE.Vector3().copy(right).multiplyScalar(0.8).addScaledVector(worldUp, -0.6));
      const stowBase = new THREE.Vector3(0.48, 0.06, 0.2).applyMatrix4(this.root.matrixWorld);
      const stowDir = new THREE.Vector3(-0.07, 0.03, 1).applyQuaternion(rootQ).normalize();
      this.rodDirSmooth.copy(stowDir);
      this.updateRod(stowBase, stowDir, 0);
    } else if (pose.fishing && pose.rodDir) {
      this.rodDirSmooth.lerp(pose.rodDir, 1 - Math.exp(-dt * 14)).normalize();
      this.rodBendSmooth = damp(this.rodBendSmooth, pose.rodBend ?? 0, 8, dt);
      // Hands hold the rod in front of the chest.
      const yawF = new THREE.Vector3(this.rodDirSmooth.x, 0, this.rodDirSmooth.z);
      if (yawF.lengthSq() < 1e-4) yawF.copy(fwd);
      yawF.normalize();
      const base = new THREE.Vector3().copy(chestPos).addScaledVector(yawF, 0.26).addScaledVector(worldUp, -0.13).addScaledVector(right, 0.06);
      const spin = pose.reelSpin ?? 0;
      const reelCentre = new THREE.Vector3().copy(base).addScaledVector(this.rodDirSmooth, 0.28);
      const reelSide = new THREE.Vector3().crossVectors(this.rodDirSmooth, worldUp).normalize();
      const reelUp = new THREE.Vector3().crossVectors(reelSide, this.rodDirSmooth).normalize();
      const lHand = new THREE.Vector3().copy(reelCentre).addScaledVector(reelSide, -0.055 + Math.cos(spin) * 0.05).addScaledVector(reelUp, Math.sin(spin) * 0.05 - 0.03);
      this.reach(1, base, new THREE.Vector3().copy(right).multiplyScalar(0.9).addScaledVector(worldUp, -0.5));
      this.reach(0, lHand, new THREE.Vector3().copy(right).multiplyScalar(-0.9).addScaledVector(worldUp, -0.5));
      this.updateRod(base, this.rodDirSmooth, this.rodBendSmooth);
    } else if (lounge > 0.25) {
      if (pose.mode === 'groundSit' || pose.mode === 'dockSit') {
        // Leant back on both hands, palms flat behind.
        const base = new THREE.Vector3().setFromMatrixPosition(this.hips.matrixWorld);
        for (const i of [0, 1]) {
          const side = i === 0 ? -1 : 1;
          const at = base.clone().addScaledVector(fwd, -0.3).addScaledVector(right, side * 0.25);
          at.y = worldPos.y + 0.03;
          this.reach(i, at, new THREE.Vector3().copy(right).multiplyScalar(side * 0.4).addScaledVector(fwd, -1));
        }
      } else {
        // Hands laced behind the head, elbows out.
        const back = new THREE.Vector3().setFromMatrixPosition(this.head.matrixWorld).addScaledVector(fwd, -0.13).addScaledVector(worldUp, 0.07);
        for (const i of [0, 1]) {
          const side = i === 0 ? -1 : 1;
          this.reach(i, back.clone().addScaledVector(right, side * 0.06), new THREE.Vector3().copy(right).multiplyScalar(side).addScaledVector(worldUp, 0.5).addScaledVector(fwd, 0.25));
        }
      }
      // The rod lies down beside, or along the thwart in a boat.
      const inBoat = pose.mode === 'boatSit' || pose.mode === 'row';
      const base = inBoat ? new THREE.Vector3(0.48, 0.06, 0.2).applyMatrix4(this.root.matrixWorld) : new THREE.Vector3(0.42, pose.mode === 'groundSit' ? -0.06 : -0.5, 0.1).applyMatrix4(this.hips.matrixWorld);
      const rodD = (inBoat ? new THREE.Vector3(-0.07, 0.03, 1) : new THREE.Vector3(0.1, pose.mode === 'groundSit' ? 0.02 : 0.14, -1)).applyQuaternion(rootQ).normalize();
      this.rodDirSmooth.lerp(rodD, 1 - Math.exp(-dt * 8)).normalize();
      this.updateRod(base, this.rodDirSmooth, 0.06);
    } else {
      // Walking: rod on the right shoulder, left arm swinging, the way anyone carries a rod.
      const swing = pose.mode === 'stand' ? Math.sin(ph) * 0.5 * walkAmt : 0;
      const restL = pose.mode === 'benchSit' || pose.mode === 'dockSit' ? 0.45 : 0.04;
      this.upper[0].rotation.set(swing * (1 - air) + restL + air * 0.9, 0, -0.1 - air * 0.5);
      this.fore[0].rotation.set(0.3 + walkAmt * 0.25 + (pose.mode === 'benchSit' ? 0.7 : 0), 0, 0);
      this.root.updateMatrixWorld(true);
      if (pose.mode === 'stand') {
        // The rod is carried low in the right hand, tip leading the way.
        const shoulder = this.shoulderWorld(1, new THREE.Vector3());
        const swingR = -Math.sin(ph) * 0.03 * walkAmt;
        const hand = new THREE.Vector3().copy(shoulder).addScaledVector(fwd, 0.14 + swingR).addScaledVector(worldUp, -0.42).addScaledVector(right, 0.05);
        this.reach(1, hand, new THREE.Vector3().copy(right).multiplyScalar(0.7).addScaledVector(fwd, -0.7).addScaledVector(worldUp, -0.3));
        const rodD = new THREE.Vector3().copy(fwd).multiplyScalar(0.82).addScaledVector(worldUp, 0.3).addScaledVector(right, 0.42).normalize();
        this.rodDirSmooth.lerp(rodD, 1 - Math.exp(-dt * 8)).normalize();
        const shake = Math.cos(ph * 2) * 0.03 * walkAmt;
        this.updateRod(hand, this.rodDirSmooth, 0.2 + shake);
      } else {
        // Rod rests beside the sitter.
        this.upper[1].rotation.set(0.45, 0, 0.1);
        this.fore[1].rotation.set(0.7, 0, 0);
        const base = new THREE.Vector3(0.36, -0.5, 0.1).applyMatrix4(this.hips.matrixWorld);
        const rodD = new THREE.Vector3(0.1, 0.14, -1).applyQuaternion(rootQ).normalize();
        this.rodDirSmooth.lerp(rodD, 1 - Math.exp(-dt * 8)).normalize();
        this.updateRod(base, this.rodDirSmooth, 0.1);
      }
    }

    // A hand on the pet, stroking from the head down its neck. It goes over whatever that arm was doing.
    const patK = pose.pat ?? 0;
    if (patK > 0.01 && pose.patAt) {
      const sh = this.shoulderWorld(0, new THREE.Vector3());
      const rest = sh.clone().addScaledVector(worldUp, -0.5).addScaledVector(fwd, 0.14);
      const stroke = Math.sin(t * 4.6);
      const at = pose.patAt.clone().addScaledVector(fwd, stroke * 0.07).addScaledVector(worldUp, 0.015 + Math.max(0, Math.cos(t * 4.6)) * 0.035);
      this.reach(0, rest.lerp(at, patK * patK * (3 - 2 * patK)), new THREE.Vector3().copy(right).multiplyScalar(-0.8).addScaledVector(worldUp, 0.1));
    }

    // Glass up: arm out and high, for the clink.
    const cheersK = pose.cheers ?? 0;
    if (cheersK > 0.01) {
      const sh = this.shoulderWorld(0, new THREE.Vector3());
      const rest = new THREE.Vector3(0, -FO_LEN - 0.03, 0).applyMatrix4(this.fore[0].matrixWorld);
      const up = sh.clone().addScaledVector(fwd, 0.42).addScaledVector(worldUp, 0.34).addScaledVector(right, 0.12);
      this.reach(0, rest.lerp(up, cheersK * cheersK * (3 - 2 * cheersK)), new THREE.Vector3().copy(right).multiplyScalar(-0.85).addScaledVector(worldUp, -0.55));
    }

    // The bottle: out of the basket, up to the mouth, tipped back.
    const beerOut = Math.max(pose.beerOut ?? 0, cheersK);
    const beerLift = pose.beerLift ?? 0;
    this.bottle.visible = beerOut > 0.02;
    if (this.bottle.visible) {
      const k = beerOut * beerOut * (3 - 2 * beerOut);
      const lift = beerLift * beerLift * (3 - 2 * beerLift);
      const mouth = new THREE.Vector3(0, 0.035, -0.105).applyMatrix4(this.head.matrixWorld);
      const atChest = new THREE.Vector3().copy(chestPos).addScaledVector(fwd, 0.24).addScaledVector(right, -0.2).addScaledVector(worldUp, -0.08);
      const atMouth = new THREE.Vector3().copy(mouth).addScaledVector(fwd, 0.155).addScaledVector(right, -0.03).addScaledVector(worldUp, -0.015);
      const target = atChest.lerp(atMouth, lift);
      const hand = new THREE.Vector3(0, -FO_LEN - 0.03, 0).applyMatrix4(this.fore[0].matrixWorld);
      hand.lerp(target, cheersK > 0.01 ? 0 : k);
      this.reach(0, hand, new THREE.Vector3().copy(right).multiplyScalar(-0.85).addScaledVector(worldUp, -0.55));
      const axis = new THREE.Vector3().copy(worldUp).lerp(new THREE.Vector3().copy(fwd).multiplyScalar(-0.93).addScaledVector(right, 0.06).addScaledVector(worldUp, -0.2), lift).normalize();
      const worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      const foreQ = this.fore[0].getWorldQuaternion(new THREE.Quaternion());
      this.bottle.quaternion.copy(foreQ.invert().multiply(worldQ));
    }

    // Scarf swings behind on the wind, more when moving.
    const localSpeed = this.velocity.length();
    const target = 0.08 + Math.min(1, localSpeed * 0.28) + Math.sin(t * 2.1) * 0.05 + Math.sin(t * 5.1) * 0.015;
    const acc = (target - this.scarfAng) * 26 - this.scarfVel * 4.5;
    this.scarfVel += acc * dt;
    this.scarfAng += this.scarfVel * dt;
    this.scarfA.rotation.set(this.scarfAng * 0.75, 0, Math.sin(t * 1.7) * 0.06);
    this.scarfB.rotation.set(this.scarfAng * 0.55, 0, 0);
    this.capeGroup.rotation.x = 0.12 + this.scarfAng * 0.5;
    this.spinner.rotation.y += dt * 9 + Math.min(1, this.velocity.length() * 0.4) * dt * 22;

    // Head: a slow look around.
    this.headLook = damp(this.headLook, Math.sin(t * 0.17) * 0.4 + Math.sin(t * 0.43) * 0.15, 1, dt);
    const still = 1 - Math.min(1, lounge * 1.5);
    this.head.rotation.set((sitting ? -0.05 : 0.04) + beerLift * 0.52 - lounge * 0.3, this.headLook * (walkAmt > 0.3 ? 0.35 : 1) * (1 - beerLift) * still + (longGun ? 0.55 : 0), 0);
  }
}
