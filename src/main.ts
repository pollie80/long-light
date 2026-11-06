import * as THREE from 'three';
import { Game } from './game/game';

function fail(message: string) {
  const l = document.getElementById('loading');
  if (l) l.querySelector('p')!.textContent = message;
  console.error(message);
}

async function main() {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    depth: false,
    stencil: false,
    alpha: false,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  document.body.prepend(renderer.domElement);
  const game = new Game(renderer);
  const w = window as unknown as { __ll: unknown };
  w.__ll = { ready: false };
  await game.boot();
  w.__ll = game.debugApi();
}

main().catch((e) => {
  const webgl = /webgl|context/i.test(String(e?.message ?? e));
  fail(webgl ? 'Long Light needs Chrome or Edge on a computer with graphics acceleration turned on.' : `Something went wrong while painting: ${e?.message ?? e}`);
});
