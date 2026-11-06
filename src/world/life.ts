// What moves on its own: smoke, mist, fireflies, motes, birds, jumping fish, buoys, a far sail, a cat.
import { MAP } from './maps';
import * as THREE from 'three';
import { Builder, solid, TRS } from './builder';
import { DECK_Y, groundY, JETTY, MAGIC_SPOTS, slopeAt, swellAt } from './land';
import { L, LIT_FRAG, paintedMaterial, U } from '../render/shared';
import { common } from '../render/fsq';
import { damp, mulberry32, smoothstep } from '../core/noise';
import type { Water } from './water';
import type { Look } from '../core/time';

const SOFT_FRAG_HEAD = /* glsl */ `
  uniform sampler2D uDepthTex;
  uniform vec2 uRes;
  uniform float uNearZ;
  uniform float uFarZ;
  float softFade(float viewZ, float range) {
    float d = texture2D(uDepthTex, gl_FragCoord.xy / uRes).r;
    float z = (uNearZ * uFarZ) / (uFarZ - d * (uFarZ - uNearZ));
    return sat((z - viewZ) / range);
  }
`;

// Mushroom caps stay near white in albedo; the glow supplies the colour after dark.
const i0 = (rnd: () => number) => (rnd() < 0.5 ? 0xe8f4f0 : 0xd8e4f4);

export class Life {
  group = new THREE.Group();
  private soft = { uDepthTex: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(1, 1) }, uNearZ: { value: 0.3 }, uFarZ: { value: 30000 } };
  private smokeMat: THREE.ShaderMaterial;
  private mistMat: THREE.ShaderMaterial;
  private fireMat: THREE.ShaderMaterial;
  private moteMat: THREE.ShaderMaterial;
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private buoys: { g: THREE.Group; x: number; z: number; ph: number }[] = [];
  private sail: THREE.Group;
  private sailT = 0.2;
  private gulls: THREE.InstancedMesh;
  private swallows: THREE.InstancedMesh;
  private gullSeeds: { r: number; h: number; sp: number; ph: number; cx: number; cz: number }[] = [];
  private swallowSeeds: { r: number; sp: number; ph: number; k: number }[] = [];
  private birdFade = { gull: 0, swallow: 0 };
  private jumper: THREE.Mesh;
  private jump = { t: 9, active: false, x: 0, z: 0, dx: 0, dz: 0, life: 0 };
  private tmpM = new THREE.Matrix4();
  private rnd = mulberry32(31337);
  private catTail: THREE.Group;
  private catBody: THREE.Group;
  private wispMat!: THREE.ShaderMaterial;
  onFishJump: ((x: number, z: number) => void) | null = null;
  private magicU = { value: 0 };
  private boatU = { value: new THREE.Vector3() };
  private padGroups: { g: THREE.Group; x: number; z: number }[] = [];
  private glowMats: THREE.ShaderMaterial[] = [];

  constructor(chimney: THREE.Vector3, lampPos: THREE.Vector3) {
    const unit = new THREE.BufferGeometry();
    unit.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    unit.setIndex([0, 1, 2, 0, 2, 3]);

    // Chimney smoke.
    {
      const n = 46;
      const g = new THREE.InstancedBufferGeometry();
      g.index = unit.index;
      g.setAttribute('position', unit.attributes.position);
      const seeds = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        seeds[i * 2] = i / n;
        seeds[i * 2 + 1] = this.rnd();
      }
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
      g.instanceCount = n;
      this.smokeMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec2 aSeed;
          uniform float uTime;
          uniform vec2 uWind;
          uniform vec3 uOrigin;
          varying vec2 vUv2;
          varying float vAge;
          varying float vSeed;
          varying vec3 vP;
          varying float vViewZ;
          void main() {
            float age = fract(uTime * 0.038 + aSeed.x);
            vec3 p = uOrigin;
            p.y += age * 17.0;
            p.x += uWind.x * age * age * 16.0 + sin(age * 7.0 + aSeed.y * 6.0) * age * 1.3;
            p.z += uWind.y * age * age * 16.0 + cos(age * 5.0 + aSeed.y * 9.0) * age * 1.3;
            float size = 0.24 + age * 2.6;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float a = aSeed.y * 6.28 + age * 0.9;
            vec2 c = position.xy;
            mv.xy += vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) * size;
            vUv2 = position.xy;
            vAge = age;
            vSeed = aSeed.y;
            vP = p;
            vViewZ = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader:
          LIT_FRAG +
          SOFT_FRAG_HEAD +
          /* glsl */ `
          varying vec2 vUv2;
          varying float vAge;
          varying float vSeed;
          varying vec3 vP;
          varying float vViewZ;
          uniform float uSmoke;
          void main() {
            float r = length(vUv2);
            float n = texture2D(uNoise, vUv2 * 0.2 + vSeed + uTime * 0.008).r;
            float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.9);
            a *= smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(0.35, 1.0, vAge)) * 0.3 * uSmoke;
            a *= softFade(vViewZ, 1.5);
            if (a < 0.003) discard;
            // Lit by the sky behind and the low sun coming through it.
            vec3 dir = normalize(vP - cameraPosition);
            float back = pow(sat(dot(dir, uKeyDir)), 3.0);
            vec3 base = textureLod(uSkyLow, panoUV(vec3(0.0, 1.0, 0.0)), 5.0).rgb * uAmb * 0.8 + uKeyCol * (0.14 + back * 0.28);
            gl_FragColor = vec4(applyFog(base, vP), a);
          }`,
        uniforms: { ...U, ...this.soft, uOrigin: { value: chimney.clone() }, uSmoke: { value: 1 } },
        transparent: true,
        depthWrite: false,
      });
      const m = new THREE.Mesh(g, this.smokeMat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Mist banks over the water.
    {
      const n = 110;
      const g = new THREE.InstancedBufferGeometry();
      g.index = unit.index;
      g.setAttribute('position', unit.attributes.position);
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const ang = this.rnd() * 6.283;
        const rad = 40 + this.rnd() * this.rnd() * 500;
        a.set([-120 + Math.cos(ang) * rad, 1.2 + this.rnd() * 3.5, Math.sin(ang) * rad, 24 + this.rnd() * 46], i * 4);
      }
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(a, 4));
      g.instanceCount = n;
      this.mistMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aPos;
          uniform float uTime;
          varying vec2 vUv2;
          varying vec3 vP;
          varying float vViewZ;
          varying float vS;
          void main() {
            vec3 p = aPos.xyz;
            p.x += sin(uTime * 0.018 + aPos.w) * 22.0;
            p.z += cos(uTime * 0.013 + aPos.w * 2.0) * 22.0;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            mv.xy += position.xy * vec2(aPos.w, aPos.w * 0.17);
            vUv2 = position.xy;
            vP = p;
            vViewZ = -mv.z;
            vS = aPos.w;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader:
          LIT_FRAG +
          SOFT_FRAG_HEAD +
          /* glsl */ `
          varying vec2 vUv2;
          varying vec3 vP;
          varying float vViewZ;
          varying float vS;
          void main() {
            float n = texture2D(uNoise, vUv2 * vec2(0.24, 0.06) + vS * 0.13 + uTime * 0.002).r;
            float a = smoothstep(1.0, 0.1, length(vUv2)) * smoothstep(0.2, 0.75, n) * 0.46 * uMist;
            a *= softFade(vViewZ, 6.0) * smoothstep(1.5, 12.0, vViewZ);
            if (a < 0.003) discard;
            vec3 dir = normalize(vP - cameraPosition);
            vec3 sky = textureLod(uSkyLow, panoUV(normalize(vec3(dir.x, 0.03, dir.z))), 2.0).rgb;
            float toSun = pow(sat(dot(dir, uKeyDir)), 4.0);
            gl_FragColor = vec4(sky * 1.02 + uKeyCol * toSun * 0.2, a);
          }`,
        uniforms: { ...U, ...this.soft },
        transparent: true,
        depthWrite: false,
      });
      const m = new THREE.Mesh(g, this.mistMat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Fireflies over the meadow.
    {
      const n = 340;
      const pos = new Float32Array(n * 3);
      const sd = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = 8 + this.rnd() * 130;
        const z = -70 + this.rnd() * 120;
        pos.set([x, groundY(x, z) + 0.35 + this.rnd() * 1.7, z], i * 3);
        sd[i] = this.rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
      this.fireMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aS;
          uniform float uTime;
          uniform float uAmt;
          uniform float uPx;
          varying float vA;
          void main() {
            vec3 p = position;
            float t = uTime * (0.2 + aS * 0.3) + aS * 40.0;
            p += vec3(sin(t) * 1.2 + sin(t * 2.3) * 0.3, sin(t * 0.7) * 0.35, cos(t * 0.9) * 1.2);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float blink = smoothstep(0.55, 1.0, sin(uTime * (0.9 + aS * 1.1) + aS * 60.0) * 0.5 + 0.5);
            vA = blink * uAmt;
            gl_PointSize = clamp(uPx * 0.09 / -mv.z, 1.2, 9.0) * (0.5 + blink * 0.5);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.0, r);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.34) * a * a * vA * 16.0, a * vA);
          }`,
        uniforms: { uTime: U.uTime, uAmt: { value: 0 }, uPx: { value: 1000 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Points(g, this.fireMat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Motes and pollen, visible only with the sun behind them.
    {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([this.rnd() * 44, this.rnd() * 14, this.rnd() * 44], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.moteMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uPx;
          uniform vec3 uCenter;
          uniform vec3 uKeyDir;
          varying float vA;
          void main() {
            vec3 p = position;
            p.x += uTime * 0.11 + sin(uTime * 0.31 + position.z) * 0.5;
            p.z += uTime * 0.05 + cos(uTime * 0.27 + position.x) * 0.5;
            p.y += sin(uTime * 0.2 + position.x * 1.3) * 0.4;
            p = mod(p - uCenter + 22.0, vec3(44.0, 14.0, 44.0)) - vec3(22.0, 2.0, 22.0) + uCenter;
            vec3 v = normalize(p - cameraPosition);
            float back = pow(clamp(dot(v, uKeyDir), 0.0, 1.0), 5.0);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            vA = back;
            gl_PointSize = clamp(uPx * 0.016 / -mv.z, 1.0, 4.5);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          uniform vec3 uKeyCol;
          void main() {
            float a = smoothstep(1.0, 0.0, length(gl_PointCoord - 0.5) * 2.0);
            gl_FragColor = vec4(uKeyCol * a * vA * 0.75, 1.0);
          }`,
        uniforms: { uTime: U.uTime, uPx: { value: 1000 }, uCenter: { value: new THREE.Vector3() }, uKeyDir: U.uKeyDir, uKeyCol: U.uKeyCol },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Points(g, this.moteMat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Lighthouse beam.
    {
      const geo = new THREE.ConeGeometry(15, 240, 16, 1, true);
      geo.translate(0, -120, 0);
      geo.rotateX(-Math.PI / 2);
      this.beamMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying float vT;
          varying vec3 vNv;
          varying vec3 vVw;
          void main() {
            vT = position.z / 240.0;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNv = normalMatrix * normal;
            vVw = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vT;
          varying vec3 vNv;
          varying vec3 vVw;
          uniform float uOn;
          void main() {
            float rim = abs(dot(normalize(vNv), normalize(vVw)));
            float a = pow(rim, 1.6) * pow(1.0 - clamp(vT, 0.0, 1.0), 2.4) * uOn;
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.68) * a * 0.2, a);
          }`,
        uniforms: { uOn: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      this.beam = new THREE.Mesh(geo, this.beamMat);
      this.beam.position.copy(lampPos);
      this.beam.visible = MAP.props.beacon;
      this.beam.frustumCulled = false;
      this.beam.layers.set(L.CLEAR);
      this.group.add(this.beam);
    }

    // Buoys.
    const buoyMat = paintedMaterial();
    const buoyB = new Builder(66);
    buoyB.lathe([[0.0, -0.3], [0.22, -0.26], [0.32, 0.0], [0.28, 0.22], [0.06, 0.34], [0.0, 0.34]], 0xc0402e, undefined, { ao: 0.4 }, 12);
    buoyB.lathe([[0.3, 0.08], [0.285, 0.2]], 0xefe6d0, undefined, {}, 12);
    buoyB.cyl(0.018, 0.022, 0.75, 0x2a2a30, TRS(0, 0.68, 0), {}, 6);
    buoyB.sphere(0.06, 0xefe6d0, TRS(0, 1.06, 0), {}, 8, 6);
    const buoyGeo = buoyB.build();
    for (const [x, z] of [[-72, 34], [-120, -34], [-170, 72], [-232, -22], [-45, -44]] as [number, number][]) {
      const g = new THREE.Group();
      g.add(solid(buoyGeo, buoyMat));
      g.position.set(x, 0, z);
      this.group.add(g);
      this.buoys.push({ g, x, z, ph: this.rnd() * 6 });
    }

    // A far sail, slipping along the horizon.
    this.sail = new THREE.Group();
    const sb = new Builder(77);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.quadraticCurveTo(5.6, 1.6, 6.2, 0);
    sailShape.quadraticCurveTo(4.6, 5.4, 0, 12.4);
    sailShape.closePath();
    sb.add(new THREE.ShapeGeometry(sailShape), 0xf2e6cc, TRS(0.18, 1.5, 0, 0, Math.PI / 2 - 0.2, 0));
    const jib = new THREE.Shape();
    jib.moveTo(0, 0);
    jib.quadraticCurveTo(-3, 1.1, -4.4, 0);
    jib.quadraticCurveTo(-2.5, 5, 0, 10.2);
    jib.closePath();
    sb.add(new THREE.ShapeGeometry(jib), 0xc9574a, TRS(0.1, 1.5, 0, 0, Math.PI / 2 + 0.14, 0));
    sb.add(new THREE.SphereGeometry(1, 12, 8), 0x2d4a5c, TRS(0, 0.5, 0, 0, 0, 0, 1.25, 0.85, 4.0));
    sb.cyl(0.07, 0.1, 14, 0x4a3428, TRS(0, 7.2, 0), {}, 6);
    const sailMat = paintedMaterial({ side: THREE.DoubleSide });
    this.sail.add(solid(sb.build(), sailMat));
    this.group.add(this.sail);

    // Gulls and swallows: thin, flapping wings in the shader.
    const birdGeo = (span: number, chord: number) => {
      const pos = [
        0, 0, -chord, -span, 0, 0.2 * chord, 0, 0, chord * 0.7,
        0, 0, -chord, span, 0, 0.2 * chord, 0, 0, chord * 0.7,
        -0.06, 0, -chord * 1.2, 0.06, 0, -chord * 1.2, 0, 0, chord * 1.7,
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const birdMat = (col: THREE.Color, flap: number) =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uFlap;
          varying vec3 vP;
          void main() {
            vec3 p = position;
            float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
            p.y += abs(p.x) * sin(uTime * uFlap + ph) * 0.62;
            vec4 wp = instanceMatrix * vec4(p, 1.0);
            vP = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader:
          LIT_FRAG +
          /* glsl */ `
          varying vec3 vP;
          uniform vec3 uCol;
          void main() {
            vec3 N = normalize(vec3(0.0, 1.0, 0.0));
            vec3 col = uCol * (uKeyCol * 0.28 * sat(uKeyDir.y + 0.35) + skyAmbient(N));
            gl_FragColor = vec4(applyFog(col, vP), 1.0);
          }`,
        uniforms: { ...U, uCol: { value: col }, uFlap: { value: flap } },
        side: THREE.DoubleSide,
      });
    this.gulls = new THREE.InstancedMesh(birdGeo(0.72, 0.18), birdMat(new THREE.Color(0xe8e4da), 4.3), 16);
    this.swallows = new THREE.InstancedMesh(birdGeo(0.17, 0.07), birdMat(new THREE.Color(0x24262e), 16), 26);
    for (const b of [this.gulls, this.swallows]) {
      b.frustumCulled = false;
      b.layers.set(L.OPAQUE);
      this.group.add(b);
    }
    for (let i = 0; i < 16; i++) {
      this.gullSeeds.push({ r: 40 + this.rnd() * 90, h: 16 + this.rnd() * 40, sp: 0.1 + this.rnd() * 0.1, ph: this.rnd() * 6.28, cx: -70 + this.rnd() * 60, cz: -60 + this.rnd() * 120 });
    }
    for (let i = 0; i < 26; i++) {
      this.swallowSeeds.push({ r: 8 + this.rnd() * 26, sp: 0.5 + this.rnd() * 0.7, ph: this.rnd() * 6.28, k: 1 + Math.floor(this.rnd() * 3) });
    }

    // One small silver fish that jumps now and then.
    const jb = new Builder(88);
    jb.add(new THREE.SphereGeometry(1, 10, 8), 0xd8e0dc, TRS(0, 0, 0, 0, 0, 0, 0.07, 0.11, 0.36));
    jb.add(new THREE.ConeGeometry(0.1, 0.2, 4), 0xa6b6b4, TRS(0, 0, 0.42, -Math.PI / 2, 0, 0, 1, 1, 0.4));
    this.jumper = solid(jb.build(), paintedMaterial(), false);
    this.jumper.visible = false;
    this.group.add(this.jumper);

    // The cat who lives on the jetty, watching the water with you.
    this.catBody = new THREE.Group();
    this.catTail = new THREE.Group();
    const cb = new Builder(99);
    const fur = 0x8a7f78;
    const furL = 0xc2b6a8;
    cb.sphere(0.13, fur, TRS(0, 0.15, 0.05, 0, 0, 0, 1, 1.2, 1.35), { jit: 0.05 }, 12, 10);
    cb.sphere(0.1, furL, TRS(0, 0.11, -0.08, 0, 0, 0, 0.72, 1, 0.5), {}, 8, 6);
    cb.sphere(0.087, fur, TRS(0, 0.34, -0.09, 0, 0, 0, 1.05, 0.95, 0.95), {}, 12, 8);
    cb.add(new THREE.ConeGeometry(0.038, 0.075, 4), fur, TRS(-0.05, 0.43, -0.09));
    cb.add(new THREE.ConeGeometry(0.038, 0.075, 4), fur, TRS(0.05, 0.43, -0.09));
    cb.sphere(0.03, furL, TRS(0, 0.31, -0.16), {}, 6, 5);
    cb.cyl(0.024, 0.028, 0.12, furL, TRS(-0.05, 0.06, -0.12), {}, 6);
    cb.cyl(0.024, 0.028, 0.12, furL, TRS(0.05, 0.06, -0.12), {}, 6);
    this.catBody.add(solid(cb.build(), paintedMaterial()));
    const tb = new Builder(100);
    tb.tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, 0.0, 0.11), new THREE.Vector3(0.2, 0.0, 0.1), new THREE.Vector3(0.29, 0.03, 0.0)], 0.022, fur, {}, 10, 5);
    this.catTail.add(solid(tb.build(), paintedMaterial()));
    this.catTail.position.set(0, 0.04, 0.22);
    this.catBody.add(this.catTail);
    this.catBody.position.set(JETTY.endX + 5.4, DECK_Y, -1.02);
    this.catBody.rotation.y = 1.95;
    this.group.add(this.catBody);

    this.buildMagic(unit);
  }

  /** The night's magic: rising light, drifting wisps, glowing fish, lit pads and mushrooms. */
  private buildMagic(unit: THREE.BufferGeometry) {
    const rnd = this.rnd;
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

    // Aura: soft curtains of light standing over each pool.
    {
      const n = MAGIC_SPOTS.length * 3;
      const g = new THREE.InstancedBufferGeometry();
      g.index = unit.index;
      g.setAttribute('position', unit.attributes.position);
      const a = new Float32Array(n * 4);
      const b = new Float32Array(n * 2);
      MAGIC_SPOTS.forEach((m, i) => {
        for (let j = 0; j < 3; j++) {
          a.set([m.x + (rnd() - 0.5) * m.r * 0.5, m.z + (rnd() - 0.5) * m.r * 0.5, m.r * (0.55 + j * 0.2), m.hue], (i * 3 + j) * 4);
          b.set([rnd() * 10, 8 + rnd() * 9], (i * 3 + j) * 2);
        }
      });
      g.setAttribute('aSpot', new THREE.InstancedBufferAttribute(a, 4));
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(b, 2));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aSpot;
          attribute vec2 aInfo;
          varying vec2 vC;
          varying float vHue;
          varying float vSeed;
          void main() {
            vec3 base = vec3(aSpot.x, 0.0, aSpot.y);
            vec3 toCam = cameraPosition - base;
            vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
            vec3 p = base + right * position.x * aSpot.z + vec3(0.0, (position.y + 1.0) * 0.5 * aInfo.y, 0.0);
            vC = position.xy;
            vHue = aSpot.w;
            vSeed = aInfo.x;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader:
          common +
          /* glsl */ `
          varying vec2 vC;
          varying float vHue;
          varying float vSeed;
          uniform float uAmt;
          uniform float uTime;
          uniform sampler2D uNoise;
          void main() {
            float v = vC.y * 0.5 + 0.5;
            float st = texture2D(uNoise, vec2(vC.x * 0.5 + vSeed, v * 0.2 - uTime * 0.012)).r;
            float st2 = texture2D(uNoise, vec2(vC.x * 1.4 - vSeed, v * 0.5 - uTime * 0.02)).g;
            float a = pow(1.0 - v, 2.1) * smoothstep(1.0, 0.1, abs(vC.x)) * (0.3 + st * 0.7) * (0.45 + st2 * 0.8);
            gl_FragColor = vec4(magicTint(fract(vHue + st * 0.16)) * a * uAmt * 0.5, 1.0);
          }`,
        uniforms: { uAmt: this.magicU, uTime: U.uTime, uNoise: U.uNoise },
        ...additive,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Wisps: motes of light climbing slowly out of each pool.
    {
      const per = 90;
      const n = MAGIC_SPOTS.length * per;
      const pos = new Float32Array(n * 3);
      const info = new Float32Array(n * 4);
      MAGIC_SPOTS.forEach((m, i) => {
        for (let j = 0; j < per; j++) {
          pos.set([m.x, 0, m.z], (i * per + j) * 3);
          info.set([rnd(), rnd(), m.r, m.hue], (i * per + j) * 4);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
      const mat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aInfo;
          uniform float uTime;
          uniform float uPx;
          uniform float uAmt;
          varying float vA;
          varying float vHue;
          void main() {
            float age = fract(uTime * (0.024 + aInfo.y * 0.03) + aInfo.x * 13.0);
            float ang = aInfo.x * 40.0 + uTime * (0.12 + aInfo.y * 0.2) + age * 2.2;
            float rad = aInfo.z * (0.12 + aInfo.y * 0.8) * (1.0 - age * 0.25);
            vec3 p = position + vec3(cos(ang) * rad, 0.15 + age * (5.0 + aInfo.x * 9.0), sin(ang) * rad);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float blink = 0.55 + 0.45 * sin(uTime * (1.4 + aInfo.x * 2.0) + aInfo.y * 30.0);
            vA = sin(age * PI) * blink * uAmt;
            vHue = aInfo.w + aInfo.x * 0.14;
            gl_PointSize = clamp(uPx * 0.11 / -mv.z, 1.5, 11.0);
            gl_Position = projectionMatrix * mv;
          }`.replace('void main()', '#define PI 3.14159265\nvoid main()'),
        fragmentShader:
          common +
          /* glsl */ `
          varying float vA;
          varying float vHue;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.0, r);
            gl_FragColor = vec4(magicTint(fract(vHue)) * a * a * vA * 7.0, 1.0);
          }`,
        uniforms: { uTime: U.uTime, uPx: { value: 1000 }, uAmt: this.magicU },
        ...additive,
      });
      this.wispMat = mat;
      const m = new THREE.Points(g, mat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Glowing fish: schools circling each pool, a few loners out in the bay. They gather to the boat.
    {
      const anchors: { x: number; z: number; r: number; hue: number; n: number; size: number }[] = MAGIC_SPOTS.map((m) => ({ x: m.x, z: m.z, r: m.r * 0.72, hue: m.hue, n: 34, size: 1 }));
      for (const [x, z, h] of [[-40, 30, 0.1], [-90, -70, 0.5], [-150, 30, 0.3], [-220, 60, 0.8], [-190, -70, 0.6], [-70, 110, 0.15], [-280, 110, 0.65]]) {
        anchors.push({ x, z, r: 34, hue: h, n: 12, size: 1.25 });
      }
      const n = anchors.reduce((t, a) => t + a.n, 0);
      const g = new THREE.InstancedBufferGeometry();
      g.index = unit.index;
      g.setAttribute('position', unit.attributes.position);
      const aA = new Float32Array(n * 4);
      const aS = new Float32Array(n * 4);
      let k = 0;
      for (const a of anchors) {
        const school = rnd() * 6.28;
        for (let i = 0; i < a.n; i++) {
          aA.set([a.x, a.z, a.r, a.hue + (rnd() - 0.5) * 0.16], k * 4);
          aS.set([school + (a.size > 1 ? rnd() * 6.28 : rnd() * 0.9), 0.55 + rnd() * 0.42, 0.3 + rnd() * 1.1, a.size * (0.75 + rnd() * 0.75)], k * 4);
          k++;
        }
      }
      g.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(aA, 4));
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aS, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aAnchor;
          attribute vec4 aSeed;
          uniform float uTime;
          uniform vec3 uBoat;
          varying vec2 vC;
          varying float vHue;
          varying float vWag;
          vec3 at(float t) {
            float th = t * (0.09 + aSeed.y * 0.09) * (mod(aSeed.w * 7.0, 2.0) > 1.0 ? 1.0 : -1.0) + aSeed.x;
            float rr = aAnchor.z * aSeed.y;
            vec2 c = aAnchor.xy;
            vec2 p = c + vec2(cos(th), sin(th * 1.0)) * rr + vec2(sin(th * 3.1 + aSeed.x), cos(th * 2.3 + aSeed.y * 9.0)) * rr * 0.16;
            // Curious: they drift towards a boat that comes close.
            float d = length(uBoat.xz - c);
            float pull = (1.0 - smoothstep(10.0, 55.0, d)) * 0.5;
            p += (uBoat.xz - c) * pull;
            return vec3(p.x, -0.3 - aSeed.z * 0.55, p.y);
          }
          void main() {
            vec3 p = at(uTime);
            vec3 q = at(uTime + 0.2);
            vec3 dir = normalize(q - p + vec3(1e-4, 0.0, 0.0));
            vec3 toCam = normalize(cameraPosition - p);
            vec3 side = normalize(cross(dir, toCam));
            float len = 0.22 * aSeed.w * smoothstep(1.5, 7.0, length(cameraPosition - p));
            vec3 w = p + dir * position.x * len * 1.7 + side * position.y * len * 1.7;
            vC = position.xy * 1.7;
            vHue = aAnchor.w;
            vWag = uTime * (5.0 + aSeed.y * 5.0) + aSeed.x * 9.0;
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader:
          common +
          /* glsl */ `
          varying vec2 vC;
          varying float vHue;
          varying float vWag;
          uniform float uAmt;
          void main() {
            // A little fish: forward is +x, with a tail that wags.
            float x = vC.x;
            float y = vC.y + sin(vWag + x * 3.0) * 0.1 * sat(0.4 - x);
            float body = smoothstep(1.0, 0.72, length(vec2(x * 0.98 - 0.06, y * 3.2)));
            float tail = smoothstep(0.34, 0.1, abs(y) - (-x - 0.85) * 0.75) * step(x, -0.72) * step(-1.55, x);
            float core = max(body, tail * 0.75);
            float halo = exp(-(x * x * 0.8 + y * y * 3.6) * 1.7);
            vec3 tint = magicTint(fract(vHue));
            vec3 col = tint * (core * 1.7 + halo * 0.55) + vec3(1.0) * core * 0.12;
            gl_FragColor = vec4(col * uAmt, 1.0);
          }`,
        uniforms: { uTime: U.uTime, uBoat: this.boatU, uAmt: this.magicU },
        ...additive,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.layers.set(L.CLEAR);
      this.group.add(m);
    }

    // Lily pads with lit flowers, riding the swell.
    const cyan = paintedMaterial({ emisCol: new THREE.Color(0.2, 0.92, 1.0), side: THREE.DoubleSide });
    const pink = paintedMaterial({ emisCol: new THREE.Color(1.0, 0.38, 0.9), side: THREE.DoubleSide });
    this.glowMats.push(cyan, pink);
    MAGIC_SPOTS.forEach((m, i) => {
      const pad = new Builder(500 + i);
      const flower = new Builder(600 + i);
      let count = 0;
      for (let j = 0; j < 40 && count < 18; j++) {
        const a = rnd() * 6.283;
        const d = m.r * (0.3 + rnd() * 0.72);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (groundY(m.x + x, m.z + z) > -0.2) continue;
        count++;
        const s = 0.4 + rnd() * 0.45;
        pad.add(new THREE.CircleGeometry(s, 11, 0.32, 5.7), 0x2c5a48, TRS(x, 0.035, z, -Math.PI / 2, rnd() * 6, 0), { jit: 0.25, emis: 0.1 });
        if (rnd() < 0.55) {
          const fx = x + (rnd() - 0.5) * s * 0.5;
          const fz = z + (rnd() - 0.5) * s * 0.5;
          for (let p = 0; p < 7; p++) {
            const pa = (p / 7) * 6.283;
            flower.sphere(0.075, i % 2 ? 0xf0b0e8 : 0xd8f8ff, TRS(fx + Math.cos(pa) * 0.09, 0.09, fz + Math.sin(pa) * 0.09, 0, -pa, 0.5, 1.5, 0.55, 0.75), { emis: 0.75 }, 6, 4);
          }
          flower.sphere(0.04, 0xfff0b0, TRS(fx, 0.13, fz), { emis: 1 }, 6, 5);
        }
      }
      const grp = new THREE.Group();
      grp.position.set(m.x, 0, m.z);
      if (!pad.empty) grp.add(solid(pad.build(), cyan, false));
      if (!flower.empty) grp.add(solid(flower.build(), i % 2 ? pink : cyan, false));
      this.group.add(grp);
      this.padGroups.push({ g: grp, x: m.x, z: m.z });
    });

    // Glowing mushrooms on the shores near the pools, and in the dark of the woods by the bench.
    const shroomC = new Builder(700);
    const shroomP = new Builder(701);
    const plant = (x: number, z: number, b: Builder, big = 1) => {
      const y = groundY(x, z);
      const s = (0.22 + rnd() * rnd() * 0.5) * big;
      b.cyl(s * 0.16, s * 0.24, s * 0.9, 0xd8e8e0, TRS(x, y + s * 0.42, z, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2), { emis: 0.35 }, 6);
      b.sphere(s * 0.55, i0(rnd), TRS(x, y + s * 0.88, z, 0, 0, 0, 1, 0.62, 1), { emis: 0.9 }, 8, 6);
    };
    const tryPlant = (cx: number, cz: number, r: number, tries: number, count: number, b: Builder, big = 1) => {
      let placed = 0;
      for (let t = 0; t < tries && placed < count; t++) {
        const a = rnd() * 6.283;
        const d = r * Math.sqrt(rnd());
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const y = groundY(x, z);
        if (y < 0.3 || y > 14 || slopeAt(x, z, 0.8) > 0.8) continue;
        // Mushrooms grow in small rings of three or four.
        const ring = 2 + Math.floor(rnd() * 3);
        for (let q = 0; q < ring; q++) plant(x + (rnd() - 0.5) * 0.9, z + (rnd() - 0.5) * 0.9, b, big);
        placed++;
      }
    };
    MAGIC_SPOTS.forEach((m, i) => tryPlant(m.x, m.z, m.r * 2.0, 300, 22, i % 2 ? shroomP : shroomC));
    // Along the woods on the walk home.
    tryPlant(72, -46, 11, 120, 12, shroomC, 1.25);
    tryPlant(88, -42, 13, 120, 8, shroomP, 1.1);
    tryPlant(40, -24, 12, 120, 7, shroomP, 1.1);
    tryPlant(52, 28, 12, 120, 7, shroomC, 1.1);
    if (!shroomC.empty) {
      const m = solid(shroomC.build(), cyan, false);
      m.frustumCulled = false;
      this.group.add(m);
    }
    if (!shroomP.empty) {
      const m = solid(shroomP.build(), pink, false);
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  setMagic(amount: number) {
    this.magicU.value = amount;
    const pulse = 0.82 + Math.sin(U.uTime.value * 0.8) * 0.18;
    for (const m of this.glowMats) m.uniforms.uEmisOn.value = amount * 3.4 * pulse;
  }

  setBoat(x: number, z: number) {
    this.boatU.value.set(x, 0, z);
  }

  update(dt: number, t: number, look: Look, hour: number, sun: THREE.Vector3, center: THREE.Vector3, pipe: { w: number; h: number; opaque: THREE.WebGLRenderTarget }, near: number, far: number, water: Water) {
    this.soft.uDepthTex.value = pipe.opaque.depthTexture;
    this.soft.uRes.value.set(pipe.w, pipe.h);
    this.soft.uNearZ.value = near;
    this.soft.uFarZ.value = far;

    this.fireMat.uniforms.uPx.value = pipe.h;
    this.wispMat.uniforms.uPx.value = pipe.h;
    for (const p of this.padGroups) p.g.position.y = swellAt(p.x, p.z, t);
    this.moteMat.uniforms.uPx.value = pipe.h;
    this.moteMat.uniforms.uCenter.value.copy(center);
    this.fireMat.uniforms.uAmt.value = hour > 12 ? smoothstep(19.1, 20.1, hour) * (1 - 0.35 * smoothstep(22, 24, hour)) : 0.65 * (1 - smoothstep(3.2, 4.8, hour));

    // Lighthouse: on from dusk, sweeps slowly.
    const lightOn = smoothstep(19.0, 19.8, hour) + (hour < 6 ? 1 - smoothstep(5.2, 6.0, hour) : 0);
    this.beamMat.uniforms.uOn.value = Math.min(1, lightOn);
    this.beam.rotation.y = t * 0.31;
    this.beam.visible = lightOn > 0.01;

    for (const b of this.buoys) {
      const y = swellAt(b.x, b.z, t);
      b.g.position.y = y;
      b.g.rotation.set(Math.sin(t * 1.3 + b.ph) * 0.08, b.ph, Math.cos(t * 1.1 + b.ph) * 0.08);
      if (Math.random() < dt * 0.6) water.splash(b.x, b.z, 0.4, 0.012);
    }

    this.sailT += dt * 0.00065;
    const a = 2.7 + Math.sin(this.sailT * 6.283) * 0.5;
    const sr = 1500;
    const sx = -180 + Math.cos(a) * sr;
    const sz = Math.sin(a) * sr;
    this.sail.position.set(sx, swellAt(sx, sz, t) * 0.5, sz);
    this.sail.rotation.y = -a + (Math.cos(this.sailT * 6.283) > 0 ? 0 : Math.PI);
    this.sail.rotation.z = Math.sin(t * 0.35) * 0.018 + 0.04;

    // Gulls by day, swallows skimming the water when the sun is low.
    const gullWant = smoothstep(6.8, 8, hour) * (1 - smoothstep(18.1, 19.1, hour));
    const swWant = smoothstep(16.8, 17.9, hour) * (1 - smoothstep(19.2, 19.9, hour));
    this.birdFade.gull = damp(this.birdFade.gull, gullWant, 0.5, dt);
    this.birdFade.swallow = damp(this.birdFade.swallow, swWant, 0.5, dt);
    for (let i = 0; i < this.gullSeeds.length; i++) {
      const s = this.gullSeeds[i];
      const th = t * s.sp + s.ph;
      const x = s.cx + Math.cos(th) * s.r;
      const z = s.cz + Math.sin(th * 0.8) * s.r;
      const hover = s.h + Math.sin(t * 0.3 + s.ph) * 4;
      const yaw = Math.atan2(-Math.sin(th) * s.r, Math.cos(th * 0.8) * s.r * 0.8);
      const k = this.birdFade.gull > 0.02 ? 1 : 0.0001;
      this.tmpM.copy(TRS(x, hover, z, 0, yaw + Math.PI, Math.sin(th) * 0.25, k, k, k));
      this.gulls.setMatrixAt(i, this.tmpM);
    }
    this.gulls.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.swallowSeeds.length; i++) {
      const s = this.swallowSeeds[i];
      const th = t * s.sp + s.ph;
      const x = center.x - 10 + Math.cos(th) * s.r + Math.sin(th * s.k * 1.7) * 7;
      const z = center.z + Math.sin(th * 1.3) * s.r;
      const y = 1.2 + Math.abs(Math.sin(th * s.k * 2.1)) * 6;
      const dx = -Math.sin(th) * s.r + Math.cos(th * s.k * 1.7) * 7 * s.k * 1.7;
      const dz = Math.cos(th * 1.3) * s.r * 1.3;
      const yaw = Math.atan2(-dx, -dz);
      const k = this.birdFade.swallow > 0.02 ? 1 : 0.0001;
      this.tmpM.copy(TRS(x, y, z, 0, yaw, Math.sin(th * 2) * 0.5, k, k, k));
      this.swallows.setMatrixAt(i, this.tmpM);
    }
    this.swallows.instanceMatrix.needsUpdate = true;

    // A fish jumps somewhere out on the bay.
    const j = this.jump;
    j.t -= dt;
    if (j.t <= 0 && !j.active) {
      const ang = this.rnd() * 6.283;
      const rad = 18 + this.rnd() * 75;
      const x = center.x + Math.cos(ang) * rad;
      const z = center.z + Math.sin(ang) * rad;
      if (groundY(x, z) < -1.4) {
        j.active = true;
        j.x = x;
        j.z = z;
        j.life = 0;
        const d = this.rnd() * 6.283;
        j.dx = Math.cos(d);
        j.dz = Math.sin(d);
        water.splash(x, z, 0.5, 0.16);
        this.onFishJump?.(x, z);
      }
      j.t = 11 + this.rnd() * 34;
    }
    this.jumper.visible = j.active;
    if (j.active) {
      j.life += dt;
      const dur = 0.72;
      const k = j.life / dur;
      if (k >= 1) {
        j.active = false;
        const ex = j.x + j.dx * 1.1;
        const ez = j.z + j.dz * 1.1;
        water.splash(ex, ez, 0.55, 0.2);
        this.onFishJump?.(ex, ez);
      } else {
        const x = j.x + j.dx * k * 1.1;
        const z = j.z + j.dz * k * 1.1;
        const y = 4 * k * (1 - k) * 0.72;
        this.jumper.position.set(x, y, z);
        this.jumper.rotation.set((k - 0.5) * 2.2, Math.atan2(-j.dx, -j.dz), 0, 'YXZ');
      }
    }

    // Cat breathes and flicks its tail.
    const breath = 1 + Math.sin(t * 1.6) * 0.012;
    this.catBody.scale.set(breath, 1, breath);
    this.catTail.rotation.y = Math.sin(t * 0.8) * 0.2 + Math.sin(t * 3.1) * Math.pow(Math.max(0, Math.sin(t * 0.21)), 6) * 0.5;
  }
}
