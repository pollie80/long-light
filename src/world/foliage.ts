// Trees are clouds of camera-facing paint dabs on a volume with soft sphere normals. Grass and flowers
// are instanced blades coloured by the same noise as the ground they stand on.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, TRS } from './builder';
import { COTTAGE, groundY, JETTY, PATH, pathDistance, slopeAt } from './land';
import { L, LIT_FRAG, paintedMaterial, U } from '../render/shared';
import grassCol from '../shaders/grasscol.glsl?raw';
import { fbm, mulberry32, smoothstep } from '../core/noise';
import { MAP, MAP_GLSL } from './maps';
import { Q } from '../core/quality';

// ---- Dab clouds ------------------------------------------------------------------------------------

class CardSink {
  pos: number[] = [];
  center: number[] = [];
  corner: number[] = [];
  size: number[] = [];
  normal: number[] = [];
  dab: number[] = [];
  shade: number[] = [];
  idx: number[] = [];
  private n = 0;

  card(x: number, y: number, z: number, nx: number, ny: number, nz: number, s: number, shade: number, rnd: () => number) {
    const a = rnd() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cu = Math.floor(rnd() * 4);
    const cv = Math.floor(rnd() * 4);
    const yaw = rnd() * Math.PI;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const ru = u * ca - v * sa;
      const rv = u * sa + v * ca;
      // World-space corner, used by the shadow pass where nothing can face the camera.
      this.pos.push(x + cy * ru * s, y + rv * s, z + sy * ru * s);
      this.center.push(x, y, z);
      this.corner.push(ru, rv, (u + 1) * 0.5, (v + 1) * 0.5);
      this.size.push(s);
      this.normal.push(nx, ny, nz);
      this.dab.push(cu, cv);
      this.shade.push(shade);
    }
    const n = this.n;
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCenter', new THREE.Float32BufferAttribute(this.center, 3));
    const cornerAttr = new THREE.Float32BufferAttribute(this.corner, 4);
    g.setAttribute('aCorner', cornerAttr);
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('aDab', new THREE.Float32BufferAttribute(this.dab, 2));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(this.shade, 1));
    // The shadow pass reads uv from here.
    const uvs = new Float32Array((this.corner.length / 4) * 2);
    for (let i = 0; i < uvs.length / 2; i++) {
      uvs[i * 2] = this.corner[i * 4 + 2];
      uvs[i * 2 + 1] = this.corner[i * 4 + 3];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(this.idx);
    return g;
  }
}

function ellipsoidCards(sink: CardSink, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, count: number, size: number, rnd: () => number, globalCenter: [number, number, number]) {
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const k = Math.pow(rnd(), 0.22); // mostly near the shell
    const dx = s * Math.cos(t);
    const dy = u;
    const dz = s * Math.sin(t);
    const x = cx + dx * rx * k;
    const y = cy + dy * ry * k;
    const z = cz + dz * rz * k;
    // Normal blends the local lump with the whole crown, which gives big soft shading.
    let nx = dx * 0.6 + (x - globalCenter[0]) * 0.2;
    let ny = dy * 0.6 + (y - globalCenter[1]) * 0.2 + 0.1;
    let nz = dz * 0.6 + (z - globalCenter[2]) * 0.2;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const shade = Math.min(1, k * 0.55 + (dy * 0.5 + 0.5) * 0.45 + (rnd() - 0.5) * 0.15);
    sink.card(x, y, z, nx, ny, nz, size * (0.7 + rnd() * 0.6), Math.max(0, shade), rnd);
  }
}

function roundTree(rnd: () => number, detail: number): { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const H = 9;
  const sink = new CardSink();
  const gc: [number, number, number] = [0, H * 0.68, 0];
  const lobes = 9;
  const trunk = new Builder(11);
  const bark = 0x5c4436;
  trunk.cyl(0.32, 0.55, 4.5, bark, TRS(0, 2.2, 0, 0.03, 0, -0.02), { jit: 0.1 }, detail > 0.5 ? 10 : 5);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rnd();
    const d = i === 0 ? 0 : 1.5 + rnd() * 2.0;
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
    const cy = H * (i === 0 ? 0.82 : 0.56 + rnd() * 0.24);
    const r = 1.9 + rnd() * 1.2;
    ellipsoidCards(sink, cx, cy, cz, r, r * 0.8, r, Math.floor(300 * detail), detail > 0.5 ? 0.27 : 1.0, rnd, gc);
    if (i > 0 && detail > 0.5) {
      trunk.tube(
        [new THREE.Vector3(0, 3.8, 0), new THREE.Vector3(cx * 0.5, cy * 0.72, cz * 0.5), new THREE.Vector3(cx * 0.85, cy * 0.96, cz * 0.85)],
        0.11, bark, {}, 6, 5,
      );
    }
  }
  return { cards: sink.build(), trunk: trunk.build() };
}

function pineTree(rnd: () => number, detail: number): { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const H = 15;
  const sink = new CardSink();
  const gc: [number, number, number] = [0, H * 0.72, 0];
  const trunk = new Builder(22);
  const bark = 0x5e3f30;
  const lean = (rnd() - 0.5) * 0.5;
  const trunkPts = [
    new THREE.Vector3(0, -0.5, 0),
    new THREE.Vector3(lean * 0.3, H * 0.35, lean * 0.1),
    new THREE.Vector3(lean * 0.9, H * 0.7, lean * 0.2),
    new THREE.Vector3(lean, H * 0.96, lean * 0.1),
  ];
  if (detail > 0.5) {
    trunk.tube(trunkPts, 0.2, bark, {}, 10, 7);
    trunk.cyl(0.14, 0.42, 3.4, bark, TRS(0, 1.2, 0), {}, 8);
  } else {
    trunk.cyl(0.07, 0.34, H, bark, TRS(lean * 0.5, H * 0.5 - 0.4, 0), {}, 5);
  }
  const tiers = 8;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    // Storybook pine: umbrella-ish, tiers widen and flatten in the upper third.
    const y = H * (0.42 + t * 0.56);
    const R = (1 - t * 0.75) * 3.7 * (0.75 + rnd() * 0.35) * (t < 0.2 ? 0.75 + t * 1.2 : 1);
    const lobes = 4;
    for (let j = 0; j < lobes; j++) {
      const a = (j / lobes) * Math.PI * 2 + rnd() * 1.3;
      const d = R * 0.58;
      const cx = Math.cos(a) * d + lean * (y / H);
      const cz = Math.sin(a) * d;
      ellipsoidCards(sink, cx, y, cz, R * 0.58, 0.72 + (1 - t) * 0.3, R * 0.58, Math.floor(115 * detail), detail > 0.5 ? 0.26 : 1.05, rnd, gc);
      if (t < 0.7 && detail > 0.5) {
        trunk.tube([new THREE.Vector3(lean * (y / H), y - 0.3, 0), new THREE.Vector3(cx, y, cz)], 0.05, bark, {}, 3, 4);
      }
    }
  }
  return { cards: sink.build(), trunk: trunk.build() };
}

function palmTree(rnd: () => number, detail: number): { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const H = 10.5;
  const sink = new CardSink();
  const trunk = new Builder(33);
  const bark = 0x7d6a50;
  const lean = 0.9 + rnd() * 1.1;
  const top = new THREE.Vector3(lean, H, lean * 0.25);
  const gc: [number, number, number] = [top.x, top.y - 0.4, top.z];
  // A palm's trunk bows towards the light, and has a little kink low down from when it was young.
  const pts = [new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(lean * 0.12, H * 0.35, 0.05), new THREE.Vector3(lean * 0.5, H * 0.72, lean * 0.1), top];
  if (detail > 0.5) {
    trunk.tube(pts, 0.17, bark, {}, 12, 7);
    trunk.cyl(0.17, 0.3, 1.6, bark, TRS(0, 0.4, 0), {}, 8);
    for (let i = 0; i < 4; i++) trunk.sphere(0.13, 0x5c4028, TRS(top.x + Math.cos(i * 1.6) * 0.2, top.y - 0.22, top.z + Math.sin(i * 1.6) * 0.2), {}, 7, 5);
  } else {
    trunk.tube(pts, 0.15, bark, {}, 4, 4);
  }
  const fronds = 11;
  const steps = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.4;
    const len = 3.3 + rnd() * 1.1;
    const rise = 0.5 + rnd() * 0.75;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const out = len * t;
      const x = top.x + Math.cos(a) * out;
      const z = top.z + Math.sin(a) * out;
      const y = top.y + rise * Math.sin(t * Math.PI * 0.6) - 2.3 * t * t;
      const w = 0.62 * (1 - t * 0.62);
      ellipsoidCards(sink, x, y, z, w, 0.12, w, Math.max(1, Math.floor(30 * detail)), detail > 0.5 ? 0.17 : 0.72, rnd, gc);
    }
  }
  return { cards: sink.build(), trunk: trunk.build() };
}

function spruceTree(rnd: () => number, detail: number): { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const H = 18;
  const sink = new CardSink();
  const gc: [number, number, number] = [0, H * 0.55, 0];
  const trunk = new Builder(44);
  const bark = 0x4f3a2c;
  if (detail > 0.5) trunk.cyl(0.05, 0.38, H, bark, TRS(0, H * 0.5 - 0.4, 0), {}, 8);
  else trunk.cyl(0.05, 0.3, H, bark, TRS(0, H * 0.5 - 0.4, 0), {}, 5);
  // Narrow and pointed, wide skirts near the ground, the way a northern spruce sheds its snow.
  const tiers = 12;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = H * (0.1 + t * 0.88);
    const R = (1 - t) * 2.5 + 0.22;
    const lobes = t > 0.7 ? 2 : 4;
    for (let j = 0; j < lobes; j++) {
      const a = (j / lobes) * Math.PI * 2 + rnd() * 1.3;
      const d = R * 0.5;
      ellipsoidCards(sink, Math.cos(a) * d, y, Math.sin(a) * d, R * 0.62, 0.62, R * 0.62, Math.max(1, Math.floor(80 * detail)), detail > 0.5 ? 0.25 : 1.0, rnd, gc);
    }
  }
  return { cards: sink.build(), trunk: trunk.build() };
}

function shrub(rnd: () => number): { cards: THREE.BufferGeometry } {
  const sink = new CardSink();
  const gc: [number, number, number] = [0, 0.55, 0];
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.5;
    ellipsoidCards(sink, Math.cos(a) * d, 0.5 + rnd() * 0.2, Math.sin(a) * d, 0.62, 0.56, 0.62, 70, 0.15, rnd, gc);
  }
  return { cards: sink.build() };
}

export function dabMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute vec4 aCorner;
      attribute float aSize;
      attribute vec2 aDab;
      attribute float aShade;
      attribute vec3 aTintLo;
      attribute vec3 aTintHi;
      uniform float uTime;
      uniform vec2 uWind;
      varying vec3 vP;
      varying vec3 vN;
      varying vec2 vDabUv;
      varying float vShade;
      varying vec3 vCol;
      void main() {
        mat4 im = instanceMatrix;
        vec4 wc = modelMatrix * im * vec4(aCenter, 1.0);
        float phase = im[3].x * 0.13 + im[3].z * 0.17;
        float sway = sin(uTime * 0.9 + phase + aCenter.y * 0.4) * 0.6 + sin(uTime * 2.3 + phase * 2.0 + aCenter.x) * 0.25;
        float flutter = sin(uTime * 4.0 + aCenter.x * 3.0 + aCenter.z * 2.0 + phase) * 0.012;
        wc.xz += uWind * sway * 0.024 * clamp(aCenter.y, 0.0, 12.0) + flutter;
        float scale = length(im[1].xyz);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = wc.xyz + (camRight * aCorner.x + camUp * aCorner.y) * aSize * scale;
        vP = wp;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vDabUv = (aCorner.zw + aDab) / 4.0;
        vShade = aShade;
        float tintN = fract(sin(dot(aCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vCol = mix(aTintLo, aTintHi, aShade) * (0.78 + 0.44 * tintN) * vec3(1.0 + (tintN - 0.5) * 0.25, 1.0, 1.0 - (tintN - 0.5) * 0.2);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader:
      LIT_FRAG +
      /* glsl */ `
      uniform sampler2D uDabs;
      varying vec3 vP;
      varying vec3 vN;
      varying vec2 vDabUv;
      varying float vShade;
      varying vec3 vCol;
      void main() {
        clipBelowWater(vP);
        float a = texture2D(uDabs, vDabUv).r;
        if (a < 0.35) discard;
        float camD = length(vP - cameraPosition);
        if (camD < 4.5 && ign(gl_FragCoord.xy) > smoothstep(1.6, 4.5, camD)) discard;
        vec3 N = normalize(vN);
        float n = texture2D(uNoise, vP.xz * 0.11 + vP.y * 0.07).g;
        vec3 alb = vCol * (0.82 + 0.36 * n);
        vec3 col = litSurface(alb, N, vP, mix(0.5, 1.0, vShade), 1.0);
        gl_FragColor = vec4(applyFog(col, vP), smoothstep(0.35, 0.6, a));
      }`,
    uniforms: { ...U },
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
}

interface TreeInstance { x: number; z: number; y: number; s: number; rot: number; lo: THREE.Color; hi: THREE.Color }

function chunked(list: TreeInstance[], size: number): TreeInstance[][] {
  const cells = new Map<string, TreeInstance[]>();
  for (const t of list) {
    const k = `${Math.floor(t.x / size)},${Math.floor(t.z / size)}`;
    const c = cells.get(k);
    if (c) c.push(t);
    else cells.set(k, [t]);
  }
  return [...cells.values()];
}

function instanced(cards: THREE.BufferGeometry, mat: THREE.Material, list: TreeInstance[], layers: number[]): THREE.InstancedMesh {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(cards.attributes)) g.setAttribute(name, cards.attributes[name]);
  g.index = cards.index;
  g.boundingSphere = cards.boundingSphere ?? (cards.computeBoundingSphere(), cards.boundingSphere);
  const lo = new Float32Array(list.length * 3);
  const hi = new Float32Array(list.length * 3);
  const mesh = new THREE.InstancedMesh(g, mat, list.length);
  list.forEach((t, i) => {
    mesh.setMatrixAt(i, TRS(t.x, t.y, t.z, 0, t.rot, 0, t.s, t.s, t.s));
    lo.set([t.lo.r, t.lo.g, t.lo.b], i * 3);
    hi.set([t.hi.r, t.hi.g, t.hi.b], i * 3);
  });
  g.setAttribute('aTintLo', new THREE.InstancedBufferAttribute(lo, 3));
  g.setAttribute('aTintHi', new THREE.InstancedBufferAttribute(hi, 3));
  mesh.computeBoundingSphere();
  mesh.layers.disableAll();
  for (const l of layers) mesh.layers.enable(l);
  return mesh;
}

function trunkInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: TreeInstance[], layers: number[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => mesh.setMatrixAt(i, TRS(t.x, t.y, t.z, 0, t.rot, 0, t.s, t.s, t.s)));
  mesh.computeBoundingSphere();
  mesh.layers.disableAll();
  for (const l of layers) mesh.layers.enable(l);
  return mesh;
}

export const SPECIMEN_BENCH_TREE = { x: 72, z: -44 };

export function makeTrees(): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(777);
  const dabs = dabMaterial();
  const bark = paintedMaterial();

  const pinesNear: TreeInstance[] = [];
  const pinesFar: TreeInstance[] = [];
  const roundNear: TreeInstance[] = [];
  const roundFar: TreeInstance[] = [];
  const shrubs: TreeInstance[] = [];

  const TR = MAP.trees;
  const pineLo = () => new THREE.Color().setRGB(TR.tallLo[0] + rnd() * 0.012, TR.tallLo[1] + rnd() * 0.03, TR.tallLo[2] + rnd() * 0.02);
  const pineHi = () => new THREE.Color().setRGB(TR.tallHi[0][0] + rnd() * TR.tallHi[1][0], TR.tallHi[0][1] + rnd() * TR.tallHi[1][1], TR.tallHi[0][2] + rnd() * TR.tallHi[1][2]);
  const roundLo = () => new THREE.Color().setRGB(TR.roundLo[0] + rnd() * 0.012, TR.roundLo[1] + rnd() * 0.03, TR.roundLo[2] + rnd() * 0.015);
  const roundHi = () => {
    const [base, spread] = TR.roundHi[Math.floor(rnd() * TR.roundHi.length)];
    return new THREE.Color().setRGB(base[0] + rnd() * spread[0], base[1] + rnd() * spread[1], base[2] + rnd() * spread[2]);
  };
  const shrubLo = () => new THREE.Color().setRGB(0.012, 0.04, 0.03);
  const shrubHi = () => new THREE.Color().setRGB(0.12 + rnd() * 0.08, 0.2 + rnd() * 0.06, 0.07);

  const keepClear = (x: number, z: number) => {
    if (Math.hypot(x - COTTAGE.x, z - COTTAGE.z) < 19) return true;
    if (x < JETTY.startX + 8 && Math.abs(z) < 12) return true;
    if (x > 10 && x < 125 && z > -62 && z < 40) {
      if (pathDistance(x, z).d < 7) return true;
    }
    return false;
  };

  // Hand-placed trees that frame the walk.
  const heroes: [number, number, 'p' | 'r', number][] = [
    [SPECIMEN_BENCH_TREE.x, SPECIMEN_BENCH_TREE.z, 'r', 1.25],
    [97, -3, 'r', 1.05], [103, -44, 'p', 1.1], [90, -53, 'p', 1.2], [70, 22, 'p', 0.95], [44, 30, 'p', 1.1],
    [40, -21, 'r', 0.85], [50, -38, 'p', 0.9], [131, -6, 'r', 1.15], [136, -42, 'p', 1.25], [125, 9, 'p', 1.1],
    [80, 16, 'r', 0.9],
  ];
  for (const [x, z, k, s] of heroes) {
    const y = groundY(x, z) - 0.15;
    const inst: TreeInstance = { x, z, y, s, rot: rnd() * 6.28, lo: k === 'p' ? pineLo() : roundLo(), hi: k === 'p' ? pineHi() : roundHi() };
    (k === 'p' ? pinesNear : roundNear).push(inst);
  }

  const near = (x: number, z: number) => x > -20 && x < 210 && Math.abs(z) < 140;

  // Forests: clumps by noise, thicker further from the path, thinning along the shore.
  const tries = Math.floor(26000 * Q.trees);
  for (let i = 0; i < tries; i++) {
    const x = -420 + rnd() * 1250;
    const z = -640 + rnd() * 1280;
    if (keepClear(x, z)) continue;
    const y = groundY(x, z);
    if (y < TR.minY || y > TR.maxY) continue;
    const slope = slopeAt(x, z, 1.5);
    if (slope > 0.75) continue;
    const clump = fbm(x * 0.016, z * 0.016, 3) * 0.5 + 0.5;
    const fromCentre = Math.hypot(x - 60, z + 8);
    const meadow = 1 - smoothstep(60, 150, fromCentre);
    const p = smoothstep(0.34, 0.6, clump) * (1 - meadow * 0.93);
    if (rnd() > p) continue;
    const pine = y < TR.tallBelowY && rnd() < TR.tallShare + fbm(x * 0.004, z * 0.004, 2) * 0.5;
    const s = 0.65 + rnd() * 0.75;
    const inst: TreeInstance = { x, z, y: y - 0.2, s, rot: rnd() * 6.28, lo: pine ? pineLo() : roundLo(), hi: pine ? pineHi() : roundHi() };
    if (near(x, z) && (pine ? pinesNear.length : roundNear.length) < Q.nearTrees) (pine ? pinesNear : roundNear).push(inst);
    else (pine ? pinesFar : roundFar).push(inst);
  }

  // Shrubs along forest edges and rocks.
  for (let i = 0; i < 6000; i++) {
    const x = -60 + rnd() * 340;
    const z = -320 + rnd() * 640;
    if (keepClear(x, z)) continue;
    const y = groundY(x, z);
    if (y < 1.9) continue;
    if (slopeAt(x, z, 1) > 0.8) continue;
    if (rnd() > smoothstep(0.42, 0.62, fbm(x * 0.06 + 3, z * 0.06, 3) * 0.5 + 0.5)) continue;
    shrubs.push({ x, z, y: y - 0.1, s: 0.8 + rnd() * 1.6, rot: rnd() * 6.28, lo: shrubLo(), hi: shrubHi() });
  }

  const treeRnd = mulberry32(99);
  const tallTree = TR.tall === 'palm' ? palmTree : TR.tall === 'spruce' ? spruceTree : pineTree;
  const pineHiGeo = tallTree(treeRnd, 1);
  const pineLoGeo = tallTree(treeRnd, 0.07);
  const roundHiGeo = roundTree(treeRnd, 1);
  const roundLoGeo = roundTree(treeRnd, 0.07);
  const shrubGeo = shrub(treeRnd);

  // Near trees show their full dabs in the main view. Everything else, including the reflection and
  // the shadow maps, makes do with big dabs: the difference cannot be seen there.
  const SIZE = 120;
  const add = (list: TreeInstance[], hi: { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry }, lo: { cards: THREE.BufferGeometry; trunk: THREE.BufferGeometry }, near: boolean) => {
    for (const c of chunked(list, SIZE)) {
      if (near) {
        group.add(instanced(hi.cards, dabs, c, [L.MAIN_ONLY]));
        group.add(trunkInstanced(hi.trunk, bark, c, [L.OPAQUE, L.CAST_SOLID]));
        group.add(instanced(lo.cards, dabs, c, [L.REFLECT_ONLY, L.CAST_FOLIAGE]));
      } else {
        group.add(instanced(lo.cards, dabs, c, [L.OPAQUE, L.CAST_FOLIAGE]));
        group.add(trunkInstanced(lo.trunk, bark, c, [L.OPAQUE, L.CAST_SOLID]));
      }
    }
  };
  add(pinesNear, pineHiGeo, pineLoGeo, true);
  add(roundNear, roundHiGeo, roundLoGeo, true);
  add(pinesFar, pineHiGeo, pineLoGeo, false);
  add(roundFar, roundHiGeo, roundLoGeo, false);
  for (const c of chunked(shrubs, SIZE)) group.add(instanced(shrubGeo.cards, dabs, c, [L.MAIN_ONLY]));
  return group;
}

// ---- Grass, reeds, flowers -------------------------------------------------------------------------

const GRASS_VERT = /* glsl */ `
  attribute vec4 aBase;
  attribute vec4 aMeta;
  attribute vec3 aTip;
  uniform float uTime;
  uniform vec2 uWind;
  uniform vec3 uPlayer;
  uniform sampler2D uNoise;
  uniform float uFarFade;
  uniform float uUseGround;
  varying vec3 vP;
  varying vec3 vN;
  varying float vT;
  varying vec3 vBase;
  varying vec3 vTipCol;
  ${MAP_GLSL}${grassCol}
  void main() {
    float t = position.y;
    vec3 base = aBase.xyz;
    float dist = length(base.xz - cameraPosition.xz);
    float lod = (1.0 - smoothstep(uFarFade * 0.62, uFarFade, dist)) * smoothstep(0.8, 2.6, length(aBase.xyz - cameraPosition));
    float h = aMeta.x * lod;
    float w = aMeta.y * (0.8 + dist * 0.05) * lod;
    float r = aBase.w;
    vec3 side = vec3(cos(r), 0.0, sin(r));
    vec3 fwd = vec3(-sin(r), 0.0, cos(r));
    float gust = textureLod(uNoise, base.xz * 0.011 + uWind * uTime * 0.032, 1.0).r - 0.5;
    float sway = sin(uTime * 1.6 + base.x * 0.33 + base.z * 0.27 + aMeta.z * 6.0) * 0.14 + gust * 1.5;
    vec2 windDir = normalize(uWind);
    float lean = aMeta.w;
    vec3 p = base;
    p += side * position.x * w * (1.0 - t * t);
    p.y += h * t * (1.0 - 0.14 * lean * lean);
    p += fwd * lean * h * t * t * 0.6;
    p.xz += windDir * sway * h * t * t * 0.55;
    // Blades part around the walker.
    vec2 away = p.xz - uPlayer.xz;
    float ad = length(away);
    float push = (1.0 - smoothstep(0.1, 0.9, ad)) * t;
    if (ad > 0.001) p.xz += away / ad * push * 0.42;
    p.y -= push * 0.1;
    vP = p;
    vT = t;
    // Mostly the ground's normal, so a field shades as one surface.
    vN = normalize(vec3(fwd.x * 0.22 + windDir.x * sway * 0.2, 1.0, fwd.z * 0.22 + windDir.y * sway * 0.2));
    vBase = uUseGround > 0.5 ? grassColor(base.xz, 2.0) : aTip * 0.6;
    vTipCol = aTip;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const GRASS_FRAG =
  LIT_FRAG +
  /* glsl */ `
  uniform float uUseGround;
  varying vec3 vP;
  varying vec3 vN;
  varying float vT;
  varying vec3 vBase;
  varying vec3 vTipCol;
  void main() {
    clipBelowWater(vP);
    vec3 N = normalize(vN);
    vec3 tipCol = mix(vBase * 1.3, vTipCol, 0.55);
    vec3 alb = mix(vBase * 0.62, tipCol, smoothstep(0.0, 0.95, vT));
    vec3 col = litSurface(alb, N, vP, mix(0.62, 1.0, vT), vT * 0.8);
    gl_FragColor = vec4(applyFog(col, vP), 1.0);
  }`;

function bladeGeometry(segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pos.push(-1, t, 0, 1, t, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

interface Blade { x: number; y: number; z: number; rot: number; h: number; w: number; seed: number; lean: number; tip: [number, number, number] }

function bladeMesh(blades: Blade[], blade: THREE.BufferGeometry, mat: THREE.Material, layer: number): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  g.index = blade.index;
  g.setAttribute('position', blade.attributes.position);
  const base = new Float32Array(blades.length * 4);
  const meta = new Float32Array(blades.length * 4);
  const tip = new Float32Array(blades.length * 3);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  blades.forEach((b, i) => {
    base.set([b.x, b.y, b.z, b.rot], i * 4);
    meta.set([b.h, b.w, b.seed, b.lean], i * 4);
    tip.set(b.tip, i * 3);
    cx += b.x;
    cy += b.y;
    cz += b.z;
  });
  g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
  g.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 4));
  g.setAttribute('aTip', new THREE.InstancedBufferAttribute(tip, 3));
  g.instanceCount = blades.length;
  const n = Math.max(1, blades.length);
  const c = new THREE.Vector3(cx / n, cy / n, cz / n);
  let r = 0;
  for (const b of blades) r = Math.max(r, Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z));
  g.boundingSphere = new THREE.Sphere(c, r + 3);
  const m = new THREE.Mesh(g, mat);
  m.layers.set(layer);
  return m;
}

export function makeGrass(): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(4242);
  const grassMat = new THREE.ShaderMaterial({
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    uniforms: { ...U, uFarFade: { value: 150 }, uUseGround: { value: 1 } },
    side: THREE.DoubleSide,
  });
  const reedMat = new THREE.ShaderMaterial({
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    uniforms: { ...U, uFarFade: { value: 600 }, uUseGround: { value: 0 } },
    side: THREE.DoubleSide,
  });
  const blade = bladeGeometry(3);
  const reedBlade = bladeGeometry(7);

  const CH = 22;
  const cells = new Map<string, Blade[]>();
  const push = (b: Blade) => {
    const key = `${Math.floor(b.x / CH)},${Math.floor(b.z / CH)}`;
    const a = cells.get(key);
    if (a) a.push(b);
    else cells.set(key, [b]);
  };

  // A height cache makes placing hundreds of thousands of blades affordable.
  const X0 = -12;
  const X1 = 188;
  const Z0 = -130;
  const Z1 = 110;
  const STEP = 1.0;
  const NX = Math.ceil((X1 - X0) / STEP) + 1;
  const NZ = Math.ceil((Z1 - Z0) / STEP) + 1;
  const hc = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) hc[j * NX + i] = groundY(X0 + i * STEP, Z0 + j * STEP);
  const hAt = (x: number, z: number) => {
    const fx = (x - X0) / STEP;
    const fz = (z - Z0) / STEP;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= NX - 1 || j >= NZ - 1) return -9;
    const a = hc[j * NX + i];
    const b = hc[j * NX + i + 1];
    const c = hc[(j + 1) * NX + i];
    const d = hc[(j + 1) * NX + i + 1];
    const u = fx - i;
    const v = fz - j;
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };

  const pathCache = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = X0 + i * STEP;
      const z = Z0 + j * STEP;
      pathCache[j * NX + i] = x > 8 && x < 128 && z > -60 && z < 40 ? pathDistance(x, z).d : 99;
    }
  }
  const pAt = (x: number, z: number) => {
    const i = Math.round((x - X0) / STEP);
    const j = Math.round((z - Z0) / STEP);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return 99;
    return pathCache[j * NX + i];
  };

  const flowers: Blade[] = [];
  const flowerCols: [number, number, number][] = [
    [0.86, 0.82, 0.68], [0.95, 0.72, 0.12], [0.72, 0.13, 0.11], [0.42, 0.28, 0.72], [0.9, 0.42, 0.55],
  ];

  const total = Math.floor(1500000 * Q.grass);
  for (let i = 0; i < total; i++) {
    let x: number;
    let z: number;
    if (i % 5 < 3) {
      // Three blades in five grow close to the walk, where they can be seen.
      const pp = PATH[Math.floor(rnd() * PATH.length)];
      const r = 2 + rnd() * rnd() * 46;
      const a = rnd() * Math.PI * 2;
      x = pp.x + Math.cos(a) * r;
      z = pp.z + Math.sin(a) * r;
    } else {
      x = X0 + rnd() * (X1 - X0);
      z = Z0 + rnd() * (Z1 - Z0);
    }
    const y = hAt(x, z);
    if (y < 1.62 + fbm(x * 0.12, z * 0.12, 2) * 0.55) continue;
    const d = pAt(x, z);
    if (d < 1.0) continue;
    const cottage = Math.hypot(x - COTTAGE.x, z - COTTAGE.z);
    const dens = fbm(x * 0.05 + 5.1, z * 0.05 - 2.2, 3) * 0.5 + 0.6;
    const pathBoost = d < 12 ? 1 : 0.68;
    if (rnd() > dens * pathBoost) continue;
    const tall = fbm(x * 0.03, z * 0.03, 2) * 0.5 + 0.6;
    const h = (0.24 + rnd() * 0.36) * tall * (d < 2.2 ? 0.5 : 1) * (cottage < 13 ? 0.6 : 1);
    push({
      x, y: y - 0.02, z, rot: rnd() * 6.28,
      h, w: 0.02 + rnd() * 0.022, seed: rnd(), lean: (rnd() - 0.5) * 1.1,
      tip: [0.2 + rnd() * 0.15, 0.3 + rnd() * 0.12, 0.08 + rnd() * 0.05],
    });
    // Wildflowers gather in drifts.
    const drift = fbm(x * 0.085 - 7.1, z * 0.085 + 3.3, 2);
    if (drift > 0.12 && rnd() < 0.09) {
      const fc = flowerCols[Math.floor(((drift * 7.3 + x * 0.03) % 1 + 1) % 1 * flowerCols.length)];
      flowers.push({ x, y: y + h * 0.9, z, rot: rnd() * 6.28, h: 0.06, w: 0.032, seed: rnd(), lean: 0, tip: fc });
    }
  }
  for (const list of cells.values()) {
    const m = bladeMesh(list, blade, grassMat, L.MAIN_ONLY);
    m.userData.grassChunk = true;
    group.add(m);
  }

  // Flowers: short, wide blades with their own colour.
  if (flowers.length) group.add(bladeMesh(flowers, blade, reedMat, L.MAIN_ONLY));

  // Reeds stand in the shallows either side of the beach. They reflect, and they catch the low sun.
  const reeds: Blade[] = [];
  for (let i = 0; i < 90000 * Math.max(Q.grass, 0.35); i++) {
    const x = -150 + rnd() * 240;
    const z = -240 + rnd() * 480;
    if (Math.abs(z) < 14 && x < JETTY.startX) continue;
    const y = groundY(x, z);
    if (y > 0.45 || y < -0.62) continue;
    if (fbm(x * 0.045, z * 0.045 + 9, 3) < 0.06) continue;
    const gold = rnd();
    reeds.push({
      x, y: y - 0.05, z, rot: rnd() * 6.28, h: 1.1 + rnd() * 1.4, w: 0.02 + rnd() * 0.014, seed: rnd(), lean: (rnd() - 0.5) * 0.7,
      tip: [0.34 + gold * 0.34, 0.33 + gold * 0.16, 0.07],
    });
  }
  // Dune grass on the crest of the beach, pale gold.
  for (let i = 0; i < 26000; i++) {
    const x = 8 + rnd() * 34;
    const z = -160 + rnd() * 320;
    if (Math.abs(z) < 3 && x < JETTY.startX + 3) continue;
    const y = groundY(x, z);
    if (y < 0.72 || y > 2.5) continue;
    if (fbm(x * 0.09, z * 0.09 - 4, 2) < 0.1) continue;
    reeds.push({
      x, y: y - 0.05, z, rot: rnd() * 6.28, h: 0.4 + rnd() * 0.5, w: 0.016 + rnd() * 0.012, seed: rnd(), lean: 0.3 + rnd() * 0.5,
      tip: [0.5 + rnd() * 0.25, 0.4 + rnd() * 0.1, 0.13],
    });
  }
  if (reeds.length) group.add(bladeMesh(reeds, reedBlade, reedMat, L.OPAQUE));

  return group;
}

// ---- Rocks ------------------------------------------------------------------------------------------

export function makeRocks(): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(555);
  const b = new Builder(556);
  const lump = (x: number, y: number, z: number, s: number, flat = 0.7, col = 0x7e7480) => {
    const ico = new THREE.IcosahedronGeometry(1, 3);
    ico.deleteAttribute('uv');
    ico.deleteAttribute('normal');
    const geo = mergeVertices(ico, 1e-3);
    const p = geo.attributes.position;
    const seed = rnd() * 100;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const n = 1 + fbm(vx * 1.3 + seed, vz * 1.3 + vy, 3) * 0.55;
      p.setXYZ(i, vx * n, vy * n, vz * n);
    }
    geo.computeVertexNormals();
    b.add(geo, col, TRS(x, y, z, rnd(), rnd() * 6, rnd() * 0.3, s, s * flat, s * (0.8 + rnd() * 0.4)), { jit: 0.3, hue: 0.03, ao: 0.4 });
  };
  // Beach boulders either side of the jetty.
  const spots: [number, number, number][] = [
    [8, -7.5, 1.7], [4.5, -9.2, 1.0], [10.5, -10.5, 1.2], [6.5, 8.2, 1.5], [10, 10.5, 0.9], [2.5, 9.5, 1.1],
    [20, -15, 1.5], [24, 18, 1.3], [45, -14, 1.2], [74, 11, 1.5], [86, -50, 1.3], [88, -13, 0.9], [108, -2, 1.0],
  ];
  for (const [x, z, s] of spots) lump(x, groundY(x, z) + s * 0.1, z, s);
  // Scattered shoreline rocks.
  for (let i = 0; i < 300; i++) {
    const x = -340 + rnd() * 520;
    const z = -300 + rnd() * 600;
    const y = groundY(x, z);
    if (y > 2.2 || y < -0.8) continue;
    if (Math.abs(z) < 22 && x > -40) continue;
    lump(x, y, z, 0.5 + rnd() * rnd() * 3.2, 0.6);
  }
  const mesh = new THREE.Mesh(b.build(), paintedMaterial());
  mesh.layers.set(L.OPAQUE);
  mesh.layers.enable(L.CAST_SOLID);
  mesh.frustumCulled = false;
  group.add(mesh);
  return group;
}

/** Hides grass chunks too far away to be seen, so their vertices cost nothing. */
export function cullGrass(group: THREE.Object3D, cam: THREE.Vector3) {
  for (const c of group.children) {
    if (!c.userData.grassChunk) continue;
    const m = c as THREE.Mesh;
    const s = m.geometry.boundingSphere!;
    m.visible = s.center.distanceTo(cam) - s.radius < 158;
  }
}
