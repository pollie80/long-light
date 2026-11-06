// The land mesh, and the far mountains that wrap the horizon.
import * as THREE from 'three';
import { COTTAGE, groundY, PATH } from './land';
import { L, LIT_FRAG, U } from '../render/shared';
import { fbm, mulberry32, ridged } from '../core/noise';
import { MAP, MAP_GLSL } from './maps';
import { Q } from '../core/quality';
import grassCol from '../shaders/grasscol.glsl?raw';

const CENTER = { x: 40, z: 0 };
const SEGS = Q.terrainSegs;
/** The ground is cut into this many pieces a side, so whatever is behind you isn't drawn. */
const PIECES = 8;
const HALF = 1300;

function pathTexture(): { tex: THREE.CanvasTexture; rect: THREE.Vector4 } {
  const rect = new THREE.Vector4(4, -60, 136, 100); // x, z, width, depth in metres
  const S = 8; // pixels per metre
  const c = document.createElement('canvas');
  c.width = rect.z * S;
  c.height = rect.w * S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const X = (x: number) => (x - rect.x) * S;
  const Z = (z: number) => (z - rect.y) * S;
  const rnd = mulberry32(42);

  // Worn earth, the core of the path, with soft edges.
  g.filter = `blur(${0.32 * S}px)`;
  g.strokeStyle = '#ff0000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 1.75 * S;
  g.beginPath();
  PATH.forEach((p, i) => (i === 0 ? g.moveTo(X(p.x), Z(p.z)) : g.lineTo(X(p.x), Z(p.z))));
  g.stroke();
  g.filter = 'none';

  // Stepping stones, irregular and a bit off-centre, in the green channel.
  g.globalCompositeOperation = 'lighter';
  for (let i = 2; i < PATH.length - 2; i += 1) {
    if (rnd() < 0.3) continue;
    const p = PATH[i];
    const off = (rnd() - 0.5) * 1.5;
    const q = PATH[i + 1];
    const nx = -(q.z - p.z);
    const nz = q.x - p.x;
    const l = Math.hypot(nx, nz) || 1;
    const x = p.x + (nx / l) * off;
    const z = p.z + (nz / l) * off;
    const r = (0.17 + rnd() * 0.28) * S;
    g.fillStyle = '#00ff00';
    g.beginPath();
    g.ellipse(X(x), Z(z), r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return { tex, rect };
}

export function makeTerrain(): THREE.Group {
  const n = SEGS + 1;
  const pos = new Float32Array(n * n * 3);
  const warp = (t: number) => t * (0.12 + 0.88 * t * t);
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const v = warp((j / SEGS) * 2 - 1) * HALF + CENTER.z;
    for (let i = 0; i < n; i++) {
      const u = warp((i / SEGS) * 2 - 1) * HALF + CENTER.x;
      const y = groundY(u, v);
      heights[j * n + i] = y;
      const k = (j * n + i) * 3;
      pos[k] = u;
      pos[k + 1] = y;
      pos[k + 2] = v;
    }
  }
  const idx = new Uint32Array(SEGS * SEGS * 6);
  let q = 0;
  for (let j = 0; j < SEGS; j++) {
    for (let i = 0; i < SEGS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const { tex, rect } = pathTexture();
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        vN = normal;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader:
      LIT_FRAG +
      MAP_GLSL +
      grassCol +
      /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      uniform sampler2D uPathTex;
      uniform vec4 uPathRect;
      uniform vec2 uCottage;

      void main() {
        clipBelowWater(vP);
        vec3 N = normalize(vN);
        float dist = length(vP - cameraPosition);

        vec2 xz = vP.xz;
        float n1 = texture2D(uNoise, xz * 0.0065).r;
        float n2 = texture2D(uNoise, xz * 0.031).g;
        float n3 = texture2D(uNoise, xz * 0.17).r;
        float n4 = texture2D(uNoise, xz * 0.83).g;
        float cells = texture2D(uNoise, xz * 0.09).b;
        float ridge = texture2D(uNoise, xz * 0.05).a;

        // Close-range relief: small undulations catch the low light.
        vec2 dxz = vec2(
          texture2D(uNoise, xz * 0.31 + vec2(0.003, 0.0)).r - texture2D(uNoise, xz * 0.31 - vec2(0.003, 0.0)).r,
          texture2D(uNoise, xz * 0.31 + vec2(0.0, 0.003)).r - texture2D(uNoise, xz * 0.31 - vec2(0.0, 0.003)).r);
        float reliefK = smoothstep(80.0, 6.0, dist) * 1.5;
        N = normalize(N + vec3(dxz.x, 0.0, dxz.y) * reliefK);
        float slope = 1.0 - normalize(vN).y;

        // Grass: a whole family of greens that shift with the hills, never one colour.
        vec3 grass = grassColor(xz, clamp(log2(max(dist * 0.08, 1.0)), 0.0, 6.0));
        grass *= 0.85 + 0.3 * n4;

        // Rock: cool violet greys with warm strata.
        vec3 rockA = ROCK_A;
        vec3 rockB = ROCK_B;
        float strata = texture2D(uNoise, vec2(xz.x * 0.02 + xz.y * 0.02, vP.y * 0.13)).r;
        vec3 rock = mix(rockA, rockB, smoothstep(0.32, 0.68, strata)) * (0.72 + 0.5 * ridge);
        // Jungle hangs on anywhere it can get a grip, even on sheer limestone.
        rock = mix(rock, grass * 0.62, ROCK_GREEN * smoothstep(0.34, 0.6, n2 * 0.65 + n3 * 0.45));

        // Sand: pale warm, wet and darker close to the waterline.
        vec3 sand = mix(SAND_A, SAND_B, n3);
        sand *= 0.92 + 0.16 * n4;
        float ripples = sin(xz.x * 3.1 + n2 * 9.0 + n3 * 3.0) * 0.5 + 0.5;
        sand *= 0.97 + 0.05 * ripples;

        // Seabed fades to deep cool colours; water tints it anyway.
        vec3 seabed = mix(sand * 0.75, SEABED, smoothstep(-0.6, -5.0, vP.y));
        // Dark patches of coral on the pale sand.
        seabed *= 1.0 - CORAL * smoothstep(0.52, 0.72, n1 * 0.5 + n2 * 0.6) * smoothstep(-0.5, -1.6, vP.y);

        float sandTop = SAND_TOP + (n2 - 0.5) * 1.6 + (n3 - 0.5) * 0.6;
        float isSand = 1.0 - smoothstep(sandTop - 0.28, sandTop + 0.28, vP.y);
        vec3 ground = mix(grass, sand, isSand);

        float rockMask = smoothstep(0.17, 0.30, slope + (ridge - 0.5) * 0.11);
        ground = mix(ground, rock, rockMask);

        // Snow on the high ground, except where it's too steep to hold.
        float snow = smoothstep(SNOW_LINE, SNOW_LINE + 36.0, vP.y + (n2 - 0.5) * 34.0) * (1.0 - smoothstep(0.42, 0.72, slope));
        ground = mix(ground, vec3(0.84, 0.86, 0.92), snow);

        // Damp line, breathing slightly with the swell.
        float wetLine = 0.25 + 0.06 * sin(uTime * 0.5) + (n3 - 0.5) * 0.18;
        float wet = 1.0 - smoothstep(wetLine - 0.08, wetLine + 0.18, vP.y);
        ground = mix(ground, ground * vec3(0.62, 0.58, 0.58), wet * isSand);
        if (vP.y < 0.0) ground = mix(ground, seabed, smoothstep(0.0, -0.8, vP.y));

        // Path
        vec2 puv = (xz - uPathRect.xy) / uPathRect.zw;
        if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
          vec4 p = texture2D(uPathTex, puv);
          float edge = p.r + (n3 - 0.5) * 0.45 + (n4 - 0.5) * 0.28;
          float pm = smoothstep(0.35, 0.75, edge);
          vec3 dirt = mix(DIRT_A, DIRT_B, n4);
          ground = mix(ground, dirt, pm);
          float st = smoothstep(0.45, 0.62, p.g + (n4 - 0.5) * 0.25) * pm;
          vec3 stone = mix(STONE_A, STONE_B, n3);
          ground = mix(ground, stone, st);
        }

        // Far land breaks up into larger masses of colour, as a painter would block it in.
        ground = mix(ground, ground * (0.82 + n1 * 0.42), smoothstep(60.0, 300.0, dist));

        vec3 col = litSurface(ground, N, vP, 1.0, 0.0);
        gl_FragColor = vec4(applyFog(col, vP), 1.0);
      }`,
    uniforms: {
      ...U,
      uPathTex: { value: tex },
      uPathRect: { value: rect },
      uCottage: { value: new THREE.Vector2(COTTAGE.x, COTTAGE.z) },
    },
  });
  const group = new THREE.Group();
  const span = Math.ceil(SEGS / PIECES);
  const box = new THREE.Box3();
  for (let pj = 0; pj < PIECES; pj++) {
    for (let pi = 0; pi < PIECES; pi++) {
      const pieceIdx: number[] = [];
      const j1 = Math.min(SEGS, (pj + 1) * span);
      const i1 = Math.min(SEGS, (pi + 1) * span);
      for (let j = pj * span; j < j1; j++) {
        for (let i = pi * span; i < i1; i++) {
          const a = j * n + i;
          pieceIdx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
      }
      if (!pieceIdx.length) continue;
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', geo.attributes.position);
      pg.setAttribute('normal', geo.attributes.normal);
      pg.setIndex(pieceIdx);
      // Three's own bounding sphere would walk the whole shared grid, so work it out from the piece's corners and heights.
      box.makeEmpty();
      for (let j = pj * span; j <= j1; j += 2) {
        for (let i = pi * span; i <= i1; i += 2) {
          box.expandByPoint(new THREE.Vector3(pos[(j * n + i) * 3], pos[(j * n + i) * 3 + 1], pos[(j * n + i) * 3 + 2]));
        }
      }
      for (const [i, j] of [[pi * span, pj * span], [i1, pj * span], [pi * span, j1], [i1, j1]]) {
        box.expandByPoint(new THREE.Vector3(pos[(j * n + i) * 3], pos[(j * n + i) * 3 + 1], pos[(j * n + i) * 3 + 2]));
      }
      pg.boundingBox = box.clone();
      pg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(pg, mat);
      mesh.layers.set(L.MAIN_ONLY);
      group.add(mesh);
    }
  }

  // One vertex in three is plenty for the reflection and the wide shadow map.
  const STRIDE = 3;
  const lowIdx: number[] = [];
  for (let j = 0; j + STRIDE <= SEGS; j += STRIDE) {
    for (let i = 0; i + STRIDE <= SEGS; i += STRIDE) {
      const a = j * n + i;
      const b = a + STRIDE;
      const c = a + n * STRIDE;
      const d = c + STRIDE;
      lowIdx.push(a, c, b, b, c, d);
    }
  }
  const lowGeo = new THREE.BufferGeometry();
  lowGeo.setAttribute('position', geo.attributes.position);
  lowGeo.setAttribute('normal', geo.attributes.normal);
  lowGeo.setIndex(lowIdx);
  const low = new THREE.Mesh(lowGeo, mat);
  low.frustumCulled = false;
  low.layers.set(L.REFLECT_ONLY);
  low.layers.enable(L.CAST_SOLID);
  group.add(low);
  return group;
}

/** Layered mountain curtains around the horizon, with a saddle where the sun goes down. */
export function makeFarMountains(): THREE.Group {
  const group = new THREE.Group();
  const rings = [
    { r: 2300, h: 95, seed: 3.1, sharp: 0.35, val: 0.34 },
    { r: 3700, h: 170, seed: 7.7, sharp: 0.45, val: 0.52 },
    { r: 6200, h: 300, seed: 12.4, sharp: 0.5, val: 0.68 },
    { r: 9800, h: 500, seed: 21.9, sharp: 0.55, val: 0.82 },
  ];
  const sunsetAz = 2.98; // the direction the sun sets, seen from the jetty
  rings.forEach((ring, ri) => {
    const segs = 1400;
    const pos: number[] = [];
    const idx: number[] = [];
    const heightsAt: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const az = (i / segs) * Math.PI * 2;
      const cx = Math.cos(az) * 3.2 + ring.seed;
      const cz = Math.sin(az) * 3.2 - ring.seed;
      // Rounded storybook ridges rather than teeth.
      let top = fbm(cx * 1.05, cz * 1.05, 3) * 0.75 + 0.55;
      top = Math.max(0, top);
      top = top * top * 1.35 + ridged(cx * 2.3, cz * 2.3, 2) * 0.16;
      top += fbm(cx * 7, cz * 7, 3) * 0.05 * ring.sharp;
      // A wide, low gap around the setting sun.
      let da = Math.abs(((az - sunsetAz + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const gap = THREE.MathUtils.smoothstep(da, 0.1, 0.62);
      const gapK = ri < 2 ? 0.2 : 0.42;
      // Eastern side is hidden by the near hills, so no need for peaks there.
      top *= gapK + (1 - gapK) * gap;
      heightsAt.push(Math.max(0.04, top) * ring.h * MAP.far.height);
    }
    for (let i = 0; i <= segs; i++) {
      const az = (i / segs) * Math.PI * 2;
      const r = ring.r * (1 + fbm(az * 3, ring.seed, 2) * 0.1);
      const x = Math.cos(az) * r + 40;
      const z = Math.sin(az) * r;
      pos.push(x, -2, z);
      pos.push(x, heightsAt[i], z);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vP;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader:
        LIT_FRAG +
        /* glsl */ `
        varying vec3 vP;
        uniform float uVal;
        uniform float uSnowAt;
        void main() {
          vec3 d = normalize(vP - cameraPosition);
          // The colour of the sky low in this direction, deepened by a bluish body colour.
          vec3 horizon = textureLod(uSkyLow, panoUV(normalize(vec3(d.x, 0.03, d.z))), 2.0).rgb;
          float n = texture2D(uNoise, vP.xz * 0.00034 + vP.y * 0.0006).r;
          float n2 = texture2D(uNoise, vP.xz * 0.0014 + vP.y * 0.002).g;
          vec3 body = horizon * vec3(0.4, 0.42, 0.62) + vec3(0.012, 0.01, 0.03);
          body *= 0.86 + 0.24 * n + 0.1 * n2;
          vec3 col = mix(body, horizon, uVal * uVal);
          // Faint sun-side glow on slopes, gathered near the base where the haze piles up.
          float low = exp(-max(vP.y, 0.0) * 0.004);
          col = mix(col, horizon, low * 0.42);
          // Snowfields on the far peaks take the colour of the sky, only brighter.
          float snow = smoothstep(uSnowAt, uSnowAt * 1.5, vP.y + (n - 0.5) * uSnowAt * 0.7);
          col = mix(col, horizon * vec3(1.32, 1.34, 1.42) + vec3(0.015), snow);
          gl_FragColor = vec4(col, 1.0);
        }`,
      uniforms: { ...U, uVal: { value: ring.val }, uSnowAt: { value: MAP.far.snow * (ring.h / 300) } },
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -10 + ri;
    m.layers.set(L.OPAQUE);
    group.add(m);
  });
  return group;
}

/**
 * The wall of the Valley of the Ten Peaks: real relief rather than a painted curtain, close enough to fill
 * the lake with its reflection. Ten summits stand along the south side, as they do at Moraine Lake, and the
 * west stays lower so the sun has somewhere to set.
 */
export function makeRockies(): THREE.Object3D {
  const AZ = Math.round(Q.terrainSegs * 1.5);
  const RAD = 30;
  const C = { x: -60, z: 0 };
  const R0 = 1120;
  const R1 = 1960;
  const SUNSET_AZ = 2.98;
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const TEN: { a: number; h: number; w: number }[] = [];
  for (let i = 0; i < 10; i++) TEN.push({ a: 3.5 + i * 0.165, h: 360 + ((i * 37) % 11) * 16, w: 0.05 + ((i * 13) % 5) * 0.004 });
  const heightAt = (a: number, t: number, x: number, z: number) => {
    const line = 170 + 230 * Math.pow(ridged(Math.cos(a) * 2.7 + 5.1, Math.sin(a) * 2.7 - 1.7, 3), 1.25);
    let top = line;
    for (const p of TEN) {
      const d = wrapA(a - p.a) / p.w;
      top += p.h * Math.exp(-d * d);
    }
    const jag = ridged(x * 0.0058, z * 0.0058, 5) * 150 + ridged(x * 0.019, z * 0.019, 3) * 36;
    const gap = THREE.MathUtils.smoothstep(Math.abs(wrapA(a - SUNSET_AZ)), 0.06, 0.5);
    const peak = (top + jag) * (0.3 + 0.7 * gap) * 0.78;
    // Up from the valley floor to the crest, then away down the far side.
    const up = THREE.MathUtils.smoothstep(t, 0, 0.42);
    const down = 1 - THREE.MathUtils.smoothstep(t, 0.55, 1);
    return -6 + peak * up * up * (0.35 + 0.65 * down);
  };
  const n = (AZ + 1) * (RAD + 1);
  const pos = new Float32Array(n * 3);
  const snowAt = new Float32Array(n);
  for (let i = 0; i <= AZ; i++) {
    const a = (i / AZ) * Math.PI * 2;
    for (let j = 0; j <= RAD; j++) {
      const t = j / RAD;
      const r = R0 + (R1 - R0) * t + fbm(a * 7, t * 3, 2) * 40;
      const x = C.x + Math.cos(a) * r;
      const z = C.z + Math.sin(a) * r;
      const k = (i * (RAD + 1) + j) * 3;
      pos[k] = x;
      pos[k + 1] = heightAt(a, t, x, z);
      pos[k + 2] = z;
      // The glacier comes down low at the head of the lake.
      const toGlacier = wrapA(a - 3.32) / 0.16;
      snowAt[i * (RAD + 1) + j] = 240 - 130 * Math.exp(-toGlacier * toGlacier);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < AZ; i++) {
    for (let j = 0; j < RAD; j++) {
      const p = i * (RAD + 1) + j;
      const q = p + RAD + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSnow', new THREE.BufferAttribute(snowAt, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSnow;
      varying vec3 vP;
      varying vec3 vN;
      varying float vSnow;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        vN = normal;
        vSnow = aSnow;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader:
      LIT_FRAG +
      /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      varying float vSnow;
      void main() {
        clipBelowWater(vP);
        vec3 N = normalize(vN);
        vec2 xz = vP.xz;
        float n1 = texture2D(uNoise, xz * 0.0021).r;
        float n2 = texture2D(uNoise, xz * 0.0093).g;
        float n3 = texture2D(uNoise, xz * 0.041).r;
        // Grit the shape up with noise, since a slope this far off is only a few triangles.
        N = normalize(N + vec3(n3 - 0.5, 0.0, n2 - 0.5) * 0.55);
        float slope = 1.0 - N.y;
        // Tilted bands of old sea-bed, grey quartzite above and darker shale below.
        float band = sin((vP.y + vP.x * 0.09 + n1 * 90.0 + n2 * 30.0) * 0.075) * 0.5 + 0.5;
        vec3 rock = mix(vec3(0.075, 0.07, 0.072), vec3(0.2, 0.17, 0.15), band * 0.22 + n3 * 0.5 + n2 * 0.28);
        // Scree and dark spruce at the foot.
        vec3 scree = mix(vec3(0.1, 0.095, 0.09), vec3(0.16, 0.15, 0.14), n3);
        vec3 ground = mix(scree, rock, smoothstep(0.1, 0.36, slope));
        vec3 forest = vec3(0.012, 0.03, 0.022) * (0.7 + n3 * 0.7);
        ground = mix(ground, forest, (1.0 - smoothstep(55.0, 150.0, vP.y + (n2 - 0.5) * 70.0)) * (1.0 - smoothstep(0.42, 0.62, slope)));
        // Snow lies where it can: thin on steep rock, deep in hollows and on the glacier.
        float snow = smoothstep(vSnow, vSnow + 70.0, vP.y + (n1 - 0.5) * 80.0 + (n2 - 0.5) * 50.0) * (1.0 - smoothstep(0.34, 0.6, slope + (n3 - 0.5) * 0.2));
        ground = mix(ground, vec3(0.82, 0.86, 0.94), snow);
        vec3 col = litSurface(ground, N, vP, 1.0, 0.0);
        gl_FragColor = vec4(applyFog(col, vP), 1.0);
      }`,
    uniforms: { ...U },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(L.OPAQUE);
  return mesh;
}
