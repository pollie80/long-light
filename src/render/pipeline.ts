// Frame order: shadows, reflection, opaque scene, transparents, god rays, bloom, grade, paint, canvas.
import * as THREE from 'three';
import { Q } from '../core/quality';
import { fsMat, fsq } from './fsq';
import { L, U } from './shared';
import { Look } from '../core/time';
import gradeFrag from '../shaders/grade.glsl?raw';
import canvasFrag from '../shaders/canvas.glsl?raw';

const hdr = (w: number, h: number, extra: Partial<THREE.RenderTargetOptions> = {}) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    ...extra,
  });

export class Pipeline {
  w = 1;
  h = 1;
  opaque!: THREE.WebGLRenderTarget;
  full!: THREE.WebGLRenderTarget;
  reflect!: THREE.WebGLRenderTarget;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private rays!: THREE.WebGLRenderTarget;
  private ldr!: THREE.WebGLRenderTarget;

  private copyDepth: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private raysMat: THREE.ShaderMaterial;
  private gradeMat: THREE.ShaderMaterial;
  private canvasMat: THREE.ShaderMaterial;
  /** Thin things such as the fishing line, drawn after the paint filter so they stay crisp. */
  late = new THREE.Scene();
  mirror = new THREE.PerspectiveCamera();
  reflectVP = new THREE.Matrix4();
  renderScale = Q.renderScale;
  private frameN = 0;
  private raysClear = false;
  /** Dev profiling: blocks on the GPU between passes to time them. */
  profiling = false;
  marks: Record<string, number> = {};
  private lastMark = 0;
  mark(name: string) {
    if (!this.profiling) return;
    const gl = this.r.getContext();
    gl.finish();
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t = performance.now();
    this.marks[name] = (this.marks[name] ?? 0) * 0.8 + (t - this.lastMark) * 0.2;
    this.lastMark = t;
  }

  constructor(private r: THREE.WebGLRenderer) {
    this.copyDepth = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D c;
      uniform sampler2D d;
      void main() {
        gl_FragColor = texture2D(c, vUv);
        gl_FragDepth = texture2D(d, vUv).r;
      }`,
      { c: { value: null }, d: { value: null } },
      { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth },
    );
    this.downMat = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D t;
      uniform vec2 px;
      uniform float first;
      vec3 k(vec2 o) { return texture2D(t, vUv + o * px).rgb; }
      void main() {
        vec3 a = k(vec2(-2,-2)), b = k(vec2(0,-2)), c = k(vec2(2,-2));
        vec3 d = k(vec2(-2,0)),  e = k(vec2(0,0)),  f = k(vec2(2,0));
        vec3 g = k(vec2(-2,2)),  h = k(vec2(0,2)),  i = k(vec2(2,2));
        vec3 j = k(vec2(-1,-1)), l = k(vec2(1,-1)), m = k(vec2(-1,1)), n = k(vec2(1,1));
        vec3 col = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+l+m+n)*0.125;
        if (first > 0.5) {
          if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
          // Clamp fireflies: a single bright water glint must not bloom into a disc.
          float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col *= min(1.0, 24.0 / max(l0, 0.001));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
      { t: { value: null }, px: { value: new THREE.Vector2() }, first: { value: 0 } },
    );
    this.upMat = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D t;
      uniform sampler2D below;
      uniform vec2 px;
      uniform float w;
      void main() {
        vec3 s = vec3(0.0);
        s += texture2D(below, vUv + vec2(-1,-1)*px).rgb * 1.0;
        s += texture2D(below, vUv + vec2( 0,-1)*px).rgb * 2.0;
        s += texture2D(below, vUv + vec2( 1,-1)*px).rgb * 1.0;
        s += texture2D(below, vUv + vec2(-1, 0)*px).rgb * 2.0;
        s += texture2D(below, vUv).rgb * 4.0;
        s += texture2D(below, vUv + vec2( 1, 0)*px).rgb * 2.0;
        s += texture2D(below, vUv + vec2(-1, 1)*px).rgb * 1.0;
        s += texture2D(below, vUv + vec2( 0, 1)*px).rgb * 2.0;
        s += texture2D(below, vUv + vec2( 1, 1)*px).rgb * 1.0;
        gl_FragColor = vec4(texture2D(t, vUv).rgb + s / 16.0 * w, 1.0);
      }`,
      { t: { value: null }, below: { value: null }, px: { value: new THREE.Vector2() }, w: { value: 1 } },
    );
    this.raysMat = fsMat(
      /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D c;
      uniform sampler2D d;
      uniform vec2 sun;
      uniform float amt;
      uniform float aspect;
      void main() {
        if (amt < 0.001) { gl_FragColor = vec4(0.0); return; }
        const int N = 30;
        vec2 delta = (sun - vUv) * (0.92 / float(N));
        vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
        vec3 acc = vec3(0.0);
        float decay = 1.0;
        for (int i = 0; i < N; i++) {
          float isSky = step(0.99999, texture2D(d, uv).r);
          vec3 s = texture2D(c, uv).rgb;
          float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
          // Only the bright part of open sky casts a shaft.
          s *= isSky * smoothstep(0.7, 3.5, l);
          s = min(s, vec3(5.0));
          acc += s * decay;
          decay *= 0.96;
          uv += delta;
        }
        vec2 q = (vUv - sun) * vec2(aspect, 1.0);
        float fall = exp(-dot(q, q) * 0.9);
        gl_FragColor = vec4(acc / float(N) * amt * fall * 0.55, 1.0);
      }`,
      { c: { value: null }, d: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, aspect: { value: 1 } },
    );
    this.gradeMat = fsMat(gradeFrag, {
      c: { value: null },
      bloom: { value: null },
      rays: { value: null },
      uBloom: { value: 0.5 },
      uExposure: { value: 1 },
      uSat: { value: 1.2 },
      uWarmth: { value: 0.3 },
      uShadowTint: U.uShadowTint,
      uNight: { value: 0 },
    });
    this.canvasMat = fsMat(canvasFrag, {
      t: { value: null },
      noise: U.uNoise,
      uVignette: { value: 0.32 },
      uFade: { value: 0 },
      uTime: U.uTime,
    });
  }

  fade(v: number) {
    this.canvasMat.uniforms.uFade.value = v;
  }

  setSize(cssW: number, cssH: number) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.floor(cssW * dpr * this.renderScale));
    const h = Math.max(2, Math.floor(cssH * dpr * this.renderScale));
    this.r.setPixelRatio(1);
    this.r.setSize(Math.floor(cssW * dpr), Math.floor(cssH * dpr), false);
    this.r.domElement.style.width = cssW + 'px';
    this.r.domElement.style.height = cssH + 'px';
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const t of [this.opaque, this.full, this.reflect, this.rays, this.ldr, ...this.bloomDown, ...this.bloomUp]) t?.dispose();
    this.opaque = hdr(w, h, {
      samples: Q.msaa,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType),
    });
    this.full = hdr(w, h, { depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType) });
    this.reflect = hdr(Math.floor(w * Q.reflectScale), Math.floor(h * Q.reflectScale), { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.rays = hdr(Math.floor(w / 2), Math.floor(h / 2));
    this.ldr = hdr(w, h);
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = w;
    let bh = h;
    for (let i = 0; i < Q.bloomLevels; i++) {
      bw = Math.max(2, Math.floor(bw / 2));
      bh = Math.max(2, Math.floor(bh / 2));
      this.bloomDown.push(hdr(bw, bh));
      this.bloomUp.push(hdr(bw, bh));
    }
  }

  /** Mirror the camera over the water plane. */
  updateMirror(cam: THREE.PerspectiveCamera) {
    const m = this.mirror;
    m.copy(cam, false);
    m.fov = cam.fov;
    m.aspect = cam.aspect;
    m.near = cam.near;
    m.far = cam.far;
    const p = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    p.y = -p.y;
    dir.y = -dir.y;
    up.y = -up.y;
    m.up.copy(up);
    m.position.copy(p);
    m.lookAt(p.clone().add(dir));
    m.updateMatrixWorld();
    m.updateProjectionMatrix();
    this.reflectVP.multiplyMatrices(m.projectionMatrix, m.matrixWorldInverse);
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, look: Look, sunWorld: THREE.Vector3, sunI: number) {
    const r = this.r;
    r.autoClear = false;
    cam.updateMatrixWorld();

    this.mark('before');
    // Reflection. It can be a frame or two old without anyone seeing, which on lower settings saves a whole scene.
    r.setClearColor(0x000000, 1);
    if (this.frameN % Q.reflectEvery === 0) {
      this.updateMirror(cam);
      U.uClip.value = 1;
      this.mirror.layers.set(L.OPAQUE);
      this.mirror.layers.enable(L.REFLECT_ONLY);
      r.setRenderTarget(this.reflect);
      r.clear(true, true, true);
      r.render(scene, this.mirror);
      U.uClip.value = 0;
    }
    this.frameN += 1;
    this.mark('reflect');

    // Opaque
    cam.layers.set(L.OPAQUE);
    cam.layers.enable(L.MAIN_ONLY);
    r.setRenderTarget(this.opaque);
    r.clear(true, true, true);
    r.render(scene, cam);

    this.mark('opaque');
    // Copy colour and depth, then draw things that see through to the opaque image.
    this.copyDepth.uniforms.c.value = this.opaque.texture;
    this.copyDepth.uniforms.d.value = this.opaque.depthTexture;
    fsq(r, this.copyDepth, this.full);
    cam.layers.set(L.CLEAR);
    r.setRenderTarget(this.full);
    r.render(scene, cam);
    cam.layers.set(L.OPAQUE);
    cam.layers.enable(L.MAIN_ONLY);

    this.mark('water');
    // God rays
    const sunNdc = sunWorld.clone().multiplyScalar(5000).add(cam.position).project(cam);
    const facing = cam.getWorldDirection(new THREE.Vector3()).dot(sunWorld);
    const onScreenness = THREE.MathUtils.smoothstep(facing, 0.1, 0.5);
    const ru = this.raysMat.uniforms;
    ru.c.value = this.full.texture;
    ru.d.value = this.opaque.depthTexture;
    ru.sun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    ru.amt.value = look.rays * onScreenness * (sunWorld.y > -0.05 ? 1 : 0);
    ru.aspect.value = this.w / this.h;
    // No sun in view, no rays: an empty image only has to be cleared once.
    if (ru.amt.value > 0.002) {
      fsq(r, this.raysMat, this.rays);
      this.raysClear = false;
    } else if (!this.raysClear) {
      r.setRenderTarget(this.rays);
      r.clear(true, false, false);
      this.raysClear = true;
    }

    this.mark('rays');
    // Bloom
    let src: THREE.Texture = this.full.texture;
    let sw = this.w;
    let sh = this.h;
    for (let i = 0; i < this.bloomDown.length; i++) {
      this.downMat.uniforms.t.value = src;
      this.downMat.uniforms.px.value.set(1 / sw, 1 / sh);
      this.downMat.uniforms.first.value = i === 0 ? 1 : 0;
      fsq(r, this.downMat, this.bloomDown[i]);
      src = this.bloomDown[i].texture;
      sw = this.bloomDown[i].width;
      sh = this.bloomDown[i].height;
    }
    let up: THREE.Texture = this.bloomDown[this.bloomDown.length - 1].texture;
    for (let i = this.bloomDown.length - 2; i >= 0; i--) {
      const u = this.upMat.uniforms;
      u.t.value = this.bloomDown[i].texture;
      u.below.value = up;
      u.px.value.set(1 / this.bloomDown[i + 1].width, 1 / this.bloomDown[i + 1].height);
      u.w.value = 1.0;
      fsq(r, this.upMat, this.bloomUp[i]);
      up = this.bloomUp[i].texture;
    }

    this.mark('bloom');
    // Grade into display-referred colour, where the paint filter behaves.
    const g = this.gradeMat.uniforms;
    g.c.value = this.full.texture;
    g.bloom.value = up;
    g.rays.value = this.rays.texture;
    g.uBloom.value = look.bloom;
    g.uExposure.value = look.exposure;
    g.uSat.value = look.sat;
    g.uWarmth.value = look.warmth;
    g.uNight.value = look.night;
    fsq(r, this.gradeMat, this.ldr);

    this.mark('grade');
    // Last touches, and on to the screen.
    this.canvasMat.uniforms.t.value = this.ldr.texture;
    fsq(r, this.canvasMat, null);
    this.mark('canvas');

    // Thin things go on last, so they stay crisp.
    const lateCam = cam.layers.mask;
    cam.layers.enableAll();
    r.setRenderTarget(null);
    r.render(this.late, cam);
    cam.layers.mask = lateCam;
  }
}
