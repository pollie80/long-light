// Noise and atmosphere tables, generated on the GPU at boot so no art ships with the game.
import * as THREE from 'three';
import { fsMat, fsq } from './fsq';

const PERIODIC = /* glsl */ `
vec3 h33(ivec3 p, int per) {
  ivec3 q = ((p % per) + per) % per;
  return hash33v(vec3(q));
}
float perlin3(vec3 x, int per) {
  ivec3 i = ivec3(floor(x));
  vec3 f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n = 0.0;
  float r[8];
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    vec3 g = normalize(h33(i + o, per) * 2.0 - 1.0);
    r[k] = dot(g, f - vec3(o));
  }
  float a = mix(mix(r[0], r[1], u.x), mix(r[2], r[3], u.x), u.y);
  float b = mix(mix(r[4], r[5], u.x), mix(r[6], r[7], u.x), u.y);
  return mix(a, b, u.z);
}
float worley3(vec3 x, int per) {
  ivec3 i = ivec3(floor(x));
  vec3 f = fract(x);
  float d = 1.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    ivec3 o = ivec3(a, b, c);
    vec3 v = vec3(o) + h33(i + o, per) - f;
    d = min(d, dot(v, v));
  }
  return 1.0 - sqrt(d);
}
float pfbm(vec3 p, int f, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < oct; i++) {
    s += a * perlin3(p * float(f), f);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n * 0.5 + 0.5;
}
float wfbm(vec3 p, int f) {
  return worley3(p * float(f), f) * 0.625 + worley3(p * float(f * 2), f * 2) * 0.25 + worley3(p * float(f * 4), f * 4) * 0.125;
}
float rfbm(vec3 p, int f, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < oct; i++) {
    s += a * (1.0 - abs(perlin3(p * float(f), f)) * 2.0);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}`;

export function bakeNoise2D(r: THREE.WebGLRenderer, size = 1024) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    anisotropy: 8,
    depthBuffer: false,
  });
  const mat = fsMat(
    PERIODIC + /* glsl */ `
    varying vec2 vUv;
    void main() {
      vec3 p = vec3(vUv, 0.37);
      float a = pfbm(p, 6, 6);
      float b = pfbm(p + vec3(0.31, 0.67, 0.13), 5, 6);
      float c = wfbm(p, 8);
      float d = rfbm(p + 0.5, 6, 5);
      // Stretch contrast so thresholds downstream have useful range.
      a = smoothstep(0.18, 0.82, a);
      b = smoothstep(0.18, 0.82, b);
      gl_FragColor = vec4(a, b, c, d * 0.5 + 0.5);
    }`,
    {},
  );
  fsq(r, mat, rt);
  mat.dispose();
  return rt.texture;
}

export function bakeCloud3D(r: THREE.WebGLRenderer, size = 128) {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.wrapS = rt.texture.wrapT = rt.texture.wrapR = THREE.RepeatWrapping;
  const mat = fsMat(
    PERIODIC + /* glsl */ `
    varying vec2 vUv;
    uniform float uZ;
    void main() {
      vec3 p = vec3(vUv, uZ);
      float perlin = pfbm(p, 4, 5);
      perlin = smoothstep(0.25, 0.8, perlin);
      float w0 = wfbm(p, 4);
      float pw = sat(remap(perlin, w0 - 1.0, 1.0, 0.0, 1.0));
      float w1 = wfbm(p, 6);
      float w2 = wfbm(p, 12);
      gl_FragColor = vec4(pw, w1, w2, 1.0);
    }`,
    { uZ: { value: 0 } },
  );
  for (let z = 0; z < size; z++) {
    mat.uniforms.uZ.value = (z + 0.5) / size;
    fsq(r, mat, rt as unknown as THREE.WebGLRenderTarget, z);
  }
  mat.dispose();
  return rt.texture;
}

export function bakeTransmittance(r: THREE.WebGLRenderer) {
  const rt = new THREE.WebGLRenderTarget(512, 128, {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  const mat = fsMat(
    /* glsl */ `
    varying vec2 vUv;
    const float Rg = 6360e3, Rt = 6460e3;
    const vec3 bR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
    const float bMs = 3.996e-6, bMa = 4.4e-6;
    const vec3 bO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
    vec3 ext(float h) {
      return bR * exp(-h / 8000.0) + (bMs + bMa) * exp(-h / 1200.0) + bO * max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
    }
    void main() {
      float s = vUv.x * 2.0 - 1.0;
      float mu = sign(s) * s * s;
      float h = vUv.y * vUv.y * 1e5;
      vec3 ro = vec3(0.0, Rg + h, 0.0);
      vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
      float b = dot(ro, rd);
      float cG = dot(ro, ro) - Rg * Rg;
      float dG = b * b - cG;
      if (dG > 0.0 && -b - sqrt(dG) > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      float cT = dot(ro, ro) - Rt * Rt;
      float tMax = -b + sqrt(max(0.0, b * b - cT));
      const int N = 64;
      vec3 od = vec3(0.0);
      float dt = tMax / float(N);
      for (int i = 0; i < N; i++) {
        vec3 p = ro + rd * (float(i) + 0.5) * dt;
        od += ext(length(p) - Rg) * dt;
      }
      gl_FragColor = vec4(exp(-od), 1.0);
    }`,
    {},
  );
  fsq(r, mat, rt);
  mat.dispose();
  return rt.texture;
}

/** A sheet of paint-dab alpha shapes, four across and four down. */
export function makeDabAtlas(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cell = S / 4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate((i + 0.5) * cell, (j + 0.5) * cell);
      g.rotate(rnd() * Math.PI * 2);
      const blobs = 5 + Math.floor(rnd() * 5);
      for (let b = 0; b < blobs; b++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * cell * 0.2;
        const rx = cell * (0.09 + rnd() * 0.13);
        const ry = rx * (0.45 + rnd() * 0.5);
        const v = 200 + Math.floor(rnd() * 55);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.save();
        g.translate(Math.cos(a) * d, Math.sin(a) * d);
        g.rotate(rnd() * Math.PI);
        g.beginPath();
        // Ragged ellipse: looks like the mark of a loaded round brush.
        const pts = 22;
        for (let p = 0; p <= pts; p++) {
          const t = (p / pts) * Math.PI * 2;
          const w = 1 + (rnd() - 0.5) * 0.28;
          const x = Math.cos(t) * rx * w;
          const y = Math.sin(t) * ry * w;
          if (p === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
        g.restore();
      }
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}
