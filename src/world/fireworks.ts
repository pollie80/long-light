// Fireworks, let off when friends clink bottles. Every spark's path is worked out in the vertex shader from
// the time since its shell burst, so a whole sky of them costs almost nothing.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { L } from '../render/shared';

const SHELLS = 12;
const SPARKS = 340;
const RISE_S = 1.15;
const LIFE_S = 3.2;

const VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSeed;
  uniform float uT;
  uniform vec3 uFrom;
  uniform vec3 uBurst;
  uniform float uPx;
  uniform float uSpeed;
  uniform float uDrag;
  uniform float uFall;
  varying float vA;
  varying float vT;
  void main() {
    vec3 p;
    float size;
    if (uT < 0.0) {
      // Going up: the sparks string out behind the rising shell.
      float k = clamp(1.0 + uT / ${RISE_S.toFixed(2)}, 0.0, 1.0);
      float eased = 1.0 - (1.0 - k) * (1.0 - k);
      float behind = aSeed * 0.32;
      float e2 = max(eased - behind * (1.0 - eased * 0.7), 0.0);
      p = mix(uFrom, uBurst, e2) + aDir * 0.25 * aSeed;
      vA = (1.0 - aSeed) * smoothstep(0.0, 0.05, k) * step(aSeed, 0.5) * 0.55;
      size = 0.42;
      vT = 0.0;
    } else {
      float t = uT * (0.84 + aSeed * 0.32);
      float out_ = (1.0 - exp(-t * uDrag)) / uDrag;
      p = uBurst + aDir * uSpeed * out_ + vec3(0.0, -uFall * t * t, 0.0);
      float life = 1.0 - clamp(t / ${LIFE_S.toFixed(2)}, 0.0, 1.0);
      // A crackle towards the end, each spark on its own beat.
      float tw = 0.65 + 0.35 * sin(t * (24.0 + aSeed * 30.0) + aSeed * 80.0);
      vA = life * life * mix(1.0, tw, smoothstep(0.35, 0.9, t / ${LIFE_S.toFixed(2)}));
      size = 0.62 * (0.55 + life * 0.75);
      vT = t;
    }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uPx * size / -mv.z, 1.5, 22.0);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uGain;
  varying float vA;
  varying float vT;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.1, r);
    if (a * vA < 0.003) discard;
    vec3 c = mix(uColA, uColB, smoothstep(0.2, 1.3, vT));
    gl_FragColor = vec4(c * a * a * vA * uGain, a * vA);
  }`;

interface Shell {
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  /** Seconds to go until this shell is launched. */
  wait: number;
  active: boolean;
  burst: boolean;
  dist: number;
}

const PALETTE: [number, number, number][] = [
  [1, 0.22, 0.16], [1, 0.62, 0.14], [1, 0.86, 0.3], [0.3, 1, 0.42], [0.25, 0.62, 1], [0.72, 0.34, 1], [1, 0.34, 0.68], [1, 0.95, 0.85],
];

export class Fireworks {
  group = new THREE.Group();
  /** How many shows have been let off, for tests and curiosity. */
  shows = 0;
  onBurst: ((distance: number) => void) | null = null;
  onLaunch: ((distance: number) => void) | null = null;
  private shells: Shell[] = [];
  private rnd = mulberry32(2718);

  constructor() {
    const dir = new Float32Array(SPARKS * 3);
    const seed = new Float32Array(SPARKS);
    const pos = new Float32Array(SPARKS * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < SPARKS; i++) {
      v.set(this.rnd() - 0.5, this.rnd() - 0.5, this.rnd() - 0.5).normalize().multiplyScalar(0.72 + this.rnd() * 0.28);
      dir.set([v.x, v.y, v.z], i * 3);
      seed[i] = this.rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    for (let i = 0; i < SHELLS; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uT: { value: 0 },
          uFrom: { value: new THREE.Vector3() },
          uBurst: { value: new THREE.Vector3() },
          uPx: { value: 1000 },
          uSpeed: { value: 30 },
          uDrag: { value: 1.3 },
          uFall: { value: 1.6 },
          uColA: { value: new THREE.Color() },
          uColB: { value: new THREE.Color() },
          uGain: { value: 26 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      // Over still water, half the show is the reflection.
      points.layers.set(L.CLEAR);
      points.layers.enable(L.REFLECT_ONLY);
      points.visible = false;
      this.group.add(points);
      this.shells.push({ points, mat, wait: 0, active: false, burst: false, dist: 0 });
    }
  }

  /** A short show over the water, in front of the people who clinked. Bigger the more of them there are. */
  show(over: THREE.Vector3, people = 2) {
    this.shows += 1;
    const count = Math.min(SHELLS, 5 + people * 2);
    let wait = 0;
    let used = 0;
    for (const s of this.shells) {
      if (used >= count) break;
      if (s.active) continue;
      used += 1;
      const u = s.mat.uniforms;
      const spread = 34;
      const x = over.x + (this.rnd() - 0.5) * spread;
      const z = over.z + (this.rnd() - 0.5) * spread;
      u.uFrom.value.set(x + (this.rnd() - 0.5) * 6, 1, z + (this.rnd() - 0.5) * 6);
      u.uBurst.value.set(x, 34 + this.rnd() * 30, z);
      const last = used === count;
      // Round ones, and now and then a slow weeping willow to finish.
      const willow = last || this.rnd() < 0.2;
      u.uSpeed.value = last ? 46 : 24 + this.rnd() * 16;
      u.uDrag.value = willow ? 0.9 : 1.5;
      u.uFall.value = willow ? 2.9 : 1.3;
      const a = PALETTE[Math.floor(this.rnd() * PALETTE.length)];
      const b = willow ? [1, 0.72, 0.28] : PALETTE[Math.floor(this.rnd() * PALETTE.length)];
      u.uColA.value.setRGB(a[0], a[1], a[2]);
      u.uColB.value.setRGB(b[0], b[1], b[2]);
      s.wait = wait;
      wait += last ? 0 : 0.28 + this.rnd() * 0.42;
      s.active = true;
      s.burst = false;
      u.uT.value = -RISE_S - 0.001;
    }
  }

  update(dt: number, camera: THREE.Camera, viewH: number) {
    for (const s of this.shells) {
      if (!s.active) continue;
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) {
          s.points.visible = true;
          s.dist = camera.position.distanceTo(s.mat.uniforms.uBurst.value);
          this.onLaunch?.(s.dist);
        }
        continue;
      }
      if (!s.points.visible) {
        s.points.visible = true;
        s.dist = camera.position.distanceTo(s.mat.uniforms.uBurst.value);
        this.onLaunch?.(s.dist);
      }
      const u = s.mat.uniforms;
      u.uPx.value = viewH;
      u.uT.value += dt;
      if (!s.burst && u.uT.value >= 0) {
        s.burst = true;
        this.onBurst?.(s.dist);
      }
      if (u.uT.value > LIFE_S * 1.25) {
        s.active = false;
        s.points.visible = false;
      }
    }
  }
}
