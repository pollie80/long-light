// Wildfowling: flocks cross the sky, and you can take a double-barrelled shotgun to them. The birds are
// each player's own, so friends see each other firing but aim at their own sky. Feathers, no blood.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { L, paintedMaterial } from '../render/shared';
import { Builder, solid, TRS } from '../world/builder';
import { groundY, onJetty } from '../world/land';
import { MAP } from '../world/maps';
import type { Water } from '../world/water';

export interface BirdKind {
  name: string;
  body: number;
  wing: number;
  head: number;
  bill: number;
  size: number;
  /** Metres a second. */
  speed: number;
  flock: [number, number];
}

const KINDS: Record<string, BirdKind[]> = {
  cove: [
    { name: 'Mallard', body: 0x8a7a64, wing: 0x6a5c4c, head: 0x1f6a48, bill: 0xd9a62e, size: 1, speed: 11, flock: [3, 6] },
    { name: 'Herring Gull', body: 0xe8e4da, wing: 0xa8aab0, head: 0xf0ece4, bill: 0xe0b030, size: 1.15, speed: 9, flock: [2, 4] },
    { name: 'Wood Pigeon', body: 0x8a8c98, wing: 0x6e707c, head: 0x74788a, bill: 0xd0a040, size: 0.8, speed: 13, flock: [3, 7] },
  ],
  philippines: [
    { name: 'Great Egret', body: 0xf2efe6, wing: 0xe8e4da, head: 0xf4f0e8, bill: 0xe0a830, size: 1.3, speed: 8, flock: [2, 4] },
    { name: 'Collared Kingfisher', body: 0xf0ece0, wing: 0x2a7a9c, head: 0x2a7a9c, bill: 0x20201e, size: 0.62, speed: 14, flock: [1, 3] },
    { name: 'Philippine Duck', body: 0x8a7458, wing: 0x4a6a5a, head: 0xb8946a, bill: 0x4a5a6a, size: 1, speed: 11, flock: [3, 6] },
  ],
  canada: [
    { name: 'Canada Goose', body: 0x8a7c68, wing: 0x5e5244, head: 0x1a1a1a, bill: 0x1a1a1a, size: 1.5, speed: 10, flock: [5, 9] },
    { name: 'Common Loon', body: 0x2a2c30, wing: 0x1e2024, head: 0x14181a, bill: 0x20242a, size: 1.1, speed: 12, flock: [1, 3] },
    { name: 'Mallard', body: 0x8a7a64, wing: 0x6a5c4c, head: 0x1f6a48, bill: 0xd9a62e, size: 1, speed: 11, flock: [3, 6] },
  ],
};

interface Bird {
  root: THREE.Group;
  wings: THREE.Object3D[];
  kind: BirdKind;
  alive: boolean;
  active: boolean;
  dead: boolean;
  deadT: number;
  phase: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export interface ShotResult {
  name: string;
  distance: number;
  /** How many fell to the one shot. */
  count: number;
}

const POOL = 16;
const FEATHERS = 120;
const REACH = 95;

export class Hunt {
  group = new THREE.Group();
  private birds: Bird[] = [];
  private rnd = mulberry32(1847);
  private mat = paintedMaterial();
  private nextFlock = 3;
  private fMesh: THREE.InstancedMesh;
  private fPos: THREE.Vector3[] = [];
  private fVel: THREE.Vector3[] = [];
  private fLife: number[] = [];
  private fNext = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private geos = new Map<BirdKind, { body: THREE.BufferGeometry; wing: THREE.BufferGeometry }>();

  constructor() {
    const kinds = KINDS[MAP.id];
    for (const kind of kinds) this.geos.set(kind, this.buildGeo(kind));
    for (let i = 0; i < POOL; i++) this.birds.push(this.makeBird(kinds[i % kinds.length]));
    const fGeo = new THREE.PlaneGeometry(0.13, 0.05);
    const fMat = new THREE.MeshBasicMaterial({ color: 0xd8d4c8, side: THREE.DoubleSide });
    this.fMesh = new THREE.InstancedMesh(fGeo, fMat, FEATHERS);
    this.fMesh.frustumCulled = false;
    this.fMesh.layers.set(L.MAIN_ONLY);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < FEATHERS; i++) {
      this.fMesh.setMatrixAt(i, this.m);
      this.fPos.push(new THREE.Vector3());
      this.fVel.push(new THREE.Vector3());
      this.fLife.push(0);
    }
    this.group.add(this.fMesh);
  }

  private buildGeo(k: BirdKind) {
    const b = new Builder(5);
    b.sphere(0.2, k.body, TRS(0, 0, 0, 0, 0, 0, 0.8, 0.75, 1.75), { jit: 0.06 }, 10, 8);
    b.sphere(0.1, k.head, TRS(0, 0.06, -0.38), {}, 8, 6);
    b.add(new THREE.ConeGeometry(0.035, 0.13, 6), k.bill, TRS(0, 0.05, -0.51, -Math.PI / 2, 0, 0));
    b.add(new THREE.ConeGeometry(0.1, 0.26, 5), k.wing, TRS(0, 0.01, 0.42, Math.PI / 2, 0, 0, 1, 1, 0.35));
    const w = new Builder(6);
    w.box(0.62, 0.02, 0.26, k.wing, TRS(0.31, 0, 0.02), { jit: 0.06 }, 0.008);
    w.box(0.34, 0.016, 0.16, k.wing, TRS(0.74, 0, 0.05), { jit: 0.06 }, 0.006);
    return { body: b.build(), wing: w.build() };
  }

  private makeBird(kind: BirdKind): Bird {
    const g = this.geos.get(kind)!;
    const root = new THREE.Group();
    root.add(solid(g.body, this.mat, false));
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.1, 0.04, -0.02);
      pivot.scale.x = side;
      pivot.add(solid(g.wing, this.mat, false));
      root.add(pivot);
      wings.push(pivot);
    }
    root.visible = false;
    root.scale.setScalar(kind.size);
    this.group.add(root);
    this.mat.side = THREE.DoubleSide;
    return { root, wings, kind, alive: false, active: false, dead: false, deadT: 0, phase: this.rnd() * 6, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
  }

  private spawnFlock(center: THREE.Vector3) {
    const free = this.birds.filter((b) => !b.active);
    const kinds = KINDS[MAP.id];
    const kind = kinds[Math.floor(this.rnd() * kinds.length)];
    const group = free.filter((b) => b.kind === kind);
    const n = Math.min(group.length, kind.flock[0] + Math.floor(this.rnd() * (kind.flock[1] - kind.flock[0] + 1)));
    if (n === 0) return;
    // Across the sky, passing near enough to reach but never straight overhead.
    const a = this.rnd() * Math.PI * 2;
    const dir = this.tmp.set(Math.cos(a), 0, Math.sin(a));
    const side = this.tmp2.set(-dir.z, 0, dir.x);
    const miss = (this.rnd() < 0.5 ? -1 : 1) * (16 + this.rnd() * 34);
    const startX = center.x - dir.x * 130 + side.x * miss;
    const startZ = center.z - dir.z * 130 + side.z * miss;
    const alt = Math.max(center.y, 0) + 13 + this.rnd() * 16;
    for (let i = 0; i < n; i++) {
      const b = group[i];
      // In a loose V behind the leader.
      const rank = Math.ceil(i / 2);
      const wing = i % 2 ? 1 : -1;
      b.root.position.set(startX - dir.x * rank * 3 + side.x * rank * wing * 2.4, alt + (this.rnd() - 0.5) * 1.5, startZ - dir.z * rank * 3 + side.z * rank * wing * 2.4);
      b.vel.copy(dir).multiplyScalar(b.kind.speed);
      b.root.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
      b.root.visible = true;
      b.active = true;
      b.alive = true;
      b.dead = false;
      b.deadT = 0;
    }
  }

  /** How many birds are in the air right now. */
  get flying(): number {
    return this.birds.filter((b) => b.alive).length;
  }

  update(dt: number, t: number, center: THREE.Vector3, water: Water) {
    this.nextFlock -= dt;
    if (this.nextFlock <= 0) {
      this.nextFlock = 7 + this.rnd() * 11;
      this.spawnFlock(center);
    }
    for (const b of this.birds) {
      if (!b.active) continue;
      const p = b.root.position;
      if (b.alive) {
        p.addScaledVector(b.vel, dt);
        p.y += Math.sin(t * 0.8 + b.phase) * 0.25 * dt;
        b.wings.forEach((w, i) => {
          w.rotation.z = (i === 0 ? -1 : 1) * Math.sin(t * (9 + 6 / b.kind.size) + b.phase) * 0.62;
        });
        const ground = groundY(p.x, p.z);
        if (ground > p.y - 8) p.y += (ground + 8 - p.y) * Math.min(1, dt * 1.5);
        if (Math.hypot(p.x - center.x, p.z - center.z) > 190) {
          b.active = false;
          b.alive = false;
          b.root.visible = false;
        }
      } else if (!b.dead) {
        // Falling: nothing flying about it now.
        b.vel.y -= 11 * dt;
        p.addScaledVector(b.vel, dt);
        b.root.rotation.x += b.spin.x * dt;
        b.root.rotation.z += b.spin.z * dt;
        b.wings.forEach((w, i) => {
          w.rotation.z = (i === 0 ? -1 : 1) * 1.05;
        });
        const floor = onJetty(p.x, p.z) ? 1.45 : Math.max(groundY(p.x, p.z), 0);
        if (p.y <= floor + 0.08) {
          p.y = floor + 0.08;
          if (floor <= 0.01) {
            water.splash(p.x, p.z, 0.8, 0.22);
            this.onSplash?.();
          }
          b.dead = true;
          b.root.rotation.set(0.2, b.root.rotation.y, 1.4);
        }
      } else {
        b.deadT += dt;
        // Bobbing if it came down in the water, then gone.
        if (b.deadT > 9) {
          b.active = false;
          b.root.visible = false;
        }
      }
    }
    this.updateFeathers(dt, t);
  }

  onSplash: (() => void) | null = null;

  private puff(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const k = this.fNext;
      this.fNext = (k + 1) % FEATHERS;
      this.fPos[k].copy(at);
      this.fVel[k].set((this.rnd() - 0.5) * 3.2, (this.rnd() - 0.2) * 2.2, (this.rnd() - 0.5) * 3.2);
      this.fLife[k] = 2.4 + this.rnd() * 2.4;
    }
  }

  private updateFeathers(dt: number, t: number) {
    let any = false;
    for (let i = 0; i < FEATHERS; i++) {
      if (this.fLife[i] <= 0) continue;
      any = true;
      this.fLife[i] -= dt;
      const v = this.fVel[i];
      // Feathers don't fall so much as change their minds about it.
      v.multiplyScalar(Math.exp(-dt * 1.9));
      v.y -= 0.35 * dt;
      this.fPos[i].addScaledVector(v, dt);
      this.fPos[i].x += Math.sin(t * 2.2 + i) * 0.25 * dt;
      this.e.set(t * 1.7 + i, t * 1.1 + i * 2, i);
      this.q.setFromEuler(this.e);
      const s = this.fLife[i] > 0 ? Math.min(1, this.fLife[i] * 2) : 0;
      this.m.compose(this.fPos[i], this.q, this.tmp.setScalar(s));
      this.fMesh.setMatrixAt(i, this.m);
    }
    if (any) this.fMesh.instanceMatrix.needsUpdate = true;
  }

  /** A shot from `origin` along the unit vector `dir`: the pattern widens with range. */
  fire(origin: THREE.Vector3, dir: THREE.Vector3): ShotResult | null {
    let result: ShotResult | null = null;
    for (const b of this.birds) {
      if (!b.alive) continue;
      const to = this.tmp.subVectors(b.root.position, origin);
      const along = to.dot(dir);
      if (along < 2 || along > REACH) continue;
      const missBy = this.tmp2.copy(dir).multiplyScalar(along).sub(to).length();
      if (missBy > (0.7 + along * 0.034) * b.kind.size) continue;
      b.alive = false;
      b.vel.multiplyScalar(0.55);
      b.vel.y = 1.5;
      b.spin.set((this.rnd() - 0.5) * 9, 0, (this.rnd() - 0.5) * 9);
      this.puff(b.root.position, 11);
      if (!result) result = { name: b.kind.name, distance: along, count: 1 };
      else result.count += 1;
    }
    return result;
  }
}
