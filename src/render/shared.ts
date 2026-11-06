// Uniforms shared by every lit material, and the painted lighting model they all use.
import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import lit from '../shaders/lit.glsl?raw';

export const MAX_LIGHTS = 10;

export const U = {
  uTime: { value: 0 },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uKeyCol: { value: new THREE.Vector3(1, 1, 1) },
  uShadowTint: { value: new THREE.Vector3(0.1, 0.1, 0.3) },
  uBounce: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
  uAmb: { value: 1 },
  uFog: { value: 0.0001 },
  uMist: { value: 0 },
  uWarmth: { value: 0 },
  uNight: { value: 0 },
  uClip: { value: 0 },
  uSkyLow: { value: null as THREE.Texture | null },
  uNoise: { value: null as THREE.Texture | null },
  uDabs: { value: null as THREE.Texture | null },
  uShadow0: { value: null as THREE.Texture | null },
  uShadow1: { value: null as THREE.Texture | null },
  uShadowM0: { value: new THREE.Matrix4() },
  uShadowM1: { value: new THREE.Matrix4() },
  uShadowOn: { value: 1 },
  uCloudShade: { value: new THREE.Vector4(0, 0, 0.5, 0) },
  uPL: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 1)) },
  uPLC: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, 0, 0)) },
  uWind: { value: new THREE.Vector2(1, 0.3) },
  uPlayer: { value: new THREE.Vector3() },
};

export const LIT_FRAG = common + '\n' + lit;

/** Geometry helper: a world-space lit vertex shader, optionally instanced. */
export const LIT_VERT = /* glsl */ `
#ifdef USE_COLOR
#else
attribute vec3 color;
#endif
attribute float aEmis;
varying vec3 vP;
varying vec3 vN;
varying vec3 vC;
varying float vE;
void main() {
  vec4 wp = vec4(position, 1.0);
  vec3 n = normal;
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  n = mat3(instanceMatrix) * n;
#endif
  wp = modelMatrix * wp;
  vN = normalize(mat3(modelMatrix) * n);
  vP = wp.xyz;
  vC = color;
  vE = aEmis;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** Standard painted surface for buildings, boats, people, props. Colours come from vertex attributes. */
export function paintedMaterial(opts: { rough?: number; emisCol?: THREE.Color; side?: THREE.Side } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: LIT_VERT,
    fragmentShader:
      LIT_FRAG +
      /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vC;
      varying float vE;
      uniform vec3 uEmisCol;
      uniform float uEmisOn;
      void main() {
        clipBelowWater(vP);
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        // Slow value drift across every surface so nothing is ever a flat colour.
        vec2 nuv = (vP.xz + vP.y * 0.7) * 0.31;
        float n = texture2D(uNoise, nuv).r;
        float n2 = texture2D(uNoise, nuv * 3.7).g;
        vec3 alb = vC * (0.82 + 0.3 * n) * (0.92 + 0.16 * n2);
        vec3 col = litSurface(alb, N, vP, 1.0, 0.0);
        col += uEmisCol * vE * uEmisOn;
        gl_FragColor = vec4(applyFog(col, vP), 1.0);
      }`,
    uniforms: {
      ...U,
      uEmisCol: { value: opts.emisCol ?? new THREE.Color(1.0, 0.62, 0.26) },
      uEmisOn: { value: 0 },
    },
    side: opts.side ?? THREE.FrontSide,
    vertexColors: true,
  });
}

/** Layers keep passes simple. */
export const L = {
  OPAQUE: 0, // main view and reflection
  CLEAR: 1, // transparent pass: water, smoke, mist
  MAIN_ONLY: 2, // grass and fine detail, skipped in the reflection
  REFLECT_ONLY: 3, // cheap stand-ins, seen only in the reflection
  CAST_NEAR: 6, // casts only into the fine shadow map
  CAST_FAR: 7, // casts only into the wide shadow map
  CAST_SOLID: 4,
  CAST_FOLIAGE: 5,
};
