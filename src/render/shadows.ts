// Two sun-aligned shadow maps: a fine one around the player, a huge one so hills throw long evening
// shadows across the cove. The huge one only refreshes every few frames.
import * as THREE from 'three';
import { L, U } from './shared';
import { Q } from '../core/quality';

const NEAR_SIZE = Q.shadowNear;
const FAR_SIZE = Q.shadowFar;
const NEAR_RADIUS = 62;
const FAR_RADIUS = 760;

function mkDepthRT(size: number) {
  const depth = new THREE.DepthTexture(size, size, THREE.FloatType);
  depth.minFilter = THREE.NearestFilter;
  depth.magFilter = THREE.NearestFilter;
  return new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true, format: THREE.RedFormat, type: THREE.UnsignedByteType });
}

export class Shadows {
  private near = mkDepthRT(NEAR_SIZE);
  private far = mkDepthRT(FAR_SIZE);
  private camNear = new THREE.OrthographicCamera(-NEAR_RADIUS, NEAR_RADIUS, NEAR_RADIUS, -NEAR_RADIUS, 1, 900);
  private camFar = new THREE.OrthographicCamera(-FAR_RADIUS, FAR_RADIUS, FAR_RADIUS, -FAR_RADIUS, 1, 3200);
  private solidMat: THREE.ShaderMaterial;
  private foliageMat: THREE.ShaderMaterial;
  private frame = 0;

  constructor(private r: THREE.WebGLRenderer) {
    const vs = /* glsl */ `
      void main() {
        vec4 wp = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * wp;
      }`;
    this.solidMat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: `void main(){ gl_FragColor = vec4(1.0); }`, side: THREE.DoubleSide, colorWrite: false });
    this.foliageMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec2 aDab;
        varying vec2 vUvD;
        uniform float uTime;
        void main() {
          vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
          vUvD = uv / 4.0 + aDab / 4.0;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUvD;
        uniform sampler2D uDabs;
        void main() {
          if (texture2D(uDabs, vUvD).r < 0.4) discard;
          gl_FragColor = vec4(1.0);
        }`,
      uniforms: { uDabs: U.uDabs, uTime: U.uTime },
      side: THREE.DoubleSide,
      colorWrite: false,
    });
  }

  private place(cam: THREE.OrthographicCamera, center: THREE.Vector3, dir: THREE.Vector3, size: number, radius: number, dist: number) {
    // Snap the centre to shadow texels along the light's axes so edges do not crawl as the player walks.
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.98) cam.up.set(0, 0, 1);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const texel = (radius * 2) / size;
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const ls = center.clone().applyMatrix4(inv);
    ls.x = Math.round(ls.x / texel) * texel;
    ls.y = Math.round(ls.y / texel) * texel;
    const snapped = ls.applyMatrix4(cam.matrixWorld);
    cam.position.copy(snapped).addScaledVector(dir, dist);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.updateProjectionMatrix();
  }

  private draw(scene: THREE.Scene, cam: THREE.OrthographicCamera, rt: THREE.WebGLRenderTarget, matrix: THREE.Matrix4, extra: number) {
    const r = this.r;
    r.setRenderTarget(rt);
    r.clear(true, true, false);
    const old = scene.overrideMaterial;
    cam.layers.set(L.CAST_SOLID);
    cam.layers.enable(extra);
    scene.overrideMaterial = this.solidMat;
    r.render(scene, cam);
    cam.layers.set(L.CAST_FOLIAGE);
    scene.overrideMaterial = this.foliageMat;
    r.render(scene, cam);
    scene.overrideMaterial = old;
    matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  update(scene: THREE.Scene, center: THREE.Vector3, dir: THREE.Vector3) {
    if (dir.y < 0.01) {
      U.uShadowOn.value = 0;
      return;
    }
    U.uShadowOn.value = 1;
    // Very low suns stretch shadows endlessly, so hold the casting angle at a useful minimum.
    const d = dir.clone();
    if (d.y < 0.05) {
      d.y = 0.05;
      d.normalize();
    }
    this.r.setClearColor(0xffffff, 1);
    // The fine map refreshes on alternate frames; nothing here moves fast enough to notice.
    if (this.frame % Q.shadowNearEvery === 0) {
      this.place(this.camNear, center, d, NEAR_SIZE, NEAR_RADIUS, 420);
      this.draw(scene, this.camNear, this.near, U.uShadowM0.value, L.CAST_NEAR);
    }
    if (this.frame % Q.shadowFarEvery === 1) {
      this.place(this.camFar, new THREE.Vector3(center.x * 0.3, 0, center.z * 0.3), d, FAR_SIZE, FAR_RADIUS, 1500);
      this.draw(scene, this.camFar, this.far, U.uShadowM1.value, L.CAST_FAR);
    }
    this.frame++;
    U.uShadow0.value = this.near.depthTexture;
    U.uShadow1.value = this.far.depthTexture;
    this.r.setClearColor(0x000000, 1);
  }

  force() {
    this.frame = 0;
  }
}
