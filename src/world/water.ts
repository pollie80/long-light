// Water surface, the live wave spectrum, and the ripple simulation.
import * as THREE from 'three';
import { fsMat, fsq } from '../render/fsq';
import { L, LIT_FRAG, U } from '../render/shared';
import waterFrag from '../shaders/water.glsl?raw';
import { MAP } from './maps';
import { Q } from '../core/quality';

const waterFrag_MAP = waterFrag.replace('vec3 absorb = vec3(0.42, 0.11, 0.075);', `vec3 absorb = vec3(${MAP.water.absorb.join(', ')});`);
import { MAGIC_SPOTS, SWELL_GLSL } from './land';
import { mulberry32 } from '../core/noise';

const WAVES = 64;
const RIP = Q.ripple;
const RIP_WORLD = 180;
const MAX_DROPS = 12;

export class Water {
  mesh: THREE.Mesh;
  waves: THREE.WebGLRenderTarget;
  private waveMat: THREE.ShaderMaterial;
  private ripA: THREE.WebGLRenderTarget;
  private ripB: THREE.WebGLRenderTarget;
  private ripMat: THREE.ShaderMaterial;
  private drops: THREE.Vector4[] = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  private dropN = 0;
  private center = new THREE.Vector2();
  private acc = 0;
  mat: THREE.ShaderMaterial;

  constructor(private r: THREE.WebGLRenderer) {
    // Spectrum: integer wave numbers, so the bake tiles perfectly.
    const rnd = mulberry32(1234);
    const k: THREE.Vector4[] = [];
    const P = 32;
    const windA = 0.65;
    for (let i = 0; i < WAVES; i++) {
      const band = Math.pow(i / (WAVES - 1), 1.4);
      const mag = 2 + band * 62;
      const spread = (rnd() - 0.5) * (1.6 + band * 2.6);
      const a = windA + spread;
      const nx = Math.round(Math.cos(a) * mag);
      const nz = Math.round(Math.sin(a) * mag);
      const kx = (nx * Math.PI * 2) / P;
      const kz = (nz * Math.PI * 2) / P;
      const kl = Math.hypot(kx, kz) || 1;
      const amp = 0.0115 / Math.pow(kl, 1.05) * (0.55 + rnd() * 0.9);
      const omega = Math.sqrt(9.81 * kl) * 0.72;
      k.push(new THREE.Vector4(nx, nz, amp, omega + rnd() * 0.01));
    }
    const phases = Array.from({ length: WAVES }, () => rnd() * Math.PI * 2);
    this.waves = new THREE.WebGLRenderTarget(512, 512, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      anisotropy: 16,
      depthBuffer: false,
    });
    this.waveMat = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform vec4 uK[${WAVES}];
      uniform float uPh[${WAVES}];
      uniform float uT;
      void main() {
        vec2 p = vUv * TAU;
        float h = 0.0;
        vec2 s = vec2(0.0);
        float c = 0.0;
        for (int i = 0; i < ${WAVES}; i++) {
          vec4 K = uK[i];
          float ph = dot(p, K.xy) + K.w * uT + uPh[i];
          float si = sin(ph);
          float co = cos(ph);
          // Sharpen crests a little so the surface reads as water, not corduroy.
          float sharp = exp(si * 0.9 - 0.9);
          float kx = K.x * TAU / 32.0;
          float kz = K.y * TAU / 32.0;
          h += K.z * sharp;
          s += K.z * sharp * 0.9 * co * vec2(kx, kz);
          c += K.z * sharp * (kx * kx + kz * kz) * (sqr(0.9 * co) - 0.9 * si);
        }
        gl_FragColor = vec4(s, h, c);
      }`,
      { uK: { value: k }, uPh: { value: phases }, uT: { value: 0 } },
    );

    const mkR = () =>
      new THREE.WebGLRenderTarget(RIP, RIP, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
      });
    this.ripA = mkR();
    this.ripB = mkR();
    this.ripMat = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D t;
      uniform vec2 uShift;
      uniform vec4 uDrops[${MAX_DROPS}];
      uniform int uN;
      uniform vec4 uRect;
      void main() {
        vec2 uv = vUv + uShift;
        float e = 1.0 / ${RIP}.0;
        vec4 c = texture2D(t, uv);
        float n = texture2D(t, uv + vec2(0.0, e)).r;
        float s = texture2D(t, uv - vec2(0.0, e)).r;
        float a = texture2D(t, uv + vec2(e, 0.0)).r;
        float b = texture2D(t, uv - vec2(e, 0.0)).r;
        float h = c.r;
        float v = c.g;
        v += ((n + s + a + b) * 0.25 - h) * 0.88;
        v *= 0.991;
        h += v;
        h *= 0.9992;
        float foam = c.b * 0.9925;
        float energy = c.a * 0.986;
        vec2 world = (vUv - 0.5) * uRect.zw + uRect.xy;
        for (int i = 0; i < uN; i++) {
          vec4 d = uDrops[i];
          float q = length(world - d.xy) / d.z;
          if (q < 1.0) {
            float w = sqr(cos(q * PI * 0.5));
            h -= d.w * w;
            foam += abs(d.w) * w * 0.9;
            energy += abs(d.w) * w * 1.6;
          }
        }
        // Outside the texture nothing exists, so damp the edge rather than reflect.
        vec2 q = abs(vUv - 0.5) * 2.0;
        float edge = smoothstep(1.0, 0.92, max(q.x, q.y));
        gl_FragColor = vec4(h * edge, v * edge, sat(foam) * edge, sat(energy) * edge);
      }`,
      {
        t: { value: null },
        uShift: { value: new THREE.Vector2() },
        uDrops: { value: this.drops },
        uN: { value: 0 },
        uRect: { value: new THREE.Vector4(0, 0, RIP_WORLD, RIP_WORLD) },
      },
    );

    // Camera-centred polar grid: fine near the viewer, stretching to the horizon.
    const rings = 340;
    const sides = 512;
    const pos: number[] = [];
    const idx: number[] = [];
    pos.push(0, 0, 0);
    for (let j = 1; j <= rings; j++) {
      const t = j / rings;
      const rr = 0.4 * Math.pow(52000 / 0.4, t);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < sides; i++) idx.push(0, 1 + ((i + 1) % sides), 1 + i);
    for (let j = 0; j < rings - 1; j++) {
      const a0 = 1 + j * sides;
      const b0 = a0 + sides;
      for (let i = 0; i < sides; i++) {
        const i1 = (i + 1) % sides;
        idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);

    const swell = SWELL_GLSL.map(([dx, dz, a, wl, ph]) => new THREE.Vector4(dx * ((Math.PI * 2) / wl), dz * ((Math.PI * 2) / wl), a, ph));
    const omega = SWELL_GLSL.map(([, , , wl]) => Math.sqrt(9.81 * ((Math.PI * 2) / wl)));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vP;
        varying float vViewZ;
        uniform vec4 uSwell[4];
        uniform float uOmega[4];
        uniform float uTimeW;
        void main() {
          vec3 p = position + vec3(cameraPosition.x, 0.0, cameraPosition.z);
          float y = 0.0;
          float fade = 1.0 - smoothstep(30.0, 280.0, length(position.xz));
          for (int i = 0; i < 4; i++) {
            y += uSwell[i].z * sin(dot(p.xz, uSwell[i].xy) + uOmega[i] * uTimeW + uSwell[i].w);
          }
          p.y = y * fade;
          vP = p;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: LIT_FRAG + waterFrag_MAP,
      uniforms: {
        ...U,
        uSwell: { value: swell },
        uOmega: { value: omega },
        uTimeW: U.uTime,
        uScene: { value: null },
        uDepth: { value: null },
        uReflect: { value: null },
        uWaves: { value: this.waves.texture },
        uRipple: { value: this.ripA.texture },
        uReflectVP: { value: new THREE.Matrix4() },
        uRippleRect: { value: new THREE.Vector4(0, 0, RIP_WORLD, RIP_WORLD) },
        uScatter: { value: new THREE.Vector3(0.1, 0.3, 0.3) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNearZ: { value: 0.3 },
        uFarZ: { value: 30000 },
        uGlow: { value: 0 },
        uLanternPos: { value: new THREE.Vector3() },
        uLanternCol: { value: new THREE.Vector3() },
        uMagic: { value: MAGIC_SPOTS.map((m) => new THREE.Vector4(m.x, m.z, m.r, m.hue)) },
        uMagicAmt: { value: 0 },
      },
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(L.CLEAR);
  }

  /** Disturb the water at a world position. radius in metres, strength around 0.02 to 0.3. */
  splash(x: number, z: number, radius: number, strength: number) {
    if (this.dropN >= MAX_DROPS) return;
    this.drops[this.dropN++].set(x, z, radius, strength);
  }

  update(dt: number, time: number, centerX: number, centerZ: number) {
    this.waveMat.uniforms.uT.value = time;
    fsq(this.r, this.waveMat, this.waves);

    // Ripple grid follows the viewer, snapped to texels so it does not swim.
    const cell = RIP_WORLD / RIP;
    const cx = Math.round(centerX / cell) * cell;
    const cz = Math.round(centerZ / cell) * cell;
    this.acc = Math.min(this.acc + dt, 0.05);
    const step = 1 / 90;
    const u = this.ripMat.uniforms;
    u.uN.value = this.dropN;
    let first = true;
    while (this.acc >= step) {
      this.acc -= step;
      u.t.value = this.ripA.texture;
      if (first) {
        u.uShift.value.set((cx - this.center.x) / RIP_WORLD, (cz - this.center.y) / RIP_WORLD);
        this.center.set(cx, cz);
      } else {
        u.uShift.value.set(0, 0);
      }
      u.uRect.value.set(cx, cz, RIP_WORLD, RIP_WORLD);
      fsq(this.r, this.ripMat, this.ripB);
      [this.ripA, this.ripB] = [this.ripB, this.ripA];
      if (first) u.uN.value = 0;
      first = false;
    }
    if (!first) this.dropN = 0;
    this.mat.uniforms.uRipple.value = this.ripA.texture;
    this.mat.uniforms.uRippleRect.value.set(this.center.x, this.center.y, RIP_WORLD, RIP_WORLD);
  }
}
