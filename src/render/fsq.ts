import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';

export { common };

export const FSQ_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const tri = new THREE.Mesh(geo);
tri.frustumCulled = false;
scene.add(tri);

/** Draws one fullscreen triangle into `target` (null is the canvas). */
export function fsq(renderer: THREE.WebGLRenderer, mat: THREE.Material, target: THREE.WebGLRenderTarget | null, layer = 0) {
  tri.material = mat;
  renderer.setRenderTarget(target as THREE.WebGLRenderTarget, layer);
  renderer.render(scene, camera);
}

export function fsMat(frag: string, uniforms: Record<string, THREE.IUniform>, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FSQ_VERT,
    fragmentShader: common + '\n' + frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...opts,
  });
}
