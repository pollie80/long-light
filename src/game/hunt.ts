// Flocks cross the sky, and you can take a Desert Eagle to them, which is not how this is normally done. The birds are
// each player's own, so friends see each other firing but aim at their own sky. Feathers, no blood.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { L, paintedMaterial } from '../render/shared';
import { Builder, solid, TRS } from '../world/builder';
import { groundY, onJetty } from '../world/land';
import { MAP } from '../world/maps';
import type { Water } from '../world/water';
import { BirdKind, birdsOf, neonBird, pickBird } from './birddata';

interface Bird {
  neon: boolean;
  root: THREE.Group;
  wings: THREE.Object3D[];
  bodyMesh: THREE.Mesh;
  wingMeshes: THREE.Mesh[];
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
  /** Each one that fell, and how far off, and whether it was glowing. */
  hits: { kind: BirdKind; distance: number; neon: boolean }[];
}

const POOL = 16;
const FEATHERS = 120;
const REACH = 110;

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
  private geos = new Map<string, { body: THREE.BufferGeometry; wing: THREE.BufferGeometry }>();
  /** Glowing birds wear their own material, one for each neon colour. */
  private neonMats = new Map<number, THREE.ShaderMaterial>();
  /** The hour, for which birds are about; and which have been brought down before. */
  hour = 12;
  /** Multiplies how fast birds fly, from the mode. */
  speedK = 1;
  seen: (id: string) => boolean = () => false;
  /** A rare one has just appeared somewhere in the sky. */
  onRare: ((kind: BirdKind) => void) | null = null;

  constructor() {
    const kinds = birdsOf(MAP.id);
    for (const kind of kinds) this.geos.set(kind.id, this.buildGeo(kind));
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

  /** Each kind's outline: long necks and bills on the waders, broad wings on the hunters, a round head on the owls. */
  private buildGeo(k: BirdKind, neon = false) {
    const s = k.shape;
    const glow = { emis: neon ? 0.75 : 0 };
    const longNeck = s === 'heron' || s === 'goose' || s === 'loon';
    const headZ = longNeck ? -0.6 : s === 'owl' ? -0.3 : -0.38;
    const headR = s === 'owl' ? 0.15 : s === 'heron' ? 0.08 : 0.1;
    const billLen = s === 'heron' ? 0.3 : s === 'hornbill' ? 0.32 : s === 'owl' ? 0.06 : s === 'raptor' || s === 'parrot' ? 0.09 : s === 'small' ? 0.12 : 0.13;
    const b = new Builder(5);
    b.sphere(0.2, k.body, TRS(0, 0, 0, 0, 0, 0, 0.8, 0.75, s === 'owl' ? 1.3 : 1.75), { jit: 0.06, ...glow }, 10, 8);
    if (k.breast !== undefined) b.sphere(0.17, k.breast, TRS(0, -0.05, -0.08, 0, 0, 0, 0.82, 0.6, 1.4), { jit: 0.04, ...glow }, 10, 6);
    if (longNeck) b.cyl(0.05, 0.07, 0.36, s === 'goose' ? k.head : k.breast ?? k.body, TRS(0, 0.05, -0.42, -Math.PI / 2 + 0.25, 0, 0), glow, 6);
    b.sphere(headR, k.head, TRS(0, 0.07, headZ), glow, 8, 6);
    b.add(new THREE.ConeGeometry(s === 'hornbill' ? 0.06 : 0.035, billLen, 6), k.bill, TRS(0, 0.06, headZ - headR - billLen / 2 + 0.02, -Math.PI / 2, 0, 0));
    if (s === 'hornbill') b.box(0.04, 0.05, 0.16, k.accent ?? k.bill, TRS(0, 0.13, headZ - 0.14), {}, 0.01);
    // The marks the paintings show: a goose's white chin, a crane's red cap, an owl's pale face, a cockatoo's crest.
    if (s === 'goose' && k.accent !== undefined) b.sphere(0.06, k.accent, TRS(0, 0.03, headZ + 0.02, 0, 0, 0, 1.1, 0.7, 1), glow, 6, 5);
    if (k.id === 'whoopingcrane' && k.accent !== undefined) b.sphere(0.04, k.accent, TRS(0, 0.13, headZ), glow, 6, 5);
    if (s === 'owl') b.sphere(headR * 0.85, k.breast ?? k.body, TRS(0, 0.06, headZ - headR * 0.45, 0, 0, 0, 1, 1, 0.45), glow, 8, 6);
    if (s === 'parrot') b.add(new THREE.ConeGeometry(0.05, 0.2, 5), k.accent ?? k.head, TRS(0, 0.2, headZ + 0.08, 0.7, 0, 0));
    if (k.id === 'hornedowl') for (const x of [-0.07, 0.07]) b.add(new THREE.ConeGeometry(0.03, 0.09, 4), k.head, TRS(x, 0.2, headZ + 0.03));
    const tailLong = s === 'raptor' || s === 'corvid' || s === 'parrot' || s === 'hornbill';
    b.add(new THREE.ConeGeometry(0.1, tailLong ? 0.4 : 0.26, 5), k.wing, TRS(0, 0.01, tailLong ? 0.5 : 0.42, Math.PI / 2, 0, 0, 1, 1, 0.35));
    // Long legs trail out behind the waders.
    if (s === 'heron') for (const x of [-0.03, 0.03]) b.cyl(0.012, 0.012, 0.5, 0x2a2a28, TRS(x, -0.06, 0.55, Math.PI / 2, 0, 0), {}, 5);
    const span = s === 'raptor' ? 1.4 : s === 'heron' || s === 'hornbill' ? 1.3 : s === 'small' ? 0.85 : s === 'owl' ? 1.1 : 1;
    const w = new Builder(6);
    w.box(0.62 * span, 0.02, 0.26 * (s === 'raptor' || s === 'owl' ? 1.25 : 1), k.wing, TRS(0.31 * span, 0, 0.02), { jit: 0.06, ...glow }, 0.008);
    w.box(0.34 * span, 0.016, 0.16, k.accent !== undefined && s !== 'owl' ? k.accent : k.wing, TRS(0.74 * span, 0, 0.05), { jit: 0.06, ...glow }, 0.006);
    return { body: b.build(), wing: w.build() };
  }

  private makeBird(kind: BirdKind): Bird {
    const g = this.geos.get(kind.id)!;
    const root = new THREE.Group();
    const bodyMesh = solid(g.body, this.mat, false);
    root.add(bodyMesh);
    const wings: THREE.Object3D[] = [];
    const wingMeshes: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.1, 0.04, -0.02);
      pivot.scale.x = side;
      const wm = solid(g.wing, this.mat, false);
      pivot.add(wm);
      root.add(pivot);
      wings.push(pivot);
      wingMeshes.push(wm);
    }
    root.visible = false;
    root.scale.setScalar(kind.size);
    this.group.add(root);
    this.mat.side = THREE.DoubleSide;
    return { neon: false, root, wings, bodyMesh, wingMeshes, kind, alive: false, active: false, dead: false, deadT: 0, phase: this.rnd() * 6, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
  }

  /** Any bird in the pool can become any kind, glowing or not: only its meshes change. */
  private setKind(b: Bird, kind: BirdKind, neon: boolean) {
    if (b.kind === kind && b.neon === neon) return;
    const shown = neon ? neonBird(kind) : kind;
    const key = neon ? `${kind.id}~` : kind.id;
    let g = this.geos.get(key);
    if (!g) {
      g = this.buildGeo(shown, neon);
      this.geos.set(key, g);
    }
    b.kind = kind;
    b.neon = neon;
    b.bodyMesh.geometry = g.body;
    for (const wm of b.wingMeshes) wm.geometry = g.wing;
    let mat = this.mat;
    if (neon) {
      const col = shown.body;
      mat = this.neonMats.get(col) ?? paintedMaterial();
      if (!this.neonMats.has(col)) {
        mat.uniforms.uEmisCol.value.setHex(col);
        mat.uniforms.uEmisOn.value = 2.2;
        mat.side = THREE.DoubleSide;
        this.neonMats.set(col, mat);
      }
    }
    b.bodyMesh.material = mat;
    for (const wm of b.wingMeshes) wm.material = mat;
    b.root.scale.setScalar(kind.size);
  }

  private spawnFlock(center: THREE.Vector3) {
    const free = this.birds.filter((b) => !b.active);
    const kind = pickBird(MAP.id, this.hour, this.rnd, this.seen);
    const group = free;
    const n = Math.min(group.length, kind.flock[0] + Math.floor(this.rnd() * (kind.flock[1] - kind.flock[0] + 1)));
    if (n === 0) return;
    // After dark, now and then, a flock comes over glowing.
    const night = this.hour > 19.8 || this.hour < 5;
    const neon = night && this.rnd() < 0.08;
    for (let i = 0; i < n; i++) this.setKind(group[i], kind, neon);
    if (kind.tier === 'epic' || kind.tier === 'legendary') this.onRare?.(kind);
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
      b.vel.copy(dir).multiplyScalar(b.kind.speed * this.speedK);
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

  /** A single bullet from `origin` along the unit vector `dir`, with a little allowance so a good aim counts. */
  /** A shot along `dir`: every bird within `spread(distance)` of the line, out to `reach`, comes down. */
  fire(origin: THREE.Vector3, dir: THREE.Vector3, reach = REACH, spread: (along: number) => number = (a) => 0.5 + a * 0.016): ShotResult | null {
    let result: ShotResult | null = null;
    for (const b of this.birds) {
      if (!b.alive) continue;
      const to = this.tmp.subVectors(b.root.position, origin);
      const along = to.dot(dir);
      if (along < 2 || along > reach) continue;
      const missBy = this.tmp2.copy(dir).multiplyScalar(along).sub(to).length();
      if (missBy > spread(along) * b.kind.size) continue;
      b.alive = false;
      b.vel.multiplyScalar(0.55);
      b.vel.y = 1.5;
      b.spin.set((this.rnd() - 0.5) * 9, 0, (this.rnd() - 0.5) * 9);
      this.puff(b.root.position, 11);
      if (!result) result = { name: b.kind.name, distance: along, count: 1, hits: [{ kind: b.kind, distance: along, neon: b.neon }] };
      else {
        result.count += 1;
        result.hits.push({ kind: b.kind, distance: along, neon: b.neon });
      }
    }
    return result;
  }
}
