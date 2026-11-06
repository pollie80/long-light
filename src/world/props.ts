// Everything people made: the cottage and its garden, the path furniture, the jetty, the far lighthouse.
import * as THREE from 'three';
import { Builder, solid, TRS } from './builder';
import { BOAT_MOOR, COTTAGE, DECK_Y, groundY, ISLETS, JETTY, pathPoint, PATH_LENGTH } from './land';
import { MAP } from './maps';
import { mulberry32 } from '../core/noise';
import { L, LIT_FRAG, paintedMaterial, U } from '../render/shared';
import { SPECIMEN_BENCH_TREE } from './foliage';

const WOOD_DARK = MAP.props.woodDark;
const WOOD = MAP.props.wood;
const WOOD_PALE = MAP.props.woodPale;
const STONE = 0x8a8078;
const PLASTER = MAP.props.wall;
const SHINGLE = MAP.props.roof;
const IRON = 0x2a2a30;

export interface LampSpot { x: number; y: number; z: number; strength: number }

export interface PropWorld {
  group: THREE.Group;
  glowMat: THREE.ShaderMaterial; // windows and lamps, uEmisOn set by time of day
  lamps: LampSpot[];
  bench: { x: number; y: number; z: number; rot: number };
  chimney: THREE.Vector3;
  lighthouseLamp: THREE.Vector3;
  cloth: THREE.ShaderMaterial;
}

function lantern(b: Builder, x: number, y: number, z: number) {
  b.box(0.2, 0.03, 0.2, IRON, TRS(x, y + 0.2, z), {}, 0.01);
  b.cyl(0.03, 0.11, 0.09, IRON, TRS(x, y + 0.255, z), {}, 6);
  b.box(0.14, 0.2, 0.14, 0xffc070, TRS(x, y + 0.08, z), { emis: 1 }, 0.01);
  b.box(0.18, 0.03, 0.18, IRON, TRS(x, y - 0.035, z), {}, 0.01);
  for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
    b.box(0.018, 0.22, 0.018, IRON, TRS(x + dx, y + 0.09, z + dz), {}, 0.005);
  }
}

function postLamp(b: Builder, x: number, y: number, z: number, h = 2.3) {
  b.box(0.13, h, 0.13, WOOD_DARK, TRS(x, y + h / 2, z, 0, 0, 0.012), { jit: 0.2 }, 0.03);
  b.box(0.42, 0.07, 0.08, WOOD_DARK, TRS(x + 0.17, y + h - 0.12, z), {}, 0.02);
  b.box(0.05, 0.05, 0.05, IRON, TRS(x + 0.33, y + h - 0.18, z), {}, 0.01);
  lantern(b, x + 0.33, y + h - 0.42, z);
}

function buildCottage(b: Builder) {
  const ox = COTTAGE.x;
  const oy = COTTAGE.y;
  const oz = COTTAGE.z;
  const W = 6.2; // along x
  const D = 9.4; // along z
  const H = 2.75;
  const P = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => TRS(ox + x, oy + y, oz + z, rx, ry, rz);

  // Stone footing, every stone its own lump.
  for (let side = 0; side < 4; side++) {
    const len = side % 2 === 0 ? D : W;
    const n = Math.floor(len / 0.55);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5 + (row % 2) * 0.5) * (len / n);
        if (Math.abs(t) > len / 2) continue;
        const inset = side === 0 ? -W / 2 - 0.02 : side === 1 ? D / 2 + 0.02 : side === 2 ? W / 2 + 0.02 : -D / 2 - 0.02;
        const xx = side % 2 === 0 ? inset : t;
        const zz = side % 2 === 0 ? t : inset;
        b.box(0.5 + b.rnd() * 0.12, 0.19, 0.5 + b.rnd() * 0.12, STONE, P(xx, 0.1 + row * 0.19, zz, 0, b.rnd() * 0.1, 0), { jit: 0.4, hue: 0.04 }, 0.05);
      }
    }
  }
  b.box(W, H - 0.3, D, PLASTER, P(0, 0.3 + (H - 0.3) / 2 + 0.05, 0), { jit: 0.03 }, 0.05);

  // Gable ends.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-W / 2, 0);
  gableShape.lineTo(W / 2, 0);
  gableShape.lineTo(0, 2.55);
  gableShape.closePath();
  const gable = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
  for (const s of [-1, 1]) {
    b.add(gable, 0xe2d1b4, TRS(ox, oy + H, oz + s * (D / 2) - (s > 0 ? 0.12 : 0)), { jit: 0.03 });
  }

  // Half-timbering.
  const beam = (x: number, y: number, z: number, len: number, rx = 0, ry = 0, rz = 0) => {
    b.box(0.13, len, 0.13, WOOD_DARK, P(x, y, z, rx, ry, rz), { jit: 0.25 }, 0.025);
  };
  for (const s of [-1, 1]) {
    for (const zz of [-D / 2, -1.5, 1.5, D / 2]) beam(s * (W / 2 + 0.02), 1.55, zz, H - 0.45);
    for (const xx of [-W / 2, W / 2]) beam(xx, 1.55, s * (D / 2 + 0.02), H - 0.45);
    b.box(0.13, 0.13, D + 0.1, WOOD_DARK, P(s * (W / 2 + 0.03), H - 0.02, 0), { jit: 0.2 }, 0.025);
    b.box(0.13, 0.13, D + 0.1, WOOD_DARK, P(s * (W / 2 + 0.03), 0.72, 0), { jit: 0.2 }, 0.025);
    // Diagonal braces on the long walls.
    beam(s * (W / 2 + 0.03), 1.45, -D / 2 + 0.72, 2.05, 0.68 * s, 0, 0);
    beam(s * (W / 2 + 0.03), 1.45, D / 2 - 0.72, 2.05, -0.68 * s, 0, 0);
    // Gable timbers.
    b.box(W + 0.1, 0.12, 0.13, WOOD_DARK, P(0, H, s * (D / 2 + 0.02)), { jit: 0.2 }, 0.025);
    beam(0, H + 1.05, s * (D / 2 + 0.02), 2.1);
    beam(-W / 4, H + 0.55, s * (D / 2 + 0.02), 1.4, 0, 0, 0.72);
    beam(W / 4, H + 0.55, s * (D / 2 + 0.02), 1.4, 0, 0, -0.72);
  }

  // Windows glow at dusk.
  const window4 = (x: number, y: number, z: number, ry: number, w = 0.95, h = 1.05) => {
    const m = (dx: number, dy: number, dz: number) => TRS(ox + x + Math.cos(ry) * dx + Math.sin(ry) * dz, oy + y + dy, oz + z - Math.sin(ry) * dx + Math.cos(ry) * dz, 0, ry, 0);
    b.box(w + 0.16, h + 0.16, 0.08, WOOD, m(0, 0, 0), { jit: 0.1 }, 0.02);
    b.box(w, h, 0.05, 0x24303c, m(0, 0, 0.03), { emis: 1 }, 0.005);
    b.box(0.04, h, 0.07, WOOD, m(0, 0, 0.05), {}, 0.01);
    b.box(w, 0.04, 0.07, WOOD, m(0, 0, 0.05), {}, 0.01);
    b.box(w + 0.3, 0.05, 0.2, WOOD_DARK, m(0, -h / 2 - 0.08, 0.1), {}, 0.015);
    // Flower box.
    b.box(w + 0.2, 0.17, 0.2, WOOD, m(0, -h / 2 - 0.2, 0.12), {}, 0.015);
    for (let i = 0; i < 16; i++) {
      const col = [0xc93e3a, 0xe58b2c, 0xf0e2c0, 0xa63e7c, 0x5f8c3a, 0x5f8c3a][Math.floor(b.rnd() * 6)];
      b.sphere(0.055 + b.rnd() * 0.045, col, m((b.rnd() - 0.5) * (w + 0.1), -h / 2 - 0.09 + b.rnd() * 0.08, 0.12 + (b.rnd() - 0.5) * 0.12), { jit: 0.2 }, 6, 5);
    }
  };
  const ryW = -Math.PI / 2; // faces -x, towards the sea
  window4(-W / 2 - 0.02, 1.6, -2.75, ryW);
  window4(-W / 2 - 0.02, 1.6, 2.75, ryW);
  window4(W / 2 + 0.02, 1.6, 0, Math.PI / 2);
  window4(1.3, 1.6, D / 2 + 0.02, 0);
  window4(-1.3, 1.6, -D / 2 - 0.02, Math.PI);
  window4(0, H + 0.75, D / 2 + 0.03, 0, 0.6, 0.72);

  // Door and porch, on the west side, facing the sunset.
  const dx = -W / 2 - 0.03;
  b.box(0.08, 2.1, 1.1, 0x3e6b6a, P(dx, 1.32, 0), { jit: 0.08 }, 0.02);
  for (let i = 0; i < 4; i++) b.box(0.03, 2.0, 0.015, 0x2c4a4a, P(dx - 0.04, 1.32, -0.42 + i * 0.28), {}, 0.004);
  b.box(0.14, 2.3, 0.13, WOOD_DARK, P(dx, 1.32, -0.62), {}, 0.02);
  b.box(0.14, 2.3, 0.13, WOOD_DARK, P(dx, 1.32, 0.62), {}, 0.02);
  b.box(0.14, 0.14, 1.4, WOOD_DARK, P(dx, 2.44, 0), {}, 0.02);
  b.sphere(0.045, 0xc9a24a, P(dx - 0.07, 1.25, 0.38), {}, 6, 5);
  // Steps.
  b.box(1.6, 0.18, 2.0, STONE, P(-W / 2 - 0.82, 0.09, 0), { jit: 0.15 }, 0.03);
  b.box(0.7, 0.16, 1.6, STONE, P(-W / 2 - 1.85, 0.0, 0), { jit: 0.15 }, 0.03);
  // Porch roof.
  for (const s of [-1, 1]) {
    b.box(0.13, 2.45, 0.13, WOOD, P(-W / 2 - 1.3, 1.22, s * 1.0), { jit: 0.1 }, 0.025);
    b.box(1.5, 0.11, 0.11, WOOD_DARK, P(-W / 2 - 0.65, 2.42, s * 1.0), {}, 0.02);
    b.box(0.6, 0.08, 0.08, WOOD, P(-W / 2 - 1.03, 2.13, s * 1.0, 0, 0, 0.78), {}, 0.015);
  }
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 5; j++) {
      const zz = -1.5 + i * 0.3 + (j % 2) * 0.15;
      if (Math.abs(zz) > 1.56) continue;
      b.plain(0.42, 0.024, 0.31, SHINGLE, P(-W / 2 - 1.42 + j * 0.34, 2.53 + j * 0.15, zz, 0, 0, 0.44), { jit: 0.35, hue: 0.03 });
    }
  }
  lantern(b, ox - W / 2 - 0.8, oy + 2.1, oz + 0.0);

  // Roof: rows of shingles over a dark under-layer, with an overhang.
  const eave = H;
  const overhang = 0.55;
  const rise = 2.55;
  const halfSpan = W / 2 + overhang;
  const slope = Math.atan2(rise + overhang * (rise / (W / 2)), halfSpan);
  const rowLen = Math.hypot(halfSpan, rise + overhang * (rise / (W / 2)));
  for (const side of [-1, 1]) {
    const rows = Math.floor(rowLen / 0.27);
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows;
      const xx = side * (halfSpan - t * halfSpan);
      const yy = eave - overhang * (rise / (W / 2)) + t * (rise + overhang * (rise / (W / 2))) + 0.09;
      const n = Math.floor((D + 1.1) / 0.31);
      for (let i = 0; i < n; i++) {
        const zz = -(D + 1.1) / 2 + (i + 0.5 + (r % 2) * 0.5) * ((D + 1.1) / n);
        if (Math.abs(zz) > (D + 1.1) / 2) continue;
        const moss = b.rnd() < 0.1 + 0.3 * (1 - t);
        const col = moss ? 0x6e7a3e : SHINGLE;
        b.plain(0.37, 0.026, 0.31, col, P(xx, yy, zz, 0, 0, -side * slope + (b.rnd() - 0.5) * 0.05), { jit: 0.45, hue: 0.03 });
      }
    }
    const under = new THREE.BoxGeometry(rowLen, 0.05, D + 1.06);
    b.add(under, 0x4a2c24, P(side * (halfSpan / 2), eave - overhang * (rise / (W / 2)) + (rise + overhang * (rise / (W / 2))) / 2 + 0.03, 0, 0, 0, -side * slope));
    // Bargeboards.
    for (const e of [-1, 1]) {
      b.box(rowLen + 0.05, 0.16, 0.08, WOOD_DARK, P(side * (halfSpan / 2), eave - overhang * (rise / (W / 2)) + (rise + overhang * (rise / (W / 2))) / 2 + 0.02, e * ((D + 1.1) / 2 + 0.02), 0, 0, -side * slope), { jit: 0.15 }, 0.02);
    }
  }
  b.box(0.2, 0.09, D + 1.2, 0x7a3e2c, P(0, H + rise + 0.09, 0), { jit: 0.1 }, 0.03);

  // Chimney.
  const cz = D / 2 - 1.4;
  for (let i = 0; i < 12; i++) {
    b.box(0.86 + (b.rnd() - 0.5) * 0.06, 0.2, 0.86 + (b.rnd() - 0.5) * 0.06, STONE, P(1.15, H + 1.2 + i * 0.2, cz), { jit: 0.28, hue: 0.03 }, 0.035);
  }
  b.box(1.0, 0.08, 1.0, 0x5e564f, P(1.15, H + 1.2 + 12 * 0.2, cz), {}, 0.02);
  b.cyl(0.13, 0.15, 0.32, 0x7a4a3a, P(1.15, H + 1.2 + 12 * 0.2 + 0.2, cz), {}, 8);

  // Woodpile against the north wall.
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 11 - row; i++) {
      b.cyl(0.08, 0.08, 0.5, 0x8e6c4c, P(-1.8 + i * 0.17 + row * 0.085, 0.09 + row * 0.15, -D / 2 - 0.42, Math.PI / 2, 0, 0), { jit: 0.4 }, 7);
    }
  }
  // Rain barrel.
  b.lathe([[0, 0], [0.32, 0], [0.36, 0.3], [0.36, 0.5], [0.32, 0.8], [0.3, 0.8], [0, 0.78]], 0x6e4e38, P(W / 2 - 0.3, 0.02, -D / 2 - 0.45), { jit: 0.1 });
  for (const y of [0.2, 0.6]) b.cyl(0.365, 0.365, 0.05, IRON, P(W / 2 - 0.3, 0.02 + y, -D / 2 - 0.45), {}, 16);

  // Picket fence around the garden, open at the gate.
  const R = 12.8;
  const pts = 54;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const x = Math.cos(a) * R * 1.05;
    const z = Math.sin(a) * R * 1.12;
    if (x < 0 && Math.abs(z) < 1.45 + 0.0 && Math.abs(a - Math.PI) < 0.3) continue;
    const wx = ox + x;
    const wz = oz + z;
    const y = groundY(wx, wz);
    b.box(0.07, 0.86, 0.035, 0xd9ccb4, TRS(wx, y + 0.42, wz, 0, -a + Math.PI / 2, (b.rnd() - 0.5) * 0.05), { jit: 0.14 }, 0.012);
    // A little point on top.
    b.add(new THREE.ConeGeometry(0.045, 0.08, 4), 0xd9ccb4, TRS(wx, y + 0.89, wz, 0, -a + Math.PI / 2 + 0.78, 0));
    if (i % 3 === 0) {
      const a2 = ((i + 3) / pts) * Math.PI * 2;
      const x2 = ox + Math.cos(a2) * R * 1.05;
      const z2 = oz + Math.sin(a2) * R * 1.12;
      if (Math.cos(a2) < 0 && Math.abs(a2 - Math.PI) < 0.3) continue;
      const y2 = groundY(x2, z2);
      for (const h of [0.26, 0.64]) {
        b.tube([new THREE.Vector3(wx, y + h, wz), new THREE.Vector3(x2, y2 + h, z2)], 0.02, 0xbfae94, {}, 2, 4);
      }
    }
  }

  // Vegetable rows behind the cottage.
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 12; i++) {
      const x = ox + 4.5 + r * 0.95;
      const z = oz - 4.5 + i * 0.75;
      const y = groundY(x, z);
      b.sphere(0.19 + b.rnd() * 0.08, r % 2 ? 0x5e8a3a : 0x7fa04a, TRS(x, y + 0.15, z, 0, 0, 0, 1, 0.78, 1), { jit: 0.3, hue: 0.03 }, 7, 5);
    }
    b.box(0.6, 0.1, 9.2, 0x5a4230, TRS(ox + 4.5 + r * 0.95, oy + 0.02, oz - 0.3), { jit: 0.1 }, 0.03);
  }
}

function buildJetty(b: Builder): LampSpot[] {
  const { startX, endX, halfWidth } = JETTY;
  const y = DECK_Y;
  const lamps: LampSpot[] = [];
  // Planks.
  const len = startX - endX;
  const n = Math.floor(len / 0.34);
  for (let i = 0; i < n; i++) {
    const x = endX + (i + 0.5) * (len / n);
    const wob = (b.rnd() - 0.5) * 0.02;
    const col = b.rnd() < 0.2 ? 0x8e7358 : b.rnd() < 0.5 ? WOOD_PALE : 0x93775c;
    b.box(0.3, 0.05, halfWidth * 2 + (b.rnd() - 0.5) * 0.14, col, TRS(x, y - 0.03 + wob, (b.rnd() - 0.5) * 0.05, wob, (b.rnd() - 0.5) * 0.015, wob), { jit: 0.3, hue: 0.02 }, 0.012);
    // Nail heads catch the eye up close.
    if (i % 2 === 0) {
      for (const s of [-1, 1]) b.cyl(0.012, 0.012, 0.01, IRON, TRS(x, y + 0.0, s * (halfWidth - 0.13)), {}, 5);
    }
  }
  for (const s of [-1, 1]) {
    b.box(len, 0.18, 0.13, WOOD_DARK, TRS((startX + endX) / 2, y - 0.16, s * (halfWidth - 0.12)), { jit: 0.1 }, 0.02);
    b.box(len, 0.1, 0.09, WOOD, TRS((startX + endX) / 2, y + 0.02, s * (halfWidth + 0.04)), { jit: 0.2 }, 0.02);
  }
  // Piles, with weed where the tide reaches them.
  let k = 0;
  for (let x = startX - 1.5; x > endX - 0.5; x -= 3.8) {
    for (const s of [-1, 1]) {
      const px = x + (b.rnd() - 0.5) * 0.12;
      const pz = s * (halfWidth + 0.06);
      const ground = Math.min(groundY(px, pz), 0.6);
      const tall = k % 3 === 0 ? 1.0 : 0.22;
      const top = y + tall;
      const h = top - ground + 0.4;
      b.cyl(0.11, 0.13, h, 0x5c4534, TRS(px, ground - 0.4 + h / 2, pz, (b.rnd() - 0.5) * 0.03, 0, (b.rnd() - 0.5) * 0.03), { jit: 0.2 }, 9);
      if (ground < 0.1) b.cyl(0.14, 0.15, 0.55, 0x3e5a3c, TRS(px, 0.05, pz), { jit: 0.3 }, 9);
      b.cyl(0.112, 0.115, 0.03, 0x46362a, TRS(px, top, pz), {}, 9);
    }
    k++;
  }
  // Rope hand-line between the tall posts.
  for (const s of [-1, 1]) {
    let x0 = startX - 1.5;
    for (let i = 0; i < 4; i++) {
      const x1 = x0 - 3.8 * 3;
      if (x1 < endX - 0.5) break;
      const zr = s * (halfWidth + 0.06);
      const a = new THREE.Vector3(x0, y + 0.86, zr);
      const m = new THREE.Vector3((x0 + x1) / 2, y + 0.42, zr);
      const c = new THREE.Vector3(x1, y + 0.86, zr);
      b.tube([a, m, c], 0.012, 0x8d7a58, {}, 14, 5);
      x0 = x1;
    }
  }
  // Lamps along the walk.
  for (const [x, s] of [[startX - 1.5, -1], [0.0, 1], [endX + 1.1, -1]] as [number, number][]) {
    const zz = s * (halfWidth + 0.13);
    postLamp(b, x, y - 0.02, zz, 2.0);
    lamps.push({ x: x + 0.33, y: y + 1.6, z: zz, strength: 1 });
  }
  // A working end of the jetty: crates, a bucket, coiled rope, a bollard.
  const ex = endX + 2.5;
  b.box(0.7, 0.5, 0.6, 0x8a6c4e, TRS(ex + 2.6, y + 0.25, -0.75, 0, 0.2, 0), { jit: 0.2 }, 0.02);
  b.box(0.55, 0.4, 0.5, 0x9c7c58, TRS(ex + 2.55, y + 0.7, -0.78, 0, -0.3, 0), { jit: 0.2 }, 0.02);
  b.lathe([[0, 0], [0.17, 0], [0.22, 0.34], [0.205, 0.34], [0.15, 0.03], [0, 0.03]], 0x4f6c78, TRS(ex + 1.5, y, 0.82), { jit: 0.1 });
  for (let r = 0; r < 3; r++) {
    const coil = new THREE.TorusGeometry(0.26 - r * 0.012, 0.035, 6, 18);
    b.add(coil, 0xc4ab7d, TRS(ex - 1.2, y + 0.04 + r * 0.06, -0.82, Math.PI / 2, 0, 0), { jit: 0.1 });
  }
  b.cyl(0.11, 0.13, 0.5, IRON, TRS(BOAT_MOOR.x, y + 0.25, 1.0), {}, 10);
  b.cyl(0.17, 0.17, 0.05, IRON, TRS(BOAT_MOOR.x, y + 0.5, 1.0), {}, 10);
  // Ladder down to the boat.
  for (const s of [-0.2, 0.2]) b.box(0.05, 1.5, 0.05, WOOD_DARK, TRS(BOAT_MOOR.x + 2.2 + s, y - 0.7, halfWidth + 0.08), {}, 0.012);
  for (let i = 0; i < 4; i++) b.box(0.42, 0.04, 0.05, WOOD, TRS(BOAT_MOOR.x + 2.2, y - 0.2 - i * 0.32, halfWidth + 0.08), {}, 0.01);
  return lamps;
}

function buildBeachKit(b: Builder) {
  // A small boat shed on the sand north of the jetty.
  const ox = 27;
  const oz = -16;
  const oy = groundY(ox, oz) + 0.1;
  const P = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => TRS(ox + x, oy + y, oz + z, rx, ry, rz);
  const W = 3.4;
  const D = 4.6;
  const H = 2.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.box(0.2, 0.7, 0.2, WOOD_DARK, P((sx * W) / 2.2, 0.0, (sz * D) / 2.2), {}, 0.03);
  }
  const boards = 16;
  for (let i = 0; i < boards; i++) {
    const t = (i / (boards - 1) - 0.5) * W;
    for (const s of [-1, 1]) {
      b.box(W / boards - 0.012, H + 0.1 + 0 * t, 0.05, 0x7a93a0, P(t, 0.2 + H / 2, (s * D) / 2), { jit: 0.22, hue: 0.03 }, 0.008);
    }
  }
  for (let i = 0; i < 20; i++) {
    const t = (i / 19 - 0.5) * D;
    for (const s of [-1, 1]) {
      if (s < 0 && Math.abs(t) < 0.68 && i > 0) continue;
      b.box(0.05, H + 0.05, D / 20 - 0.012, 0x6f8896, P((s * W) / 2, 0.2 + H / 2, t), { jit: 0.22, hue: 0.03 }, 0.008);
    }
  }
  b.box(0.06, 1.9, 1.3, 0x3a4048, P(-W / 2 - 0.01, 0.2 + 0.95, 0), {}, 0.015);
  const rs = Math.atan2(1.05, W / 2 + 0.3);
  const rl = Math.hypot(W / 2 + 0.3, 1.05);
  for (const s of [-1, 1]) {
    b.box(rl, 0.06, D + 0.7, 0x5a3f33, P((s * (W / 2 + 0.3)) / 2, H + 0.25 + 0.52, 0, 0, 0, -s * rs), { jit: 0.1 }, 0.02);
    // Boards on the roof.
    for (let i = 0; i < 12; i++) {
      const z = -(D + 0.7) / 2 + (i + 0.5) * ((D + 0.7) / 12);
      b.plain(rl, 0.03, (D + 0.7) / 12 - 0.015, 0x6e4a3a, P((s * (W / 2 + 0.3)) / 2, H + 0.3 + 0.52, z, 0, 0, -s * rs), { jit: 0.3, hue: 0.03 });
    }
  }
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2, 0);
  gable.lineTo(W / 2, 0);
  gable.lineTo(0, 1.0);
  gable.closePath();
  const gg = new THREE.ExtrudeGeometry(gable, { depth: 0.05, bevelEnabled: false });
  for (const s of [-1, 1]) b.add(gg, 0x7a93a0, P(0, H + 0.25, (s * D) / 2 - 0.025), { jit: 0.1 });

  // Upturned dinghy on the sand.
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dx = 18;
  const dz = -6.5;
  b.add(hull, 0xb24e3a, TRS(dx, groundY(dx, dz) + 0.06, dz, 0, 0.8, 0, 1.45, 0.36, 0.55), { jit: 0.1 });
  b.add(hull, 0xe4d7bb, TRS(dx, groundY(dx, dz) + 0.03, dz, 0, 0.8, 0, 1.47, 0.14, 0.57), {});

  // Net rack, fish-trap baskets.
  for (const [x, z] of [[30, 12], [33.4, 13.2]] as [number, number][]) {
    const y = groundY(x, z);
    b.box(0.09, 1.9, 0.09, WOOD_DARK, TRS(x, y + 0.92, z, 0, 0, 0.02), {}, 0.02);
  }
  const nx0 = 30;
  const nx1 = 33.4;
  const nz0 = 12;
  const nz1 = 13.2;
  const ny = groundY(31.7, 12.6) + 1.82;
  b.box(3.7, 0.07, 0.07, WOOD_DARK, TRS(31.7, ny, 12.6, 0, -Math.atan2(nz1 - nz0, nx1 - nx0), 0), {}, 0.015);
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = nx0 + (nx1 - nx0) * t;
    const z = nz0 + (nz1 - nz0) * t;
    const h = 0.95 + Math.sin(t * Math.PI) * -0.35 + b.rnd() * 0.22;
    b.box(0.13, h, 0.02, 0x8d9c8c, TRS(x, ny - h / 2, z, 0, -0.34, (b.rnd() - 0.5) * 0.08), { jit: 0.3 }, 0.006);
  }
  for (const [x, z] of [[35, 5], [36.1, 6.2], [20, 9]] as [number, number][]) {
    const y = groundY(x, z);
    b.lathe([[0.22, 0], [0.32, 0.18], [0.26, 0.42], [0.08, 0.5], [0, 0.5]], 0xb19358, TRS(x, y, z), { jit: 0.2 }, 10);
  }
  // Driftwood.
  for (const [x, z, r, s] of [[12, -3.5, 0.4, 1.4], [6, 7, -0.9, 1.0], [14.5, 5, 1.8, 1.1]] as [number, number, number, number][]) {
    b.cyl(0.07, 0.11, s * 2.4, 0xb1a494, TRS(x, groundY(x, z) + 0.06, z, 0, r, Math.PI / 2 - 0.03), { jit: 0.1 }, 7);
  }
}

function buildPathKit(b: Builder): { lamps: LampSpot[]; bench: { x: number; y: number; z: number; rot: number } } {
  const lamps: LampSpot[] = [];
  for (const s of [PATH_LENGTH * 0.09, PATH_LENGTH * 0.33, PATH_LENGTH * 0.6, PATH_LENGTH * 0.84]) {
    const p = pathPoint(s);
    const q = pathPoint(s + 2);
    const nx = -(q.z - p.z);
    const nz = q.x - p.x;
    const l = Math.hypot(nx, nz) || 1;
    const x = p.x + (nx / l) * 1.9;
    const z = p.z + (nz / l) * 1.9;
    const y = groundY(x, z);
    postLamp(b, x, y - 0.05, z, 2.25);
    lamps.push({ x: x + 0.33, y: y + 1.85, z, strength: 1 });
  }
  // Low rope fence along the steepest part of the walk.
  let prev: THREE.Vector3 | null = null;
  for (let s = PATH_LENGTH * 0.34; s < PATH_LENGTH * 0.62; s += 4.5) {
    const p = pathPoint(s);
    const q = pathPoint(s + 1);
    const nx = -(q.z - p.z);
    const nz = q.x - p.x;
    const l = Math.hypot(nx, nz) || 1;
    const x = p.x - (nx / l) * 1.7;
    const z = p.z - (nz / l) * 1.7;
    const y = groundY(x, z);
    b.box(0.09, 0.82, 0.09, WOOD, TRS(x, y + 0.36, z, 0, b.rnd(), (b.rnd() - 0.5) * 0.12), { jit: 0.25 }, 0.018);
    const top = new THREE.Vector3(x, y + 0.72, z);
    if (prev) {
      const mid = prev.clone().add(top).multiplyScalar(0.5);
      mid.y -= 0.17;
      b.tube([prev, mid, top], 0.011, 0x8d7a58, {}, 8, 4);
    }
    prev = top;
  }
  // Bench under the big tree, looking out over the bay.
  const bx = SPECIMEN_BENCH_TREE.x - 4.5;
  const bz = SPECIMEN_BENCH_TREE.z + 2.5;
  const by = groundY(bx, bz);
  const rot = 1.28;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const P = (x: number, y: number, z: number, rz = 0) => TRS(bx + x * c + z * sn, by + y, bz - x * sn + z * c, 0, rot, rz);
  for (const s of [-0.85, 0.85]) {
    b.box(0.09, 0.46, 0.5, WOOD_DARK, P(s, 0.23, 0), { jit: 0.1 }, 0.015);
    b.box(0.09, 0.56, 0.08, WOOD_DARK, P(s, 0.72, 0.22), {}, 0.015);
  }
  for (let i = 0; i < 4; i++) b.box(1.95, 0.04, 0.11, WOOD_PALE, P(0, 0.47, -0.19 + i * 0.125), { jit: 0.2 }, 0.012);
  for (let i = 0; i < 3; i++) b.box(1.95, 0.1, 0.03, WOOD_PALE, P(0, 0.68 + i * 0.13, 0.23), { jit: 0.2 }, 0.01);
  // Small signpost at the fork.
  const sp = pathPoint(PATH_LENGTH * 0.16);
  const sy = groundY(sp.x + 1.8, sp.z - 1.1);
  b.box(0.08, 1.45, 0.08, WOOD, TRS(sp.x + 1.8, sy + 0.68, sp.z - 1.1), {}, 0.018);
  b.box(0.62, 0.17, 0.04, WOOD_PALE, TRS(sp.x + 1.65, sy + 1.25, sp.z - 1.1, 0, -0.3, 0.05), { jit: 0.1 }, 0.012);
  // A cat on the bench would be fine too, but it lives on the jetty, by the crates.
  return { lamps, bench: { x: bx, y: by + 0.47, z: bz, rot } };
}

function buildLighthouse(b: Builder): THREE.Vector3 {
  const i = ISLETS[1];
  const x = i.x + 16;
  const z = i.z - 18;
  const y = groundY(x, z);
  const H = 15;
  b.lathe([[1.9, 0], [1.75, 0.6], [1.35, H], [1.5, H + 0.1], [1.5, H + 0.25], [0, H + 0.25]], MAP.props.lighthouse, TRS(x, y - 0.5, z), { jit: 0.05 }, 18);
  for (const h of [4.4, 9.2]) {
    const t = h / H;
    const r = 1.75 + (1.35 - 1.75) * t;
    b.cyl(r - 0.1, r, 1.6, MAP.props.band, TRS(x, y - 0.5 + h, z), {}, 18);
  }
  b.cyl(0.85, 0.95, 1.5, 0xfff2c8, TRS(x, y - 0.5 + H + 1.0, z), { emis: 1 }, 12);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.283;
    b.box(0.07, 1.5, 0.07, IRON, TRS(x + Math.cos(a) * 0.95, y - 0.5 + H + 1.0, z + Math.sin(a) * 0.95), {}, 0.01);
  }
  b.add(new THREE.ConeGeometry(1.25, 1.05, 12), 0x8c2e26, TRS(x, y - 0.5 + H + 2.2, z));
  b.lathe([[1.4, 0], [3.4, 0], [3.4, 2.1], [1.9, 2.1]], 0xe5dccb, TRS(x + 4.2, y - 0.5, z - 1.2), { jit: 0.05 }, 4);
  return new THREE.Vector3(x, y - 0.5 + H + 1.1, z);
}

/** A thin flat shape, for flags. Points are (along, up) from `at`, in the plane facing along z. */
function flag(b: Builder, pts: [number, number][], color: number, at: THREE.Vector3, depth = 0.012) {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  b.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), color, TRS(at.x, at.y, at.z), { jit: 0.02 });
}

/** A bangka: a slim hull, a double outrigger of bamboo, and paint as bright as the owner can afford. */
function bangka(b: Builder, x: number, z: number, y: number, rot: number, stripe: number, awning: boolean) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (dx: number, dy: number, dz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => TRS(x + dx * c + dz * s, y + dy, z - dx * s + dz * c, rx, rot + ry, rz, sx, sy, sz);
  b.sphere(1, 0xf0ece0, P(0, 0.16, 0, 0, 0, 0, 0.52, 0.42, 3.4), { jit: 0.03 }, 14, 8);
  b.sphere(1, stripe, P(0, 0.4, 0, 0, 0, 0, 0.54, 0.14, 3.34), { jit: 0.03 }, 14, 6);
  b.box(0.8, 0.08, 4.6, 0x8a6c44, P(0, 0.56, 0), { jit: 0.1 }, 0.02);
  // Curved ends rising at bow and stern.
  b.tube([new THREE.Vector3(x - 3.1 * s, y + 0.4, z - 3.1 * c), new THREE.Vector3(x - 3.7 * s, y + 0.75, z - 3.7 * c), new THREE.Vector3(x - 3.95 * s, y + 1.3, z - 3.95 * c)], 0.06, 0xf0ece0, {}, 8, 6);
  b.tube([new THREE.Vector3(x + 3.1 * s, y + 0.4, z + 3.1 * c), new THREE.Vector3(x + 3.6 * s, y + 0.72, z + 3.6 * c), new THREE.Vector3(x + 3.8 * s, y + 1.15, z + 3.8 * c)], 0.06, 0xf0ece0, {}, 8, 6);
  for (const dz of [-1.5, 1.5]) {
    b.cyl(0.05, 0.05, 5.4, 0xc9b878, P(0, 0.72, dz, 0, 0, Math.PI / 2), { jit: 0.05 }, 7);
    for (const side of [-1, 1]) b.cyl(0.035, 0.035, 0.75, 0xa89660, P(side * 2.55, 0.38, dz), {}, 6);
  }
  for (const side of [-1, 1]) b.cyl(0.085, 0.085, 4.4, 0xc9b878, P(side * 2.55, 0.06, 0, Math.PI / 2, 0, 0), { jit: 0.05 }, 8);
  if (awning) {
    for (const dx of [-0.34, 0.34]) for (const dz of [-1.2, 1.2]) b.cyl(0.025, 0.025, 1.3, 0x8a6c44, P(dx, 1.2, dz), {}, 5);
    b.box(1.0, 0.05, 2.9, stripe, P(0, 1.87, 0), { jit: 0.05 }, 0.01);
  }
}

/** A few things that only belong in one place. */
function buildPlaceKit(b: Builder) {
  const at = (x: number, z: number) => groundY(x, z);
  if (MAP.props.kit === 'bangka') {
    // One drawn up on the sand, and the rest riding at anchor in the bay.
    bangka(b, 34, 26, at(34, 26) + 0.12, 1.25, 0x2f62b8, false);
    const moored: [number, number, number, number, boolean][] = [
      [-52, 34, 0.5, 0xc23a2c, true], [-72, -30, 2.1, 0x2f7d80, false], [-100, 20, 1.2, 0xe8a02e, true], [-40, -46, 2.8, 0x35623c, false], [-126, 48, 0.2, 0x2f62b8, true], [-150, -8, 1.9, 0xc23a2c, false],
    ];
    for (const [x, z, r, col, aw] of moored) bangka(b, x, z, 0.02, r, col, aw);
    // A star lantern at the porch, as every house hangs at Christmas, and some the whole year.
    const px = COTTAGE.x - 3.7;
    const py = COTTAGE.y + 4.3;
    const pz = COTTAGE.z + 1.6;
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.14 : 0.34;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    b.add(new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: false }), 0xffb060, TRS(px, py, pz, 0, Math.PI / 2, 0), { emis: 1 });
    // The flag, on a bamboo pole by the path.
    const fx = COTTAGE.x - 9;
    const fz = COTTAGE.z - 6;
    const fy = at(fx, fz);
    b.cyl(0.04, 0.05, 6, 0xc9b878, TRS(fx, fy + 3, fz), { jit: 0.04 }, 7);
    const o = new THREE.Vector3(fx + 0.04, fy + 5.0, fz);
    flag(b, [[0, 0.46], [1.5, 0.46], [1.5, 0.92], [0, 0.92]], 0x1f3f9a, o);
    flag(b, [[0, 0], [1.5, 0], [1.5, 0.46], [0, 0.46]], 0xc8201e, o);
    flag(b, [[0, 0], [0.8, 0.46], [0, 0.92]], 0xf4f1e8, new THREE.Vector3(o.x, o.y, o.z + 0.002), 0.016);
    b.sphere(0.11, 0xf2c12e, TRS(o.x + 0.24, o.y + 0.46, o.z + 0.012, 0, 0, 0, 1, 1, 0.2), { emis: 0.2 }, 10, 6);
  } else if (MAP.props.kit === 'canoe') {
    // The red canoes, side by side at the water's edge.
    for (let i = 0; i < 6; i++) {
      const x = 16 + (i % 2) * 2.4;
      const z = 7 + i * 1.7;
      const y = Math.max(at(x, z), 0.05) + 0.3;
      b.sphere(1, 0xb0281e, TRS(x, y, z, 0, Math.PI / 2 + (i % 2) * 0.1, 0, 0.42, 0.3, 2.45), { jit: 0.04 }, 14, 8);
      b.box(0.74, 0.02, 3.8, 0x3a2418, TRS(x, y + 0.27, z, 0, Math.PI / 2 + (i % 2) * 0.1, 0), {}, 0.006);
      b.box(0.6, 0.03, 0.22, 0xa98a68, TRS(x, y + 0.26, z, 0, Math.PI / 2 + (i % 2) * 0.1, 0), {}, 0.006);
    }
    // The Rockpile: the great heap of boulders at the end of the lake that everyone climbs for the view.
    const rnd = mulberry32(55);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 19;
      const x = 22 + Math.cos(a) * d * 1.1;
      const z = -44 + Math.sin(a) * d;
      const h = (1 - d / 21) * 11;
      const r = 0.8 + rnd() * rnd() * 3.4;
      const geo = new THREE.IcosahedronGeometry(r, 0);
      b.add(geo, rnd() < 0.5 ? 0x7c7a78 : 0x8e8a84, TRS(x, Math.max(at(x, z), 0) + h * rnd() + r * 0.3, z, rnd() * 3, rnd() * 3, rnd() * 3, 1, 0.72 + rnd() * 0.4, 1), { jit: 0.12 });
    }
    // The flag.
    const fx = COTTAGE.x - 9;
    const fz = COTTAGE.z - 6;
    const fy = at(fx, fz);
    b.cyl(0.04, 0.055, 7, 0xd8d4c8, TRS(fx, fy + 3.5, fz), {}, 7);
    const o = new THREE.Vector3(fx + 0.05, fy + 5.8, fz);
    flag(b, [[0, 0], [0.45, 0], [0.45, 0.9], [0, 0.9]], 0xc8201e, o);
    flag(b, [[0.45, 0], [1.35, 0], [1.35, 0.9], [0.45, 0.9]], 0xf4f1e8, o);
    flag(b, [[1.35, 0], [1.8, 0], [1.8, 0.9], [1.35, 0.9]], 0xc8201e, o);
    flag(b, [[0.9, 0.12], [0.94, 0.26], [1.12, 0.22], [1.08, 0.36], [1.18, 0.42], [1.05, 0.54], [1.08, 0.66], [0.97, 0.62], [0.9, 0.8], [0.83, 0.62], [0.72, 0.66], [0.75, 0.54], [0.62, 0.42], [0.72, 0.36], [0.68, 0.22], [0.86, 0.26]], 0xc8201e, new THREE.Vector3(o.x, o.y, o.z + 0.002), 0.016);
  }
}

/** A bahay kubo: bamboo and thatch on stilts, open to the air, cool underneath. */
function buildNipaHut(b: Builder) {
  const ox = COTTAGE.x;
  const oy = COTTAGE.y;
  const oz = COTTAGE.z;
  const W = 6.2;
  const D = 8.4;
  const FLOOR = 1.5;
  const WALL = 2.1;
  const P = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => TRS(ox + x, oy + y, oz + z, rx, ry, rz);
  const BAMBOO = 0xc4ae7c;
  for (const x of [-W / 2, 0, W / 2]) for (const z of [-D / 2, -D / 6, D / 6, D / 2]) b.cyl(0.1, 0.12, FLOOR + 0.4, WOOD_DARK, P(x, FLOOR / 2 - 0.1, z), { jit: 0.1 }, 8);
  // Split-bamboo floor.
  for (let i = 0; i < 26; i++) b.cyl(0.055, 0.055, D + 0.4, BAMBOO, P(-W / 2 - 0.2 + i * 0.26, FLOOR, 0, Math.PI / 2, 0, 0), { jit: 0.1 }, 6);
  // Woven walls, with the window openings left dark and shutters propped out.
  const wall = (x: number, z: number, w: number, d: number) => b.box(w, WALL, d, PLASTER, P(x, FLOOR + WALL / 2 + 0.05, z), { jit: 0.05 }, 0.01);
  wall(0, -D / 2, W, 0.08);
  wall(0, D / 2, W, 0.08);
  wall(W / 2, 0, 0.08, D);
  wall(-W / 2, -2.65, 0.08, D / 2 - 1.3);
  wall(-W / 2, 2.65, 0.08, D / 2 - 1.3);
  b.box(0.08, 0.5, 1.5, PLASTER, P(-W / 2, FLOOR + WALL - 0.2, 0), { jit: 0.05 }, 0.01);
  for (const z of [-2.7, 2.7]) {
    b.box(0.1, 0.9, 1.3, 0xffc070, P(-W / 2 - 0.01, FLOOR + 1.25, z), { emis: 1 }, 0.01);
    b.box(0.05, 0.06, 1.5, WOOD_DARK, P(-W / 2 - 0.05, FLOOR + 1.72, z), {}, 0.01);
    b.box(0.5, 0.05, 1.4, WOOD_PALE, P(-W / 2 - 0.25, FLOOR + 1.85, z, 0, 0, -0.5), {}, 0.01);
  }
  b.box(0.06, 1.65, 1.1, 0x3a2a1c, P(-W / 2 - 0.02, FLOOR + 0.9, 0), {}, 0.01);
  // Steep thatch, overhanging well for the rain.
  const RISE = 3.0;
  const half = W / 2 + 1.0;
  const len = D + 1.8;
  const rows = 15;
  const slope = Math.atan2(RISE, half);
  const roofBase = FLOOR + WALL;
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const k = r / rows;
      const x = side * half * (1 - k);
      const y = roofBase - 0.15 + RISE * k;
      b.box(half * 1.22 / rows + 0.24, 0.1, len, SHINGLE, P(x, y, 0, 0, 0, side * slope), { jit: 0.1, hue: 0.015 }, 0.02);
    }
  }
  b.box(0.3, 0.18, len + 0.1, 0x6a5a34, P(0, roofBase + RISE - 0.05, 0), { jit: 0.1 }, 0.03);
  // Gable ends.
  for (const z of [-D / 2, D / 2]) {
    const gable = new THREE.Shape();
    gable.moveTo(-W / 2, 0);
    gable.lineTo(W / 2, 0);
    gable.lineTo(0, RISE * (W / 2) / half);
    gable.closePath();
    b.add(new THREE.ExtrudeGeometry(gable, { depth: 0.06, bevelEnabled: false }), PLASTER, P(0, roofBase + 0.02, z - 0.03), { jit: 0.05 });
  }
  // Bamboo ladder and a small landing, down towards the path.
  b.box(1.5, 0.08, 1.9, BAMBOO, P(-W / 2 - 0.75, FLOOR, 0), { jit: 0.08 }, 0.02);
  for (const z of [-0.5, 0.5]) b.cyl(0.05, 0.05, 2.4, BAMBOO, P(-W / 2 - 2.0, FLOOR / 2, z, 0, 0, 0.72), {}, 6);
  for (let i = 0; i < 5; i++) b.cyl(0.04, 0.04, 1.1, BAMBOO, P(-W / 2 - 1.55 - i * 0.26, FLOOR - 0.18 - i * 0.28, 0, Math.PI / 2, 0, 0), {}, 6);
  // Cooking place under the eaves, which is where the smoke comes from.
  b.box(0.9, 0.6, 0.9, 0x8a5a3a, P(4.9, 0.3, 3.2), { jit: 0.1 }, 0.1);
  b.cyl(0.3, 0.2, 0.2, 0x26262a, P(4.9, 0.7, 3.2), {}, 12);
  // Water jars and banana plants, close by.
  for (const [x, z] of [[-W / 2 - 1.2, -3.2], [-W / 2 - 1.2, -4.0]] as [number, number][]) {
    b.sphere(0.34, 0x8a5a3a, P(x, 0.3, z, 0, 0, 0), { jit: 0.1 }, 10, 8);
  }
}

/** A log lodge, in the manner of the mountain places: squared logs, a green roof, a river-stone chimney. */
function buildLodge(b: Builder) {
  const ox = COTTAGE.x;
  const oy = COTTAGE.y;
  const oz = COTTAGE.z;
  const W = 6.2;
  const D = 9.4;
  const H = 2.75;
  const P = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => TRS(ox + x, oy + y, oz + z, rx, ry, rz);
  const LOG = PLASTER;
  // Stone footing.
  b.box(W + 0.3, 0.42, D + 0.3, STONE, P(0, 0.12, 0), { jit: 0.1 }, 0.06);
  // Courses of logs, ends crossing at the corners.
  const courses = 11;
  for (let i = 0; i < courses; i++) {
    const y = 0.42 + (i + 0.5) * (H / courses);
    const r = H / courses / 2 + 0.018;
    for (const z of [-D / 2, D / 2]) b.cyl(r, r, W + 0.9, LOG, P(0, y, z, 0, 0, Math.PI / 2), { jit: 0.09 }, 8);
    for (const x of [W / 2]) b.cyl(r, r, D + 0.9, LOG, P(x, y + r, 0, Math.PI / 2, 0, 0), { jit: 0.09 }, 8);
    for (const z of [-3.2, 3.2]) b.cyl(r, r, 3.0 + 0.45, LOG, P(-W / 2, y + r, z, Math.PI / 2, 0, 0), { jit: 0.09 }, 8);
    if (i > 7) b.cyl(r, r, 1.9, LOG, P(-W / 2, y + r, 0, Math.PI / 2, 0, 0), { jit: 0.09 }, 8);
  }
  // Door and windows, facing the lake.
  const dx = -W / 2 - 0.03;
  b.box(0.08, 2.1, 1.1, 0x4a2c1c, P(dx, 1.32, 0), { jit: 0.08 }, 0.02);
  b.sphere(0.045, 0xc9a24a, P(dx - 0.07, 1.25, 0.38), {}, 6, 5);
  for (const z of [-2.5, 2.5]) {
    b.box(0.06, 1.0, 1.1, 0xffc070, P(dx, 1.72, z), { emis: 1 }, 0.01);
    for (const s of [-1, 0, 1]) b.box(0.03, 1.0, 0.04, 0x2a1c14, P(dx - 0.04, 1.72, z + s * 0.36), {}, 0.005);
  }
  // Porch.
  b.box(2.4, 0.14, 4.4, WOOD_PALE, P(-W / 2 - 1.2, 0.3, 0), { jit: 0.1 }, 0.02);
  b.box(0.9, 0.16, 1.8, STONE, P(-W / 2 - 2.8, 0.05, 0), { jit: 0.15 }, 0.03);
  for (const z of [-2.0, 2.0]) b.cyl(0.11, 0.13, 2.5, LOG, P(-W / 2 - 2.2, 1.5, z), { jit: 0.1 }, 8);
  b.box(2.8, 0.1, 4.9, SHINGLE, P(-W / 2 - 1.2, 2.82, 0, 0, 0, 0.14), { jit: 0.06 }, 0.02);
  // Steep green metal roof, for the snow.
  const RISE = 3.2;
  const half = W / 2 + 0.7;
  const len = D + 1.4;
  const run = Math.hypot(half, RISE);
  const ang = Math.atan2(RISE, half);
  for (const side of [-1, 1]) {
    b.box(run + 0.06, 0.1, len, SHINGLE, P(side * half * 0.5, 0.42 + H + RISE * 0.5 - 0.05, 0, 0, 0, side * ang), { jit: 0.03 }, 0.02);
    for (let i = 0; i < 12; i++) b.box(run, 0.03, 0.05, 0x2e4436, P(side * half * 0.5, 0.42 + H + RISE * 0.5 + 0.02, -len / 2 + (i + 0.5) * (len / 12), 0, 0, side * ang), {}, 0.005);
  }
  for (const z of [-D / 2, D / 2]) {
    const gable = new THREE.Shape();
    gable.moveTo(-W / 2, 0);
    gable.lineTo(W / 2, 0);
    gable.lineTo(0, RISE * (W / 2) / half);
    gable.closePath();
    b.add(new THREE.ExtrudeGeometry(gable, { depth: 0.08, bevelEnabled: false }), WOOD, P(0, 0.42 + H, z - 0.04), { jit: 0.05 });
  }
  // River-stone chimney, up the north end.
  const cx = 1.15;
  const cz = D / 2 - 0.1;
  for (let i = 0; i < 16; i++) {
    const y = 0.5 + i * 0.5;
    b.box(1.1, 0.52, 0.95, STONE, P(cx, y, cz, 0, (i % 3) * 0.04, 0), { jit: 0.16 }, 0.08);
  }
  // Split wood, stacked for winter.
  for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) b.cyl(0.11, 0.11, 0.8, r % 2 ? 0x8a6a48 : 0x9a7a54, P(W / 2 + 0.5, 0.2 + r * 0.2, -3.2 + i * 0.25, Math.PI / 2, 0, 0.05), { jit: 0.12 }, 7);
}

export function makeProps(): PropWorld {
  const group = new THREE.Group();

  const b = new Builder(2024);
  if (MAP.props.house === 'nipa') buildNipaHut(b);
  else if (MAP.props.house === 'lodge') buildLodge(b);
  else buildCottage(b);
  buildBeachKit(b);
  const pathKit = buildPathKit(b);
  const jettyLamps = buildJetty(b);
  // Neither Bacuit Bay nor Moraine Lake has a lighthouse.
  const lighthouseLamp = MAP.props.beacon ? buildLighthouse(b) : new THREE.Vector3(0, -80, 0);
  buildPlaceKit(b);

  const glowMat = paintedMaterial();
  const mesh = solid(b.build(), glowMat);
  mesh.frustumCulled = false;
  group.add(mesh);

  // Sheets on the line: they swing in the wind and glow when the sun is behind them.
  const clothMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uWind;
      attribute vec3 aCol;
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vC;
      void main() {
        vec3 p = position;
        float hang = uv.y;
        float along = uv.x;
        float g = sin(uTime * 1.3 + along * 7.0 + p.z * 0.6) * 0.5 + sin(uTime * 2.7 + along * 13.0 + hang * 4.0) * 0.24;
        float amp = pow(hang, 1.4);
        p.x += (uWind.x * 0.34 + g * 0.2) * amp;
        p.z += g * 0.05 * amp;
        p.y += abs(g) * 0.03 * amp;
        vP = p;
        vN = normalize(vec3(g * 0.8 * amp + 1.0, 0.3 - hang * 0.4, sin(along * 11.0 + uTime) * 0.4));
        vC = aCol;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader:
      LIT_FRAG +
      /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vC;
      void main() {
        clipBelowWater(vP);
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 col = litSurface(vC, N, vP, 1.0, 1.0);
        col += vC * uKeyCol * 0.12 * sat(dot(-normalize(cameraPosition - vP), uKeyDir)) * keyShadow(vP, N);
        gl_FragColor = vec4(applyFog(col, vP), 1.0);
      }`,
    uniforms: { ...U },
    side: THREE.DoubleSide,
  });
  const clothB = new Builder(5);
  const lx = COTTAGE.x - 5.8;
  const lineZ0 = COTTAGE.z + 7.2;
  const lineZ1 = COTTAGE.z + 12.4;
  const ly = COTTAGE.y + 2.0;
  for (const z of [lineZ0, lineZ1]) {
    const gy = groundY(lx, z);
    clothB.box(0.09, ly - gy + 0.2, 0.09, WOOD, TRS(lx, gy + (ly - gy + 0.2) / 2, z), {}, 0.02);
    clothB.box(0.09, 0.09, 0.8, WOOD, TRS(lx, ly + 0.02, z), {}, 0.02);
  }
  clothB.tube([new THREE.Vector3(lx, ly - 0.01, lineZ0), new THREE.Vector3(lx, ly - 0.09, (lineZ0 + lineZ1) / 2), new THREE.Vector3(lx, ly - 0.01, lineZ1)], 0.008, 0xd7cdb7, {}, 8, 4);
  const line = solid(clothB.build(), paintedMaterial());
  group.add(line);

  const clothGeos: THREE.BufferGeometry[] = [];
  const sheet = (z0: number, w: number, h: number, col: number) => {
    const g = new THREE.PlaneGeometry(w, h, 16, 12);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const c = new THREE.Color(col);
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, lx + 0.0, ly - 0.05 - (h - uv.getY(i) * h), z0 + uv.getX(i) * w);
      uv.setY(i, 1 - uv.getY(i));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
    clothGeos.push(g);
  };
  sheet(lineZ0 + 0.22, 1.5, 1.5, 0xf0e6d2);
  sheet(lineZ0 + 1.85, 1.05, 1.15, 0xc9584a);
  sheet(lineZ0 + 3.05, 1.35, 1.32, 0xe8d7a8);
  for (const g of clothGeos) {
    const m = new THREE.Mesh(g, clothMat);
    m.layers.set(L.OPAQUE);
    m.frustumCulled = false;
    group.add(m);
  }

  const lamps: LampSpot[] = [...pathKit.lamps, ...jettyLamps];
  lamps.push({ x: COTTAGE.x - 3.9, y: COTTAGE.y + 2.1, z: COTTAGE.z, strength: 1.3 });

  return {
    group,
    glowMat,
    lamps,
    bench: pathKit.bench,
    chimney: MAP.props.house === 'nipa' ? new THREE.Vector3(COTTAGE.x + 4.9, COTTAGE.y + 1, COTTAGE.z + 3.2) : new THREE.Vector3(COTTAGE.x + 1.15, COTTAGE.y + 2.75 + 1.2 + 2.4 + 0.4, COTTAGE.z + 9.4 / 2 - 1.4),
    lighthouseLamp,
    cloth: clothMat,
  };
}

export { PATH_LENGTH };
