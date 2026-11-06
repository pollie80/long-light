// Time-sliced sky panorama. Each cycle freezes one set of sky parameters and renders the panorama a
// few columns per frame, then crossfades. That lets the clouds use film-style sample counts.
import * as THREE from 'three';
import { fsMat, fsq, common } from './fsq';
import panoFrag from '../shaders/sky_pano.glsl?raw';
import { U } from './shared';
import { Look } from '../core/time';
import { Q } from '../core/quality';

const W = Q.skyW;
const H = W / 4;
const CYCLE_SECONDS = Q.skyCycle;

export interface SkyWeather {
  cover: number;
  cirrus: number;
  alto: number;
  hero: number;
  seedX: number;
  seedY: number;
}

export class Sky {
  dome: THREE.Mesh;
  private back: THREE.WebGLRenderTarget;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private low: THREE.WebGLRenderTarget;
  private panoMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;
  private lowMat: THREE.ShaderMaterial;
  private domeMat: THREE.ShaderMaterial;
  private column = 0;
  private elapsed = 0;
  private lastCycle = CYCLE_SECONDS;
  private pending: {
    sun: THREE.Vector3; moon: THREE.Vector3; look: Look; time: number; weather: SkyWeather;
  } | null = null;
  fastCycles = 0;

  constructor(private r: THREE.WebGLRenderer, trans: THREE.Texture, noise: THREE.Texture, cloud3D: THREE.Data3DTexture) {
    const mk = (mips: boolean, w = W, h = H) =>
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: mips,
        depthBuffer: false,
      });
    this.back = mk(false);
    this.a = mk(false);
    this.b = mk(false);
    this.low = mk(true, 512, 128);

    this.panoMat = fsMat(panoFrag, {
      uTrans: { value: trans },
      uNoise: { value: noise },
      uCloud3D: { value: cloud3D },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunI: { value: 3 },
      uMoonI: { value: 0.1 },
      uCloudTime: { value: 0 },
      uWind: { value: new THREE.Vector2(26, 7) },
      uCover: { value: 0.5 },
      uCirrus: { value: 0.5 },
      uAlto: { value: 0.5 },
      uSeed: { value: new THREE.Vector2(0.1, 0.2) },
      uCloudTop: { value: new THREE.Vector3() },
      uCloudBot: { value: new THREE.Vector3() },
      uNight: { value: 0 },
      uHero: { value: 1 },
    });
    this.copyMat = fsMat(
      `varying vec2 vUv; uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, vUv); }`,
      { t: { value: null } },
    );
    this.lowMat = fsMat(
      `varying vec2 vUv; uniform sampler2D a; uniform sampler2D b; uniform float m;
       void main(){ gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), m); }`,
      { a: { value: this.a.texture }, b: { value: this.b.texture }, m: { value: 0 } },
    );

    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
          gl_Position = p.xyww; // pinned to the far plane
        }`,
      fragmentShader:
        common +
        /* glsl */ `
        varying vec3 vDir;
        uniform sampler2D uA;
        uniform sampler2D uB;
        uniform float uMix;
        uniform sampler2D uTrans;
        uniform sampler2D uNoise;
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uSunI;
        uniform float uStars;
        uniform float uTime;
        vec3 transGround(float mu) {
          float s = sign(mu) * sqrt(abs(mu));
          return texture2D(uTrans, vec2(0.5 + 0.5 * s, sqrt(40.0 / 1e5))).rgb;
        }
        vec3 stars(vec3 d) {
          vec3 acc = vec3(0.0);
          for (int l = 0; l < 2; l++) {
            float s = l == 0 ? 170.0 : 340.0;
            vec3 g = d * s;
            vec3 c = floor(g);
            vec3 f = fract(g) - 0.5;
            vec3 h = hash33v(c + float(l) * 37.0);
            vec3 o = (h - 0.5) * 0.7;
            float dd = length(f - o);
            float bright = pow(h.x, l == 0 ? 7.0 : 12.0);
            float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h.y * 3.0) + h.z * 60.0);
            float star = smoothstep(0.17, 0.0, dd) * bright * tw * (l == 0 ? 6.0 : 3.0);
            vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h.y);
            acc += star * tint;
          }
          return acc;
        }
        vec3 milky(vec3 d) {
          // A tilted great circle with a dusty lane through the middle.
          vec3 n = normalize(vec3(0.35, 0.28, 0.89));
          float band = dot(d, n);
          vec2 st = vec2(d.x * 1.3 + d.z * 0.8, d.z * 1.3 - d.x * 0.8) + vec2(d.y * 0.6, band);
          float a = texture2D(uNoise, st * 0.34).r;
          float b = texture2D(uNoise, st * 0.92 + 0.3).g;
          float dust = texture2D(uNoise, st * 1.9).a;
          float glow = exp(-band * band * 16.0) * (0.25 + a * 0.75);
          float lane = smoothstep(0.25, 0.7, b) * exp(-band * band * 70.0);
          return (vec3(0.24, 0.27, 0.46) * glow * (1.0 - lane * 0.8) + vec3(0.32, 0.22, 0.20) * exp(-band * band * 40.0) * dust * 0.4) * 0.38;
        }
        void main() {
          vec3 d = normalize(vDir);
          vec2 uv = panoUV(d);
          vec4 s = mix(textureLod(uA, uv, 0.0), textureLod(uB, uv, 0.0), uMix);
          vec3 col = s.rgb;
          float T = s.a;
          float hor = smoothstep(-0.004, 0.012, d.y);

          // A big storybook sun, about five times its true size.
          float cs = dot(d, uSunDir);
          float R = 0.0245;
          float dist = acos(clamp(cs, -1.0, 1.0));
          float disc = smoothstep(R, R * 0.93, dist);
          if (disc > 0.0) {
            float limb = 0.72 + 0.28 * sqrt(sat(1.0 - sqr(dist / R)));
            vec3 tr = transGround(max(d.y, 0.002));
            tr = pow(tr, vec3(0.72)); // keep the disc glowing, not dull, right down to the horizon
            col += disc * limb * tr * 42.0 * smoothstep(0.04, 0.7, T) * hor;
          }

          if (uStars > 0.001) {
            col += (stars(d) + milky(d)) * uStars * T * smoothstep(0.0, 0.1, d.y);
            float mc = dot(d, uMoonDir);
            float mR = 0.03;
            float md = acos(clamp(mc, -1.0, 1.0));
            float moon = smoothstep(mR, mR * 0.95, md);
            if (moon > 0.0) {
              vec3 x = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
              vec3 y = cross(x, uMoonDir);
              vec2 m = vec2(dot(d, x), dot(d, y)) / mR;
              float maria = texture2D(uNoise, m * 0.22 + 0.4).r * 0.6 + texture2D(uNoise, m * 0.7).g * 0.4;
              float shade = mix(0.52, 1.0, smoothstep(0.32, 0.62, maria));
              col += moon * vec3(1.0, 0.96, 0.86) * shade * 1.5 * max(T, 0.04) * hor;
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      uniforms: {
        uA: { value: this.a.texture },
        uB: { value: this.b.texture },
        uMix: { value: 0 },
        uTrans: { value: trans },
        uNoise: { value: noise },
        uSunDir: U.uKeyDir, // replaced each frame below
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunI: { value: 22 },
        uStars: { value: 0 },
        uTime: U.uTime,
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.domeMat.uniforms.uSunDir = { value: new THREE.Vector3(0, 1, 0) };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 1000;

    U.uSkyLow.value = this.low.texture;
  }

  private beginCycle(sun: THREE.Vector3, moon: THREE.Vector3, look: Look, time: number, weather: SkyWeather) {
    const u = this.panoMat.uniforms;
    u.uSunDir.value.copy(sun);
    u.uMoonDir.value.copy(moon);
    u.uCloudTime.value = time;
    u.uCover.value = weather.cover;
    u.uCirrus.value = weather.cirrus;
    u.uAlto.value = weather.alto;
    u.uHero.value = weather.hero;
    u.uSeed.value.set(weather.seedX, weather.seedY);
    u.uCloudTop.value.set(...look.cloudTop);
    u.uCloudBot.value.set(...look.cloudBot);
    u.uNight.value = look.night;
    this.column = 0;
  }

  private drawColumns(from: number, to: number) {
    this.back.scissorTest = true;
    this.back.scissor.set(from, 0, to - from, H);
    this.back.viewport.set(0, 0, W, H);
    fsq(this.r, this.panoMat, this.back);
  }

  private finishCycle() {
    // Oldest panorama becomes the new fade target; the fresh render lands in it.
    this.copyMat.uniforms.t.value = this.back.texture;
    const nextA = this.b;
    const nextB = this.a;
    fsq(this.r, this.copyMat, nextB);
    this.a = nextA;
    this.b = nextB;
    this.domeMat.uniforms.uA.value = this.a.texture;
    this.domeMat.uniforms.uB.value = this.b.texture;
    this.lowMat.uniforms.a.value = this.a.texture;
    this.lowMat.uniforms.b.value = this.b.texture;
    this.lastCycle = Math.max(this.elapsed, 0.05);
    this.elapsed = 0;
  }

  /** Fills every panorama. Call once at boot; split over frames by the caller. */
  renderFull(sun: THREE.Vector3, moon: THREE.Vector3, look: Look, time: number, weather: SkyWeather, step: () => void = () => {}) {
    this.beginCycle(sun, moon, look, time, weather);
    const n = 16;
    for (let i = 0; i < n; i++) {
      this.drawColumns(Math.floor((i / n) * W), Math.floor(((i + 1) / n) * W));
      step();
    }
    this.finishCycle();
    this.finishCycle();
    this.elapsed = 0;
    this.lastCycle = CYCLE_SECONDS;
    this.column = W;
    this.refreshLow(1);
  }

  private refreshLow(m: number) {
    this.lowMat.uniforms.m.value = m;
    fsq(this.r, this.lowMat, this.low);
  }

  update(dt: number, sun: THREE.Vector3, moon: THREE.Vector3, look: Look, time: number, weather: SkyWeather, sunI: number) {
    this.elapsed += dt;
    const fade = THREE.MathUtils.clamp(this.elapsed / this.lastCycle, 0, 1);
    if (this.column >= W) {
      if (this.column === W) this.finishCycle();
      this.beginCycle(sun, moon, look, time, weather);
    }
    const cycle = this.fastCycles > 0 ? 0.2 : CYCLE_SECONDS;
    const cols = Math.max(4, Math.ceil((W * dt) / cycle));
    const to = Math.min(W, this.column + cols);
    this.drawColumns(this.column, to);
    this.column = to;

    this.domeMat.uniforms.uMix.value = fade;
    this.refreshLow(fade);
    this.domeMat.uniforms.uSunDir.value.copy(sun);
    this.domeMat.uniforms.uMoonDir.value.copy(moon);
    this.domeMat.uniforms.uSunI.value = sunI;
    this.domeMat.uniforms.uStars.value = look.night;
    this.panoMat.uniforms.uSunI.value = sunI;
  }
}
