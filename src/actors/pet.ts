// A companion that follows you about, rides in the boat and sits when you sit. Friends see theirs follow
// them too: nothing about a pet goes over the network except what kind it is, because it all follows from
// where its owner is.
import * as THREE from 'three';
import { clamp, damp } from '../core/noise';
import { L, paintedMaterial } from '../render/shared';
import { Builder, solid, TRS } from '../world/builder';
import { DECK_Y, groundY, JETTY, onJetty } from '../world/land';
import type { Boat } from './boat';
import { CharacterLook, choiceOf } from './look';

export interface PetOwner {
  pos: THREE.Vector3;
  facing: number;
  speed: number;
  inBoat: boolean;
  air: boolean;
  boat: Boat;
  /** Being patted: comes to the owner's front, sits, and enjoys it. */
  patting: boolean;
  /** Its place when its owner is a passenger: in front of them, in the boat's own space. */
  rideSeat?: THREE.Vector3;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const FLYERS = new Set(['parrot', 'dragon']);
const NAMES: Record<string, string> = { dog: 'dog', cat: 'cat', parrot: 'parrot', duck: 'duck', capybara: 'capybara', turtle: 'turtle', dragon: 'dragon', rock: 'rock', potato: 'potato', toast: 'toast', shark: 'shark' };

interface Parts {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  headAt: [number, number, number];
  tail?: THREE.BufferGeometry;
  tailAt?: [number, number, number];
  /** One geometry for each leg, and where each hip is. */
  leg?: THREE.BufferGeometry;
  legsAt?: [number, number, number][];
  wing?: THREE.BufferGeometry;
  wingsAt?: [number, number, number][];
  /** Height of the body above the ground when standing. */
  stand: number;
  sit: number;
  /** How fast it can move, in metres a second, before it gives up and catches you up by magic. */
  gait: 'trot' | 'waddle' | 'plod' | 'hop' | 'fly';
}

function eyes(b: Builder, x: number, y: number, z: number, r = 0.022) {
  for (const s of [-1, 1]) {
    b.sphere(r, 0x15110f, TRS(s * x, y, z), {}, 8, 6);
    b.sphere(r * 0.35, 0xffffff, TRS(s * x + r * 0.3, y + r * 0.4, z - r * 0.8), { emis: 0.2 }, 6, 4);
  }
}

function build(kind: string, col: number): Parts {
  const c = new THREE.Color(col);
  const dark = c.clone().multiplyScalar(0.62);
  const light = c.clone().lerp(new THREE.Color(0xf6efe2), 0.55);
  const B = () => new Builder(77);
  switch (kind) {
    case 'cat': {
      const body = B().sphere(0.13, c, TRS(0, 0, 0, 0, 0, 0, 0.82, 0.85, 1.75), { jit: 0.05 });
      const head = B().sphere(0.105, c, TRS(0, 0, 0), {});
      for (const s of [-1, 1]) head.add(new THREE.ConeGeometry(0.042, 0.09, 5), c, TRS(s * 0.062, 0.1, 0));
      head.sphere(0.012, 0xd9838f, TRS(0, -0.012, -0.102), {}, 6, 4);
      eyes(head, 0.044, 0.018, -0.09, 0.019);
      const tail = B().tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, 0.05), new THREE.Vector3(0, 0.26, 0.04), new THREE.Vector3(0, 0.36, 0.1)], 0.021, c, {}, 12, 6);
      const leg = B().cyl(0.024, 0.02, 0.2, c, TRS(0, -0.1, 0), {}, 6);
      return { body: body.build(), head: head.build(), headAt: [0, 0.1, -0.24], tail: tail.build(), tailAt: [0, 0.03, 0.21], leg: leg.build(), legsAt: [[-0.065, -0.05, -0.14], [0.065, -0.05, -0.14], [-0.065, -0.05, 0.14], [0.065, -0.05, 0.14]], stand: 0.25, sit: 0.2, gait: 'trot' };
    }
    case 'capybara': {
      const body = B().sphere(0.24, c, TRS(0, 0, 0, 0, 0, 0, 0.95, 0.92, 1.55), { jit: 0.05 });
      const head = B().box(0.2, 0.19, 0.3, c, TRS(0, 0, -0.04), {}, 0.08);
      head.box(0.13, 0.1, 0.05, dark, TRS(0, -0.03, -0.2), {}, 0.03);
      for (const s of [-1, 1]) head.sphere(0.03, dark, TRS(s * 0.085, 0.1, 0.05), {}, 8, 6);
      eyes(head, 0.09, 0.04, -0.09);
      const leg = B().cyl(0.042, 0.038, 0.18, dark, TRS(0, -0.09, 0), {}, 7);
      return { body: body.build(), head: head.build(), headAt: [0, 0.1, -0.38], leg: leg.build(), legsAt: [[-0.12, -0.14, -0.2], [0.12, -0.14, -0.2], [-0.12, -0.14, 0.2], [0.12, -0.14, 0.2]], stand: 0.33, sit: 0.26, gait: 'plod' };
    }
    case 'turtle': {
      const body = B().sphere(0.2, c, TRS(0, 0.02, 0, 0, 0, 0, 1, 0.58, 1.2), { jit: 0.1 });
      body.lathe([[0, -0.03], [0.2, -0.03], [0.205, 0], [0, 0]], light, TRS(0, -0.02, 0, 0, 0, 0, 1, 1, 1.2));
      const head = B().sphere(0.075, 0x7f9a52, TRS(0, 0, 0, 0, 0, 0, 0.9, 0.85, 1.25), {});
      eyes(head, 0.05, 0.02, -0.06, 0.014);
      const tail = B().add(new THREE.ConeGeometry(0.03, 0.09, 6), 0x7f9a52, TRS(0, 0, 0.04, Math.PI / 2, 0, 0));
      const leg = B().sphere(0.05, 0x7f9a52, TRS(0, -0.03, 0, 0, 0, 0, 1, 0.8, 1.4), {}, 8, 6);
      return { body: body.build(), head: head.build(), headAt: [0, 0.02, -0.29], tail: tail.build(), tailAt: [0, -0.01, 0.24], leg: leg.build(), legsAt: [[-0.15, -0.05, -0.13], [0.15, -0.05, -0.13], [-0.15, -0.05, 0.13], [0.15, -0.05, 0.13]], stand: 0.11, sit: 0.09, gait: 'plod' };
    }
    case 'duck': {
      const body = B().sphere(0.14, c, TRS(0, 0, 0, 0, 0, 0, 0.9, 0.92, 1.3), { jit: 0.05 });
      body.add(new THREE.ConeGeometry(0.06, 0.13, 6), c, TRS(0, 0.05, 0.19, -1.1, 0, 0));
      for (const s of [-1, 1]) body.sphere(0.075, dark, TRS(s * 0.115, 0.02, 0.02, 0, 0, 0, 0.32, 0.75, 1.25), {}, 8, 6);
      const head = B().sphere(0.085, c, TRS(0, 0.02, 0), {});
      head.box(0.075, 0.022, 0.1, 0xe99a2a, TRS(0, 0, -0.1), {}, 0.01);
      eyes(head, 0.05, 0.04, -0.06, 0.015);
      const leg = B().cyl(0.012, 0.012, 0.11, 0xe99a2a, TRS(0, -0.055, 0), {}, 5);
      leg.box(0.06, 0.012, 0.08, 0xe99a2a, TRS(0, -0.11, -0.02), {}, 0.004);
      return { body: body.build(), head: head.build(), headAt: [0, 0.15, -0.14], leg: leg.build(), legsAt: [[-0.055, -0.08, 0], [0.055, -0.08, 0]], stand: 0.2, sit: 0.13, gait: 'waddle' };
    }
    case 'parrot': {
      const body = B().sphere(0.075, c, TRS(0, 0, 0, 0.5, 0, 0, 0.85, 1.25, 0.85), {});
      body.add(new THREE.ConeGeometry(0.03, 0.2, 5), 0x2f62b8, TRS(0, -0.08, 0.13, 2.2, 0, 0));
      const head = B().sphere(0.058, c, TRS(0, 0, 0), {});
      head.add(new THREE.ConeGeometry(0.018, 0.05, 6), 0xf0d060, TRS(0, -0.012, -0.06, -1.9, 0, 0));
      eyes(head, 0.036, 0.018, -0.03, 0.012);
      const wing = B().box(0.15, 0.012, 0.085, 0x2f62b8, TRS(0.075, 0, 0), {}, 0.005);
      return { body: body.build(), head: head.build(), headAt: [0, 0.09, -0.05], wing: wing.build(), wingsAt: [[-0.045, 0.03, 0.01], [0.045, 0.03, 0.01]], stand: 0, sit: 0, gait: 'fly' };
    }
    case 'dragon': {
      const body = B().sphere(0.11, c, TRS(0, 0, 0, 0, 0, 0, 0.85, 0.85, 1.5), { jit: 0.05 });
      for (let i = 0; i < 4; i++) body.add(new THREE.ConeGeometry(0.022, 0.06, 4), dark, TRS(0, 0.095, -0.1 + i * 0.075));
      const head = B().sphere(0.08, c, TRS(0, 0, 0, 0, 0, 0, 0.9, 0.85, 1.15), {});
      head.box(0.085, 0.05, 0.08, c, TRS(0, -0.02, -0.09), {}, 0.02);
      for (const s of [-1, 1]) head.add(new THREE.ConeGeometry(0.014, 0.08, 5), 0xe8dcc0, TRS(s * 0.04, 0.09, 0.03, 0.5, 0, 0));
      eyes(head, 0.05, 0.022, -0.05, 0.016);
      const tail = B().tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.02, 0.12), new THREE.Vector3(0, 0.02, 0.24), new THREE.Vector3(0, 0.06, 0.32)], 0.025, c, {}, 12, 6);
      tail.add(new THREE.ConeGeometry(0.05, 0.08, 3), dark, TRS(0, 0.075, 0.35, 1.2, 0, 0));
      const wing = B().box(0.24, 0.012, 0.15, dark, TRS(0.12, 0, 0), {}, 0.005);
      return { body: body.build(), head: head.build(), headAt: [0, 0.07, -0.19], tail: tail.build(), tailAt: [0, 0, 0.14], wing: wing.build(), wingsAt: [[-0.05, 0.05, 0], [0.05, 0.05, 0]], stand: 0, sit: 0, gait: 'fly' };
    }
    case 'toast': {
      // Golden in the middle, a little too dark round the edge, and on two tiny legs for some reason.
      const body = B().box(0.3, 0.32, 0.075, 0x8a5a2a, TRS(0, 0, 0), { jit: 0.03 }, 0.03);
      body.box(0.26, 0.28, 0.08, 0xd8a860, TRS(0, 0, 0), { jit: 0.05 }, 0.02);
      const head = B();
      for (const s of [-1, 1]) {
        head.sphere(0.03, 0xffffff, TRS(s * 0.05, 0, 0), { emis: 0.1 }, 8, 6);
        head.sphere(0.013, 0x101010, TRS(s * 0.05, -0.004, -0.026), {}, 6, 4);
      }
      head.box(0.05, 0.01, 0.01, 0x301a10, TRS(0, -0.07, -0.01), {}, 0.003);
      const leg = B().cyl(0.012, 0.012, 0.13, 0x201a14, TRS(0, -0.065, 0), {}, 5);
      leg.box(0.05, 0.016, 0.07, 0x201a14, TRS(0, -0.13, -0.02), {}, 0.005);
      return { body: body.build(), head: head.build(), headAt: [0, 0.03, -0.045], leg: leg.build(), legsAt: [[-0.07, -0.15, 0], [0.07, -0.15, 0]], stand: 0.3, sit: 0.3, gait: 'waddle' };
    }
    case 'shark': {
      const body = B().sphere(0.19, 0x7a8894, TRS(0, 0, 0, 0, 0, 0, 0.72, 0.72, 2.3), { jit: 0.03 });
      body.sphere(0.17, 0xe8ecec, TRS(0, -0.055, -0.02, 0, 0, 0, 0.62, 0.45, 2.1), {}, 12, 8);
      body.add(new THREE.ConeGeometry(0.1, 0.24, 3), 0x6a7884, TRS(0, 0.21, 0, 0, 0, 0, 0.35, 1, 1));
      for (const s of [-1, 1]) body.add(new THREE.ConeGeometry(0.07, 0.22, 3), 0x6a7884, TRS(s * 0.16, -0.05, -0.1, 0, 0, -s * 1.9, 1, 1, 0.3));
      const head = B().sphere(0.13, 0x7a8894, TRS(0, 0, -0.02, 0, 0, 0, 0.92, 0.74, 1.3), {});
      head.box(0.15, 0.03, 0.05, 0x241a1a, TRS(0, -0.05, -0.15), {}, 0.01);
      for (let i = 0; i < 6; i++) head.add(new THREE.ConeGeometry(0.012, 0.03, 3), 0xffffff, TRS(-0.06 + i * 0.024, -0.033, -0.168, Math.PI, 0, 0));
      eyes(head, 0.1, 0.025, -0.11, 0.016);
      const tail = B().add(new THREE.ConeGeometry(0.12, 0.3, 3), 0x6a7884, TRS(0, 0.04, 0.12, Math.PI / 2 + 0.5, 0, 0, 0.3, 1, 1));
      const leg = B().cyl(0.018, 0.016, 0.14, 0x3a3e44, TRS(0, -0.07, 0), {}, 6);
      leg.box(0.05, 0.02, 0.08, 0x8a2a22, TRS(0, -0.14, -0.015), {}, 0.006);
      return { body: body.build(), head: head.build(), headAt: [0, 0.02, -0.4], tail: tail.build(), tailAt: [0, 0.02, 0.4], leg: leg.build(), legsAt: [[-0.08, -0.1, -0.16], [0.08, -0.1, -0.16], [-0.08, -0.1, 0.18], [0.08, -0.1, 0.18]], stand: 0.24, sit: 0.2, gait: 'plod' };
    }
    case 'rock':
    case 'potato': {
      const geo = new THREE.IcosahedronGeometry(0.14, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + Math.sin(p.getX(i) * 31) * 0.05 + Math.cos(p.getY(i) * 27 + p.getZ(i) * 19) * 0.06;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k * 1.1);
      }
      geo.computeVertexNormals();
      const body = B().add(geo, kind === 'potato' ? 0x9a7a4a : c, kind === 'potato' ? TRS(0, 0, 0, 0, 0, 0, 0.95, 0.92, 1.4) : undefined, { jit: 0.05 });
      if (kind === 'potato') for (let i = 0; i < 9; i++) body.sphere(0.012, 0x6a5230, TRS(Math.cos(i * 2.4) * 0.11, Math.sin(i * 1.7) * 0.09, Math.sin(i * 2.4) * 0.15), {}, 5, 4);
      const head = B();
      for (const s of [-1, 1]) {
        head.sphere(0.042, 0xffffff, TRS(s * 0.045, 0, 0), { emis: 0.1 }, 10, 8);
        head.sphere(0.018, 0x101010, TRS(s * 0.045, -0.006, -0.036), {}, 8, 6);
      }
      return { body: body.build(), head: head.build(), headAt: [0, 0.05, -0.135], stand: 0.11, sit: 0.11, gait: 'hop' };
    }
    default: {
      // A dog.
      const body = B().sphere(0.15, c, TRS(0, 0, 0, 0, 0, 0, 0.88, 0.9, 1.7), { jit: 0.05 });
      body.sphere(0.09, light, TRS(0, -0.05, -0.15, 0, 0, 0, 0.9, 1, 1.1), {}, 10, 8);
      const head = B().sphere(0.105, c, TRS(0, 0, 0), {});
      head.box(0.09, 0.075, 0.13, light, TRS(0, -0.025, -0.11), {}, 0.03);
      head.sphere(0.022, 0x17120f, TRS(0, -0.005, -0.18), {}, 8, 6);
      for (const s of [-1, 1]) head.sphere(0.05, dark, TRS(s * 0.095, 0.015, 0.01, 0, 0, 0, 0.42, 1.25, 0.82), {}, 8, 6);
      eyes(head, 0.048, 0.03, -0.085);
      const tail = B().tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.08, 0.07), new THREE.Vector3(0, 0.17, 0.09)], 0.027, c, {}, 10, 6);
      const leg = B().cyl(0.031, 0.026, 0.25, c, TRS(0, -0.125, 0), {}, 7);
      return { body: body.build(), head: head.build(), headAt: [0, 0.12, -0.27], tail: tail.build(), tailAt: [0, 0.04, 0.24], leg: leg.build(), legsAt: [[-0.075, -0.07, -0.16], [0.075, -0.07, -0.16], [-0.075, -0.07, 0.16], [0.075, -0.07, 0.16]], stand: 0.31, sit: 0.24, gait: 'trot' };
    }
  }
}

export class Pet {
  root = new THREE.Group();
  /** Spoken of in prompts: "pat the dog". */
  name = '';
  private rig = new THREE.Group();
  private mat = paintedMaterial();
  private meshes: THREE.Mesh[] = [];
  private head: THREE.Object3D | null = null;
  private tail: THREE.Object3D | null = null;
  private legs: THREE.Object3D[] = [];
  private wings: THREE.Object3D[] = [];
  private parts: Parts | null = null;
  private key = '';
  private size = 1;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private speed = 0;
  private phase = 0;
  private sitK = 0;
  private hop = 0;
  private hopV = 0;
  private wagK = 0;
  private happy = 0;
  private idleT = 0;
  private placed = false;
  private riding = false;
  private ownerWasAir = false;
  private rideK = 1;
  private scene: THREE.Object3D | null = null;
  private patK = 0;
  private hearts: THREE.Mesh[] = [];
  private heartT: number[] = [];
  private heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.32, 0.42), side: THREE.DoubleSide });
  private seatTmp = new THREE.Vector3();

  constructor(look: CharacterLook) {
    this.root.add(this.rig);
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.05);
    heart.bezierCurveTo(-0.09, 0.0, -0.07, 0.065, -0.03, 0.065);
    heart.bezierCurveTo(-0.012, 0.065, 0, 0.05, 0, 0.04);
    heart.bezierCurveTo(0, 0.05, 0.012, 0.065, 0.03, 0.065);
    heart.bezierCurveTo(0.07, 0.065, 0.09, 0.0, 0, -0.05);
    const heartGeo = new THREE.ShapeGeometry(heart, 6);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(heartGeo, this.heartMat);
      m.layers.set(L.MAIN_ONLY);
      m.visible = false;
      this.root.add(m);
      this.hearts.push(m);
      this.heartT.push(-1);
    }
    this.applyLook(look);
  }

  get exists(): boolean {
    return this.parts !== null;
  }

  worldPos(out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.getWorldPosition(out);
  }

  /** The top of its head, where a hand goes. */
  headTop(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.head) this.head.getWorldPosition(out);
    else this.root.getWorldPosition(out);
    out.y += (this.parts?.gait === 'fly' ? 0.05 : 0.1) * this.size;
    return out;
  }

  /** A pat: delight, for a moment. */
  pat() {
    this.happy = 1.6;
    if (this.hop <= 0) this.hopV = 2.2;
  }

  applyLook(look: CharacterLook) {
    const kind = look.pet;
    const key = `${kind}|${look.petColor}`;
    this.size = look.petSize;
    this.rig.scale.setScalar(this.size);
    if (key === this.key) return;
    this.key = key;
    for (const m of this.meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    this.head = null;
    this.tail = null;
    this.legs = [];
    this.wings = [];
    this.parts = null;
    this.rig.clear();
    this.name = kind === 'potato' ? 'potato' : NAMES[kind] ?? '';
    if (kind === 'none') {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const col = choiceOf('petColor', look.petColor).color ?? 0x996633;
    const p = build(kind, col);
    this.parts = p;
    const add = (geo: THREE.BufferGeometry, parent: THREE.Object3D) => {
      const m = solid(geo, this.mat);
      parent.add(m);
      this.meshes.push(m);
      return m;
    };
    add(p.body, this.rig);
    const pivot = (at: [number, number, number]) => {
      const g = new THREE.Group();
      g.position.set(...at);
      this.rig.add(g);
      return g;
    };
    this.head = pivot(p.headAt);
    add(p.head, this.head);
    if (p.tail && p.tailAt) {
      this.tail = pivot(p.tailAt);
      add(p.tail, this.tail);
    }
    if (p.leg && p.legsAt) {
      for (let i = 0; i < p.legsAt.length; i++) {
        const g = pivot(p.legsAt[i]);
        add(i === 0 ? p.leg : p.leg.clone(), g);
        this.legs.push(g);
      }
    }
    if (p.wing && p.wingsAt) {
      for (let i = 0; i < p.wingsAt.length; i++) {
        const g = pivot(p.wingsAt[i]);
        if (i === 0) g.scale.x = -1;
        add(i === 0 ? p.wing : p.wing.clone(), g);
        this.wings.push(g);
      }
    }
    this.mat.side = THREE.DoubleSide;
  }

  private groundAt(x: number, z: number): number {
    return onJetty(x, z) ? Math.max(DECK_Y, groundY(x, z)) : groundY(x, z);
  }

  update(dt: number, t: number, o: PetOwner) {
    if (!this.parts) return;
    this.mat.uniforms.uEmisOn.value = 1;
    if (!this.scene) this.scene = this.root.parent;
    const flying = FLYERS.has(this.parts.gait === 'fly' ? (this.key.split('|')[0]) : '');
    if (o.air && !this.ownerWasAir && this.hop <= 0) this.hopV = 2.6;
    this.ownerWasAir = o.air;
    this.happy = Math.max(0, this.happy - dt);
    this.patK = damp(this.patK, o.patting ? 1 : 0, 6, dt);
    if (o.patting) {
      this.happy = Math.max(this.happy, 0.5);
      this.idleT = Math.max(this.idleT, 2);
    }
    this.updateHearts(dt, t, o.patting);
    if (flying) this.updateFlyer(dt, t, o);
    else if (o.inBoat) this.updateRider(dt, o);
    else this.updateWalker(dt, t, o);
    this.animate(dt, t, flying, o);
  }

  private updateFlyer(dt: number, t: number, o: PetOwner) {
    if (this.riding) this.dismount();
    // Flutters about at shoulder height, out to one side and a little behind; in front when it's being patted.
    const side = 0.62 + Math.sin(t * 0.37) * 0.14;
    const c = Math.cos(o.facing);
    const s = Math.sin(o.facing);
    const tx = o.patting ? o.pos.x - s * 0.56 : o.pos.x + c * side + s * 0.3;
    const tz = o.patting ? o.pos.z - c * 0.56 : o.pos.z - s * side + c * 0.3;
    const ty = o.pos.y + (o.patting ? 0.95 : o.inBoat ? 1.35 : 1.75) + Math.sin(t * 1.3) * (o.patting ? 0.02 : 0.08);
    if (!this.placed || Math.hypot(tx - this.x, tz - this.z) > 40) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
      this.placed = true;
    }
    const before = [this.x, this.z];
    this.x = damp(this.x, tx, 3.2, dt);
    this.y = damp(this.y, ty, 3.2, dt);
    this.z = damp(this.z, tz, 3.2, dt);
    this.speed = Math.hypot(this.x - before[0], this.z - before[1]) / Math.max(dt, 1e-3);
    const wantYaw = this.speed > 0.4 ? Math.atan2(-(this.x - before[0]), -(this.z - before[1])) : o.facing;
    this.yaw += wrap(wantYaw - this.yaw) * (1 - Math.exp(-dt * 4));
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.yaw, 0);
  }

  private dismount() {
    this.riding = false;
    this.scene?.add(this.root);
    this.root.rotation.set(0, this.yaw, 0);
  }

  private updateRider(dt: number, o: PetOwner) {
    if (!this.riding || this.root.parent !== o.boat.body) {
      this.riding = true;
      o.boat.body.add(this.root);
      this.rideK = 0;
      this.hopV = 3;
      this.placed = false;
    }
    this.rideK = Math.min(1, this.rideK + dt * 2.4);
    const seat = o.rideSeat ? this.seatTmp.copy(o.rideSeat).setZ(o.rideSeat.z + 0.12 * this.patK) : o.boat.petSeatAt(this.patK, this.seatTmp);
    this.root.position.set(seat.x, seat.y + this.parts!.sit * this.size + this.hop, seat.z);
    // Turns round to face whoever's patting it.
    this.root.rotation.set(0, Math.PI * this.patK, 0);
    this.speed = 0;
    this.sitK = damp(this.sitK, 1, 5, dt);
    this.idleT = 0;
  }

  private updateWalker(dt: number, t: number, o: PetOwner) {
    if (this.riding) {
      this.dismount();
      this.placed = false;
    }
    const c = Math.cos(o.facing);
    const s = Math.sin(o.facing);
    // Just behind and to one side, and to the middle if that side is off the jetty.
    let tx = o.patting ? o.pos.x - s * 0.66 : o.pos.x + c * 0.8 + s * 0.85;
    let tz = o.patting ? o.pos.z - c * 0.66 : o.pos.z - s * 0.8 + c * 0.85;
    if (onJetty(o.pos.x, o.pos.z)) {
      tz = clamp(tz, -JETTY.halfWidth + 0.3, JETTY.halfWidth - 0.3);
      tx = clamp(tx, JETTY.endX + 0.3, JETTY.startX + 3);
    }
    if (!this.placed || Math.hypot(tx - this.x, tz - this.z) > 26) {
      this.x = tx;
      this.z = tz;
      this.y = Math.max(this.groundAt(tx, tz), 0);
      this.yaw = o.facing;
      this.placed = true;
      this.hopV = 2.4;
    }
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const follow = o.patting ? dist > 0.1 : dist > 0.55 && (this.speed > 0.1 || dist > 1.1);
    // It can always keep up, however fast you've set yourself to walk.
    const gaitBase = this.parts!.gait === 'plod' ? 1.9 : this.parts!.gait === 'hop' ? 1.8 : 3.4;
    const want = follow ? Math.min(Math.max(gaitBase, o.speed * 1.25), 0.8 + dist * 2.6) : 0;
    this.speed = damp(this.speed, want, want > this.speed ? 5 : 8, dt);
    if (follow && dist > 0.01) {
      const face = Math.atan2(-dx, -dz);
      this.yaw += wrap(face - this.yaw) * (1 - Math.exp(-dt * 8));
    } else if (!follow) {
      // Sits, and watches you.
      const face = Math.atan2(-(o.pos.x - this.x), -(o.pos.z - this.z));
      this.yaw += wrap(face - this.yaw) * (1 - Math.exp(-dt * 2.2));
    }
    if (this.speed > 0.02) {
      const nx = this.x - Math.sin(this.yaw) * this.speed * dt;
      const nz = this.z - Math.cos(this.yaw) * this.speed * dt;
      // Keeps its paws dry, unless that would leave it behind for good.
      if (this.groundAt(nx, nz) > 0.03 || onJetty(nx, nz)) {
        this.x = nx;
        this.z = nz;
      }
    }
    const g = Math.max(this.groundAt(this.x, this.z), 0);
    this.y = damp(this.y, g, 18, dt);
    this.idleT = follow ? 0 : this.idleT + dt;
    this.sitK = damp(this.sitK, this.idleT > 1.1 ? 1 : 0, 5, dt);
    const lift = this.parts!.stand + (this.parts!.sit - this.parts!.stand) * this.sitK;
    this.root.position.set(this.x, this.y + lift * this.size + this.hop, this.z);
    this.root.rotation.set(0, this.yaw, 0);
    void t;
  }

  private updateHearts(dt: number, t: number, patting: boolean) {
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      if (this.heartT[i] < 0) {
        h.visible = false;
        // A new heart every so often, while the patting lasts.
        if (patting && Math.sin(t * 4.1 + i * 2.5) > 0.992) this.heartT[i] = 0;
        continue;
      }
      this.heartT[i] += dt;
      const k = this.heartT[i] / 1.5;
      if (k >= 1) {
        this.heartT[i] = -1;
        h.visible = false;
        continue;
      }
      h.visible = true;
      h.position.set(Math.sin(i * 2.1 + k * 4) * 0.13, 0.32 + k * 0.62, Math.cos(i * 1.7) * 0.1);
      h.rotation.y = -this.root.rotation.y + Math.sin(t * 2 + i) * 0.5;
      h.scale.setScalar(Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * (1 - k * k) * 1.5);
    }
  }

  private animate(dt: number, t: number, flying: boolean, o: PetOwner) {
    const p = this.parts!;
    if (this.hop > 0 || this.hopV > 0) {
      this.hop += this.hopV * dt;
      this.hopV -= 11 * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        this.hopV = this.happy > 0.4 ? 1.8 : 0;
      }
    }
    this.phase += dt * (3 + Math.min(this.speed, 8) * (p.gait === 'waddle' ? 5.2 : p.gait === 'plod' ? 3.2 : 3.6));
    const ph = this.phase;
    const walk = clamp(this.speed / 1.4, 0, 1) * (1 - this.sitK);
    const n = this.legs.length;
    for (let i = 0; i < n; i++) {
      const sign = n === 2 ? (i === 0 ? 1 : -1) : i === 0 || i === 3 ? 1 : -1;
      const hind = n === 4 && i >= 2;
      const swing = Math.sin(ph) * (p.gait === 'plod' ? 0.45 : 0.75) * walk * sign;
      this.legs[i].rotation.x = swing + (hind ? -1.0 : 0) * this.sitK;
    }
    if (p.gait === 'waddle') this.rig.rotation.z = Math.sin(ph) * 0.17 * walk;
    else this.rig.rotation.z = 0;
    if (p.gait === 'hop' && walk > 0.1) {
      // A rock has no legs. It manages.
      this.rig.position.y = Math.abs(Math.sin(ph * 0.6)) * 0.12 * walk;
    } else {
      this.rig.position.y = p.gait === 'fly' ? 0 : Math.abs(Math.sin(ph)) * 0.015 * walk;
    }
    // Sitting tips the front of the body up.
    const pitch = p.gait === 'trot' || p.gait === 'plod' ? this.sitK * 0.42 : 0;
    this.rig.rotation.x = flying ? clamp(this.speed * 0.06, 0, 0.5) * -1 : pitch;
    this.wagK = damp(this.wagK, this.happy > 0 ? 1 : this.idleT > 0.5 ? 0.42 : 0.2, 6, dt);
    if (this.tail) this.tail.rotation.y = Math.sin(t * (this.happy > 0 ? 16 : 7)) * 0.55 * this.wagK;
    for (let i = 0; i < this.wings.length; i++) {
      this.wings[i].rotation.z = (i === 0 ? -1 : 1) * Math.sin(t * (p.gait === 'fly' ? 21 : 8)) * 0.72;
    }
    if (this.head) {
      // Looks at you when it can, and sniffs about when it can't.
      const toOwner = wrap(Math.atan2(-(o.pos.x - this.x), -(o.pos.z - this.z)) - this.yaw);
      const look = this.riding ? Math.sin(t * 0.35) * 0.6 : this.speed < 0.3 ? clamp(toOwner, -0.9, 0.9) : 0;
      this.head.rotation.y = damp(this.head.rotation.y, look, 5, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -pitch * 0.8 + Math.sin(t * 0.9) * 0.05, 5, dt);
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const m of this.meshes) m.geometry.dispose();
    this.mat.dispose();
  }
}
