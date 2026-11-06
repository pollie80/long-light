// Builds the fisher's geometry from a CharacterLook. Every part of the rig gets one merged mesh.
// Forward is -Z, up is +Y. Head parts are in head space: the skull is centred at y 0.05, radius about 0.108.
import * as THREE from 'three';
import { Builder, TRS } from '../world/builder';
import { CharacterLook, choiceOf } from './look';

type BG = THREE.BufferGeometry;

export interface BodyParts {
  hips: BG | null;
  torso: BG | null;
  head: BG | null;
  spin: BG | null;
  neck: BG | null;
  scarfA: BG | null;
  scarfB: BG | null;
  cape: BG | null;
  upper: [BG, BG];
  fore: [BG, BG];
  thigh: [BG, BG];
  shin: [BG, BG];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const INK = 0x2a2024;
const WHITE = 0xf2ecdc;
const GOLD = 0xd8b040;

const finish = (b: Builder): BG | null => (b.empty ? null : b.build());

function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

// ---- Face ---------------------------------------------------------------------------------------

function eyes(b: Builder, L: CharacterLook, skin: number) {
  const iris = choiceOf('eyeColor', L.eyeColor).color!;
  const eye = (x: number, y: number, z: number, white: number, ir: number, pupilDX = 0, pupilDY = 0) => {
    b.sphere(white, WHITE, TRS(x, y, z), {}, 10, 8);
    b.sphere(ir, iris, TRS(x + pupilDX, y + pupilDY, z - white * 0.72), {}, 8, 6);
    b.sphere(ir * 0.55, 0x120e10, TRS(x + pupilDX, y + pupilDY, z - white * 0.72 - ir * 0.62), {}, 6, 5);
  };
  switch (L.eyes) {
    case 'round':
      for (const s of [-1, 1]) eye(s * 0.042, 0.075, -0.09, 0.018, 0.011);
      break;
    case 'sleepy':
      for (const s of [-1, 1]) {
        eye(s * 0.042, 0.07, -0.09, 0.018, 0.011);
        b.sphere(0.0195, skin, TRS(s * 0.042, 0.077, -0.09, 0, 0, 0, 1.06, 0.72, 1.06), {}, 8, 6);
      }
      break;
    case 'wide':
      for (const s of [-1, 1]) eye(s * 0.044, 0.078, -0.088, 0.025, 0.012);
      break;
    case 'squint':
      for (const s of [-1, 1]) {
        b.add(new THREE.TorusGeometry(0.016, 0.0038, 5, 10, Math.PI), INK, TRS(s * 0.042, 0.068, -0.103));
      }
      break;
    case 'anime':
      for (const s of [-1, 1]) {
        b.sphere(0.033, WHITE, TRS(s * 0.046, 0.075, -0.083, 0, 0, 0, 0.9, 1.25, 0.7), {}, 12, 10);
        b.sphere(0.021, iris, TRS(s * 0.046, 0.072, -0.103, 0, 0, 0, 0.9, 1.2, 0.5), {}, 10, 8);
        b.sphere(0.013, 0x120e10, TRS(s * 0.046, 0.072, -0.109, 0, 0, 0, 0.9, 1.2, 0.5), {}, 8, 6);
        b.sphere(0.006, WHITE, TRS(s * 0.052, 0.082, -0.114), {}, 6, 5);
      }
      break;
    case 'googly':
      b.sphere(0.036, WHITE, TRS(-0.05, 0.085, -0.088), {}, 12, 10);
      b.sphere(0.017, 0x120e10, TRS(-0.062, 0.072, -0.118), {}, 8, 6);
      b.sphere(0.028, WHITE, TRS(0.05, 0.072, -0.09), {}, 12, 10);
      b.sphere(0.013, 0x120e10, TRS(0.058, 0.086, -0.114), {}, 8, 6);
      break;
    case 'cyclops':
      eye(0, 0.078, -0.082, 0.046, 0.027);
      break;
    case 'crossed':
      for (const s of [-1, 1]) {
        for (const r of [0.78, -0.78]) b.box(0.036, 0.006, 0.006, INK, TRS(s * 0.042, 0.075, -0.103, 0, 0, r), {}, 0.002);
      }
      break;
    case 'stalks':
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.04, 0.1, -0.08), V(s * 0.055, 0.17, -0.1), V(s * 0.07, 0.24, -0.1)], 0.008, skin, {}, 6, 5);
        eye(s * 0.072, 0.25, -0.1, 0.026, 0.014);
      }
      break;
    default:
      for (const s of [-1, 1]) b.sphere(0.011, INK, TRS(s * 0.042, 0.075, -0.095), {}, 6, 5);
  }
}

function eyewear(b: Builder, L: CharacterLook) {
  const frame = 0x2c2428;
  const rim = (x: number, y: number, r: number, col = frame, tube = 0.0042) => {
    b.add(new THREE.TorusGeometry(r, tube, 5, 16), col, TRS(x, y, -0.108));
  };
  const glass = (x: number, y: number, r: number, col: number) => b.cyl(r, r, 0.002, col, TRS(x, y, -0.108, Math.PI / 2, 0, 0), {}, 14);
  switch (L.eyewear) {
    case 'round':
      for (const s of [-1, 1]) rim(s * 0.043, 0.075, 0.025, GOLD);
      b.box(0.034, 0.004, 0.004, GOLD, TRS(0, 0.078, -0.108), {}, 0.001);
      break;
    case 'square':
      for (const s of [-1, 1]) {
        b.box(0.05, 0.036, 0.004, frame, TRS(s * 0.043, 0.075, -0.106), {}, 0.002);
        b.box(0.04, 0.026, 0.005, 0xcfe0e4, TRS(s * 0.043, 0.075, -0.107), {}, 0.001);
      }
      break;
    case 'shades':
      for (const s of [-1, 1]) b.box(0.054, 0.034, 0.006, 0x151318, TRS(s * 0.044, 0.075, -0.106, 0, 0, s * 0.08), {}, 0.006);
      b.box(0.11, 0.006, 0.005, 0x151318, TRS(0, 0.09, -0.107), {}, 0.002);
      break;
    case 'patch':
      b.sphere(0.024, 0x151318, TRS(0.044, 0.076, -0.096, 0, 0, 0, 1, 1, 0.45), {}, 10, 8);
      b.tube([V(0.07, 0.1, -0.08), V(0.0, 0.135, -0.1), V(-0.09, 0.08, -0.06)], 0.0035, 0x151318, {}, 8, 4);
      break;
    case 'monocle':
      rim(0.043, 0.075, 0.026, GOLD);
      b.tube([V(0.068, 0.07, -0.108), V(0.1, 0.0, -0.08), V(0.14, -0.14, -0.05)], 0.0022, GOLD, {}, 8, 4);
      break;
    case 'stars':
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          const r = i % 2 ? 0.017 : 0.04;
          if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
        b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }), 0xe8408c, TRS(s * 0.048, 0.076, -0.116));
      }
      break;
    case 'threeD':
      b.box(0.13, 0.04, 0.004, WHITE, TRS(0, 0.076, -0.106), {}, 0.002);
      glass(-0.036, 0.076, 0.016, 0xe02a2a);
      glass(0.036, 0.076, 0.016, 0x2a8ae0);
      break;
    case 'snorkel':
      b.box(0.13, 0.058, 0.03, 0x2c6a8a, TRS(0, 0.078, -0.102), {}, 0.012);
      b.box(0.11, 0.04, 0.012, 0xbfe0ea, TRS(0, 0.078, -0.118), {}, 0.006);
      b.tube([V(0.07, 0.03, -0.1), V(0.135, 0.06, -0.06), V(0.13, 0.28, -0.04)], 0.012, 0xe0802a, {}, 10, 6);
      break;
    case 'groucho':
      for (const s of [-1, 1]) rim(s * 0.043, 0.078, 0.024, 0x151318, 0.0055);
      b.box(0.06, 0.012, 0.016, 0x151318, TRS(0, 0.104, -0.1), {}, 0.005);
      b.sphere(0.034, 0xe6a080, TRS(0, 0.042, -0.114, 0, 0, 0, 0.85, 1, 1.3), {}, 10, 8);
      b.box(0.11, 0.026, 0.018, 0x151318, TRS(0, 0.012, -0.104), {}, 0.01);
      break;
    default:
  }
}

function brows(b: Builder, L: CharacterLook, hair: number) {
  const pair = (w: number, t: number, tilt: number, y = 0.103) => {
    for (const s of [-1, 1]) b.box(w, t, t, hair, TRS(s * 0.043, y, -0.098, 0, 0, s * tilt), {}, t * 0.4);
  };
  switch (L.brows) {
    case 'thin': pair(0.036, 0.0045, 0.08); break;
    case 'normal': pair(0.04, 0.008, 0.05); break;
    case 'bushy': pair(0.05, 0.016, 0.06); break;
    case 'angry': pair(0.046, 0.011, -0.42, 0.098); break;
    case 'worried': pair(0.042, 0.009, 0.42, 0.106); break;
    case 'unibrow': b.box(0.115, 0.014, 0.014, hair, TRS(0, 0.103, -0.1), {}, 0.006); break;
    case 'huge': pair(0.075, 0.03, -0.12, 0.122); break;
    default:
  }
}

function nose(b: Builder, L: CharacterLook, skin: number) {
  switch (L.nose) {
    case 'button': b.sphere(0.018, skin, TRS(0, 0.04, -0.106), {}, 8, 6); break;
    case 'long': b.add(new THREE.ConeGeometry(0.02, 0.085, 8), skin, TRS(0, 0.036, -0.135, -Math.PI / 2, 0, 0)); break;
    case 'hooked':
      b.tube([V(0, 0.07, -0.1), V(0, 0.058, -0.138), V(0, 0.018, -0.13)], 0.018, skin, {}, 8, 7);
      break;
    case 'big': b.sphere(0.046, skin, TRS(0, 0.032, -0.116), {}, 12, 10); break;
    case 'clown': b.sphere(0.042, 0xd8201c, TRS(0, 0.036, -0.122), {}, 12, 10); break;
    case 'carrot': b.add(new THREE.ConeGeometry(0.03, 0.2, 9), 0xe0761c, TRS(0, 0.036, -0.195, -Math.PI / 2, 0, 0)); break;
    case 'pickle': b.sphere(0.03, 0x6a8a2c, TRS(0, 0.014, -0.122, 0.2, 0, 0, 0.9, 1.9, 0.95), {}, 10, 8); break;
    case 'banana': b.tube([new THREE.Vector3(0, 0.05, -0.1), new THREE.Vector3(0, 0.02, -0.17), new THREE.Vector3(0, -0.05, -0.2), new THREE.Vector3(0, -0.13, -0.19)], 0.024, 0xe8cc3a, {}, 10, 7); break;
    default: b.sphere(0.03, skin, TRS(0, 0.035, -0.105, 0, 0, 0, 0.9, 0.9, 1.2), {}, 8, 6);
  }
}

function ears(b: Builder, L: CharacterLook, skin: number) {
  const ear = (sx: number, sy: number, sz: number) => {
    for (const s of [-1, 1]) b.sphere(0.024, skin, TRS(s * 0.108, 0.05, 0.0, 0, s * 0.3, 0, sx, sy, sz), {}, 8, 6);
  };
  switch (L.ears) {
    case 'normal': ear(0.55, 1.1, 0.9); break;
    case 'small': ear(0.4, 0.75, 0.65); break;
    case 'big': ear(0.6, 1.5, 1.35); break;
    case 'elf':
      for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.024, 0.13, 7), skin, TRS(s * 0.145, 0.085, 0.015, 0, 0, -s * 1.0));
      break;
    case 'huge':
      for (const s of [-1, 1]) {
        b.sphere(0.075, skin, TRS(s * 0.17, 0.06, 0.015, 0, s * 0.15, 0, 1, 1.1, 0.14), {}, 12, 10);
        b.sphere(0.05, 0xd88a90, TRS(s * 0.172, 0.06, 0.004, 0, s * 0.15, 0, 1, 1.1, 0.12), {}, 10, 8);
      }
      break;
    default:
  }
}

function markings(b: Builder, L: CharacterLook, skin: number) {
  switch (L.markings) {
    case 'rosy':
      for (const s of [-1, 1]) b.sphere(0.024, mixHex(skin, 0xc8402a, 0.42), TRS(s * 0.07, 0.03, -0.075), {}, 6, 5);
      break;
    case 'freckles':
      for (let i = 0; i < 18; i++) {
        const s = i % 2 ? -1 : 1;
        const a = (i * 2.399) % 1;
        const x = s * (0.03 + ((i * 7) % 5) * 0.012);
        const y = 0.03 + ((i * 3) % 4) * 0.009;
        const z = -Math.sqrt(Math.max(0.001, 0.0113 - x * x - (y - 0.05) * (y - 0.05))) * 0.98;
        b.sphere(0.0034 + a * 0.001, mixHex(skin, 0x6a3a1c, 0.55), TRS(x, y, z), {}, 4, 3);
      }
      break;
    case 'scar':
      b.box(0.006, 0.066, 0.004, mixHex(skin, 0x8a2a2a, 0.6), TRS(0.056, 0.075, -0.094, 0, 0, 0.2), {}, 0.001);
      break;
    case 'weathered':
      for (const s of [-1, 1]) {
        b.sphere(0.024, mixHex(skin, 0x8a4a30, 0.38), TRS(s * 0.07, 0.03, -0.075), {}, 6, 5);
        for (let i = 0; i < 2; i++) b.box(0.022, 0.0028, 0.002, mixHex(skin, 0x4a2a1c, 0.5), TRS(s * 0.078, 0.082 - i * 0.012, -0.076, 0, s * 0.8, s * 0.3), {}, 0.001);
      }
      break;
    case 'warpaint':
      for (const s of [-1, 1]) {
        for (let i = 0; i < 2; i++) b.box(0.05, 0.009, 0.003, i ? 0xe8e4d8 : 0x2a58b0, TRS(s * 0.062, 0.042 - i * 0.016, -0.082, 0, s * 0.62, 0), {}, 0.001);
      }
      break;
    case 'clown':
      b.sphere(0.058, WHITE, TRS(0, 0.012, -0.066, 0, 0, 0, 1, 0.75, 0.75), {}, 10, 8);
      for (const s of [-1, 1]) {
        b.sphere(0.022, 0xe02a3c, TRS(s * 0.07, 0.034, -0.078), {}, 6, 5);
        b.box(0.008, 0.044, 0.003, 0x2a58b0, TRS(s * 0.042, 0.082, -0.1), {}, 0.001);
      }
      break;
    case 'whiskers':
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) b.box(0.075, 0.0025, 0.0025, INK, TRS(s * 0.075, 0.027 - i * 0.012, -0.085, 0, s * 0.55, s * (0.2 - i * 0.2)), {}, 0.001);
      }
      break;
    default:
  }
}

function mouth(b: Builder, L: CharacterLook) {
  const y = 0.002;
  const z = -0.1;
  const arc = (r: number, up: boolean, tube = 0.0035, col = 0x5a2a28) => {
    b.add(new THREE.TorusGeometry(r, tube, 5, 12, Math.PI), col, TRS(0, y + (up ? r * 0.75 : -r * 0.75), z, 0, 0, up ? Math.PI : 0));
  };
  switch (L.mouth) {
    case 'smile': arc(0.024, true); break;
    case 'grin':
      arc(0.032, true, 0.004);
      b.box(0.05, 0.013, 0.004, WHITE, TRS(0, y + 0.0, z - 0.002), {}, 0.002);
      break;
    case 'flat': b.box(0.04, 0.004, 0.003, 0x5a2a28, TRS(0, y, z), {}, 0.001); break;
    case 'frown': arc(0.022, false); break;
    case 'oh': b.sphere(0.014, 0x3a1a1c, TRS(0, y, z + 0.005, 0, 0, 0, 1, 1.25, 0.5), {}, 8, 6); break;
    case 'teeth':
      arc(0.024, true);
      for (const s of [-1, 1]) b.box(0.015, 0.024, 0.006, WHITE, TRS(s * 0.0085, y - 0.018, z - 0.005), {}, 0.002);
      break;
    case 'tongue':
      arc(0.024, true);
      b.box(0.026, 0.038, 0.006, 0xe06a7a, TRS(0.004, y - 0.026, z - 0.006, 0.12, 0, 0.08), {}, 0.006);
      break;
    default:
  }
}

function inMouth(b: Builder, L: CharacterLook) {
  const y = 0.002;
  switch (L.inMouth) {
    case 'grass':
      b.tube([V(0.012, y, -0.1), V(0.05, y - 0.015, -0.16), V(0.1, y + 0.03, -0.21)], 0.0028, 0xa8b84a, {}, 8, 4);
      break;
    case 'pipe':
      b.tube([V(0.015, y, -0.1), V(0.035, y - 0.02, -0.15), V(0.06, y - 0.03, -0.19)], 0.006, 0x3a2418, {}, 8, 5);
      b.cyl(0.021, 0.017, 0.042, 0x6b3f22, TRS(0.066, y - 0.012, -0.2), {}, 10);
      b.cyl(0.016, 0.016, 0.004, 0x1c1214, TRS(0.066, y + 0.01, -0.2), {}, 10);
      break;
    case 'cigar':
      b.cyl(0.0085, 0.0085, 0.1, 0x6b4426, TRS(0.018, y - 0.008, -0.145, Math.PI / 2 + 0.2, 0, 0), {}, 8);
      b.cyl(0.0088, 0.0088, 0.012, 0x9a9a98, TRS(0.018, y - 0.018, -0.192, Math.PI / 2 + 0.2, 0, 0), {}, 8);
      break;
    case 'rose':
      b.tube([V(-0.012, y, -0.1), V(-0.05, y - 0.012, -0.14), V(-0.1, y - 0.015, -0.165)], 0.003, 0x3c6a2c, {}, 8, 4);
      for (let i = 0; i < 6; i++) b.sphere(0.012, 0xc01c30, TRS(-0.105 + Math.cos(i) * 0.012, y - 0.012 + Math.sin(i) * 0.012, -0.17), {}, 6, 5);
      break;
    case 'fish':
      b.sphere(0.03, 0x9ab4b8, TRS(0.0, y - 0.004, -0.15, 0, 0, 0, 0.45, 0.62, 1.7), {}, 10, 8);
      b.add(new THREE.ConeGeometry(0.026, 0.05, 4), 0x6a8488, TRS(0, y - 0.004, -0.213, -Math.PI / 2, 0, 0, 0.3, 1, 1));
      break;
    case 'kazoo':
      b.box(0.028, 0.024, 0.13, 0xd8b030, TRS(0, -0.018, -0.17), {}, 0.008);
      b.cyl(0.016, 0.016, 0.02, 0xc09a20, TRS(0, 0.004, -0.17), {}, 8);
      break;
    case 'sausage':
      b.sphere(0.028, 0x8a4a2a, TRS(0.06, -0.022, -0.15, 0, 0, 1.45, 1, 4.2, 1), { jit: 0.05 }, 10, 8);
      break;
    case 'gum':
      b.sphere(0.052, 0xf28cb0, TRS(0.004, y, -0.15), {}, 12, 10);
      break;
    default:
  }
}

function facialHair(b: Builder, L: CharacterLook, hair: number, skin: number) {
  const stache = (w: number, h: number, droop = 0) => {
    for (const s of [-1, 1]) {
      b.sphere(1, hair, TRS(s * w * 0.5, 0.015 - droop, -0.104, 0, 0, s * (0.3 + droop * 6), w * 0.55, h, 0.012), {}, 8, 6);
    }
  };
  switch (L.facialHair) {
    case 'stubble':
      b.sphere(0.1, mixHex(skin, hair, 0.42), TRS(0, 0.018, -0.026, 0, 0, 0, 1.02, 0.72, 1.02), {}, 12, 8);
      break;
    case 'moustache': stache(0.05, 0.012); break;
    case 'walrus': stache(0.066, 0.022, 0.012); break;
    case 'handlebar':
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.004, 0.017, -0.107), V(s * 0.04, 0.012, -0.102), V(s * 0.07, 0.024, -0.086), V(s * 0.075, 0.05, -0.08)], 0.0062, hair, {}, 10, 5);
      }
      break;
    case 'goatee':
      b.sphere(0.03, hair, TRS(0, -0.052, -0.08, 0, 0, 0, 0.85, 1.25, 0.65), {}, 8, 6);
      stache(0.04, 0.008);
      break;
    case 'soul': b.sphere(0.012, hair, TRS(0, -0.024, -0.098, 0, 0, 0, 0.8, 1.2, 0.5), {}, 6, 5); break;
    case 'chinstrap':
      b.add(new THREE.TorusGeometry(0.088, 0.0095, 6, 18, Math.PI), hair, TRS(0, 0.042, -0.008, 0.28, 0, Math.PI));
      break;
    case 'chops':
      for (const s of [-1, 1]) b.sphere(0.04, hair, TRS(s * 0.086, 0.015, -0.026, 0, 0, 0, 0.6, 1.25, 1), {}, 8, 6);
      break;
    case 'full':
      b.sphere(0.102, hair, TRS(0, -0.03, -0.03, 0, 0, 0, 1.03, 0.92, 1.03), {}, 12, 8);
      stache(0.05, 0.012);
      break;
    case 'long':
      b.sphere(0.1, hair, TRS(0, -0.025, -0.03, 0, 0, 0, 1.0, 0.8, 1.0), {}, 12, 8);
      b.add(new THREE.ConeGeometry(0.086, 0.26, 10), hair, TRS(0, -0.18, -0.05, Math.PI, 0, 0));
      stache(0.05, 0.012);
      break;
    case 'wizard':
      b.sphere(0.1, hair, TRS(0, -0.02, -0.03, 0, 0, 0, 1.0, 0.8, 1.0), {}, 12, 8);
      b.add(new THREE.ConeGeometry(0.09, 0.72, 10), hair, TRS(0, -0.42, -0.1, Math.PI + 0.12, 0, 0));
      break;
    case 'braids':
      b.sphere(0.092, hair, TRS(0, -0.015, -0.03, 0, 0, 0, 1.0, 0.75, 1.0), {}, 10, 8);
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.04, -0.05, -0.09), V(s * 0.05, -0.15, -0.09), V(s * 0.045, -0.3, -0.08)], 0.018, hair, {}, 8, 6);
        b.cyl(0.021, 0.021, 0.024, GOLD, TRS(s * 0.045, -0.26, -0.082), {}, 8);
      }
      break;
    case 'curly':
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.004, 0.017, -0.107), V(s * 0.05, 0.012, -0.11), V(s * 0.095, 0.03, -0.1), V(s * 0.098, 0.058, -0.09), V(s * 0.08, 0.052, -0.09)], 0.005, hair, {}, 14, 5);
      }
      b.sphere(0.018, hair, TRS(0, -0.052, -0.09, 0, 0, 0, 0.7, 1.6, 0.6), {}, 6, 5);
      break;
    case 'short':
      b.sphere(0.09, hair, TRS(0, -0.015, -0.03, 0, 0, 0, 1.0, 0.75, 1.0), {}, 10, 8);
      break;
    default:
  }
}

function hairDo(b: Builder, L: CharacterLook, hair: number) {
  const cap = () => b.sphere(0.102, hair, TRS(0, 0.06, 0.03, 0, 0, 0, 1.03, 1.02, 0.95), {}, 12, 8);
  switch (L.hairStyle) {
    case 'short': cap(); break;
    case 'receding': b.sphere(0.1, hair, TRS(0, 0.05, 0.044, 0, 0, 0, 1.04, 0.92, 0.84), {}, 12, 8); break;
    case 'long':
      cap();
      b.sphere(0.102, hair, TRS(0, -0.06, 0.05, 0, 0, 0, 1.1, 1.75, 0.68), {}, 12, 8);
      break;
    case 'ponytail':
      cap();
      b.tube([V(0, 0.07, 0.12), V(0, 0.0, 0.17), V(0, -0.2, 0.17)], 0.024, hair, {}, 10, 6);
      b.cyl(0.028, 0.028, 0.018, 0xb8392e, TRS(0, 0.05, 0.135), {}, 8);
      break;
    case 'bun':
      cap();
      b.sphere(0.052, hair, TRS(0, 0.135, 0.075), {}, 10, 8);
      break;
    case 'mullet':
      cap();
      b.sphere(0.09, hair, TRS(0, -0.07, 0.06, 0, 0, 0, 1.05, 1.55, 0.6), {}, 10, 8);
      break;
    case 'curls':
      for (let i = 0; i < 26; i++) {
        const a = i * 2.399;
        const u = (i / 26) * 1.9 - 0.6;
        const r = Math.sqrt(Math.max(0, 1 - u * u * 0.5));
        const zb = Math.sin(a) * r;
        if (zb < -0.45 && u < 0.5) continue;
        b.sphere(0.035, hair, TRS(Math.cos(a) * r * 0.1, 0.06 + u * 0.09, 0.012 + zb * 0.1), { jit: 0.2 }, 7, 5);
      }
      break;
    case 'afro':
      b.sphere(0.2, hair, TRS(0, 0.11, 0.05), { jit: 0.1 }, 16, 12);
      break;
    case 'mohawk':
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * 2.6 - 0.45;
        const x = Math.cos(a);
        const y = Math.sin(a);
        b.add(new THREE.ConeGeometry(0.03, 0.14, 4), hair, TRS(0, 0.05 + x * 0.14 * 0.7 + 0.05, -y * 0.1 + 0.03, -y * 0.9, 0, 0));
      }
      b.sphere(0.1, hair, TRS(0, 0.055, 0.02, 0, 0, 0, 0.42, 1.08, 1.02), {}, 10, 8);
      break;
    case 'pigtails':
      cap();
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.1, 0.06, 0.02), V(s * 0.2, 0.08, 0.02), V(s * 0.27, 0.0, 0.02)], 0.03, hair, {}, 10, 6);
        b.sphere(0.024, 0xe8408c, TRS(s * 0.12, 0.066, 0.02), {}, 8, 6);
      }
      break;
    case 'spikes':
      cap();
      for (let i = 0; i < 16; i++) {
        const a = i * 2.399;
        const u = 0.3 + ((i * 0.618) % 1) * 0.65;
        const r = Math.sqrt(1 - u * u);
        const dx = Math.cos(a) * r;
        const dz = Math.sin(a) * r;
        const m = new THREE.Matrix4().compose(V(dx * 0.11, 0.06 + u * 0.13, dz * 0.1 + 0.015), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(dx, u, dz)), V(1, 1, 1));
        b.add(new THREE.ConeGeometry(0.026, 0.13, 5), hair, m);
      }
      break;
    default:
  }
}

// ---- Hats ---------------------------------------------------------------------------------------

function hat(b: Builder, spin: Builder, L: CharacterLook) {
  const col = choiceOf('hatColor', L.hatColor).color!;
  const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().multiplyMatrices(TRS(0, 0.012, 0, 0.05, 0, 0.035), TRS(x, y, z, rx, ry, rz, sx, sy, sz));
  const band = (r: number, y0: number, y1: number, c: number) => b.lathe([[r, y0], [r - 0.001, y1]], c, T(), {}, 18);
  const lathe = (pts: [number, number][], c: number, seg = 18, m = T()) => b.lathe(pts, c, m, { jit: 0.05 }, seg);
  switch (L.hat) {
    case 'straw':
      lathe([[0.0, 0.135], [0.1, 0.13], [0.17, 0.118], [0.255, 0.092], [0.31, 0.058], [0.312, 0.05], [0.25, 0.08], [0.1, 0.112], [0.0, 0.115]], col, 24);
      lathe([[0.105, 0.125], [0.104, 0.19], [0.09, 0.235], [0.05, 0.253], [0.0, 0.256]], col);
      band(0.107, 0.129, 0.165, 0x2f6b70);
      break;
    case 'bucket':
      lathe([[0.2, 0.05], [0.115, 0.12], [0.108, 0.2], [0.08, 0.232], [0.0, 0.24]], col, 18);
      lathe([[0.0, 0.1], [0.11, 0.11], [0.195, 0.046]], col, 18);
      break;
    case 'cap':
      b.sphere(0.125, col, T(0, 0.135, 0.01, 0, 0, 0, 1.05, 0.42, 1.14), { jit: 0.06 }, 14, 8);
      b.box(0.16, 0.012, 0.095, mixHex(col, 0x000000, 0.2), T(0, 0.115, -0.125, -0.22, 0, 0), {}, 0.005);
      break;
    case 'beanie':
      b.sphere(0.116, col, T(0, 0.098, 0.004, 0, 0, 0, 1.03, 1.06, 1.03), { jit: 0.05 }, 14, 10);
      b.cyl(0.122, 0.122, 0.048, mixHex(col, 0x000000, 0.14), T(0, 0.098, 0.004), {}, 16);
      break;
    case 'souwester':
      b.sphere(0.118, col, T(0, 0.1, 0.006, 0, 0, 0, 1.03, 1, 1.03), {}, 14, 10);
      lathe([[0.0, 0.12], [0.11, 0.115], [0.2, 0.07]], col, 18, T(0, 0, 0.05, 0.12, 0, 0, 1, 1, 1.45));
      break;
    case 'captain':
      lathe([[0.112, 0.12], [0.108, 0.155], [0.142, 0.205], [0.14, 0.224], [0.0, 0.232]], WHITE, 18);
      b.lathe([[0.114, 0.118], [0.112, 0.156]], 0x1c1c24, T(), {}, 18);
      b.box(0.15, 0.012, 0.075, 0x14141c, T(0, 0.118, -0.125, -0.32, 0, 0), {}, 0.005);
      b.box(0.1, 0.008, 0.006, GOLD, T(0, 0.14, -0.115), {}, 0.002);
      b.sphere(0.02, GOLD, T(0, 0.178, -0.126, 0, 0, 0, 1, 1, 0.4), {}, 8, 6);
      break;
    case 'cowboy':
      lathe([[0.108, 0.12], [0.106, 0.22], [0.085, 0.27], [0.03, 0.262], [0.0, 0.255]], col, 16);
      lathe([[0.0, 0.14], [0.11, 0.125], [0.3, 0.12], [0.3, 0.114], [0.11, 0.113], [0.0, 0.122]], col, 22, T(0, 0, 0, 0, 0, 0, 0.8, 1, 1.06));
      for (const s of [-1, 1]) b.sphere(0.09, col, T(s * 0.215, 0.145, 0, 0, 0, s * 0.42, 0.42, 0.2, 2.2), {}, 10, 6);
      band(0.109, 0.12, 0.15, 0x3a2418);
      break;
    case 'top':
      b.cyl(0.118, 0.105, 0.26, col, T(0, 0.26, 0), { jit: 0.04 }, 18);
      lathe([[0.0, 0.134], [0.104, 0.13], [0.19, 0.122], [0.19, 0.116], [0.104, 0.12], [0.0, 0.124]], col, 20);
      band(0.1085, 0.135, 0.17, 0xb8392e);
      break;
    case 'plunger':
      b.sphere(0.115, 0x8c2a20, T(0, 0.13, 0, 0, 0, 0, 1, 0.62, 1), {}, 14, 8);
      b.cyl(0.015, 0.018, 0.46, 0xb08a58, T(0.02, 0.4, 0, 0, 0, -0.05), { jit: 0.05 }, 8);
      break;
    case 'lampshade':
      b.cyl(0.085, 0.2, 0.25, 0xe8d8a8, T(0, 0.2, 0), { jit: 0.03 }, 18);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        b.cyl(0.004, 0.004, 0.05, 0xc0392b, T(Math.cos(a) * 0.205, 0.06, Math.sin(a) * 0.205), {}, 4);
      }
      break;
    case 'colander':
      b.sphere(0.128, 0xb8bcc0, T(0, 0.08, 0, 0, 0, 0, 1, 0.85, 1), {}, 16, 10);
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4;
        const r = 0.02 + (i / 26) * 0.1;
        b.sphere(0.008, 0x26282c, T(Math.cos(a) * r, 0.08 + Math.sqrt(Math.max(0.0001, 0.0164 - r * r)) * 0.85, Math.sin(a) * r), {}, 5, 4);
      }
      for (const s of [-1, 1]) b.box(0.06, 0.012, 0.03, 0xb8bcc0, T(s * 0.14, 0.09, 0), {}, 0.004);
      break;
    case 'cone':
      b.add(new THREE.ConeGeometry(0.125, 0.4, 14), 0xe8701c, T(0, 0.32, 0));
      b.cyl(0.078, 0.092, 0.075, WHITE, T(0, 0.3, 0), {}, 14);
      b.box(0.33, 0.024, 0.33, 0xc85a14, T(0, 0.125, 0), {}, 0.008);
      break;
    case 'viking':
      b.sphere(0.122, 0x8a8a90, T(0, 0.085, 0.002, 0, 0, 0, 1.03, 1.02, 1.03), {}, 14, 10);
      b.cyl(0.126, 0.126, 0.026, GOLD, T(0, 0.098, 0.002), {}, 16);
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.11, 0.13, 0), V(s * 0.2, 0.17, 0), V(s * 0.23, 0.3, 0)].map((v) => v.applyMatrix4(T())), 0.026, 0xe6dcc2, {}, 10, 7);
        b.add(new THREE.ConeGeometry(0.024, 0.07, 8), 0xe6dcc2, T(s * 0.232, 0.32, 0));
      }
      break;
    case 'chef':
      b.cyl(0.114, 0.114, 0.09, WHITE, T(0, 0.15, 0), {}, 16);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.sphere(0.085, WHITE, T(Math.cos(a) * 0.09, 0.27, Math.sin(a) * 0.09), {}, 10, 8);
      }
      b.sphere(0.1, WHITE, T(0, 0.29, 0), {}, 10, 8);
      break;
    case 'party':
      b.add(new THREE.ConeGeometry(0.105, 0.3, 14), 0xe8408c, T(0, 0.28, 0));
      for (let i = 0; i < 3; i++) {
        const y = 0.17 + i * 0.075;
        b.add(new THREE.TorusGeometry(0.103 * (1 - (y - 0.13) / 0.3), 0.007, 5, 14), i % 2 ? 0x40c8e8 : 0xf0d030, T(0, y, 0, Math.PI / 2, 0, 0));
      }
      b.sphere(0.03, 0xf0d030, T(0, 0.435, 0), {}, 8, 6);
      break;
    case 'propeller':
      b.sphere(0.116, col, T(0, 0.098, 0.004, 0, 0, 0, 1.03, 1.06, 1.03), {}, 14, 10);
      b.cyl(0.122, 0.122, 0.048, 0xe02a2a, T(0, 0.098, 0.004), {}, 16);
      b.cyl(0.006, 0.006, 0.07, 0x2a2a30, T(0, 0.255, 0.004), {}, 6);
      spin.box(0.34, 0.006, 0.05, 0xf0d030, TRS(0.0, 0, 0, 0.18, 0, 0), {}, 0.002);
      spin.box(0.05, 0.006, 0.34, 0x2a8ae0, TRS(0.0, 0.002, 0, 0, 0, 0.18), {}, 0.002);
      break;
    case 'fish':
      b.sphere(0.13, 0x8aa6a8, T(0, 0.17, 0, 0, 0, 0, 0.6, 0.52, 1.75), { jit: 0.05 }, 14, 10);
      b.sphere(0.13, 0xdde4dc, T(0, 0.135, 0, 0, 0, 0, 0.5, 0.26, 1.65), {}, 12, 8);
      b.add(new THREE.ConeGeometry(0.1, 0.16, 4), 0x6a8a90, T(0, 0.17, 0.27, Math.PI / 2, 0, 0, 0.3, 1, 1));
      b.box(0.012, 0.09, 0.15, 0x6a8a90, T(0, 0.255, 0.02), {}, 0.004);
      for (const s of [-1, 1]) {
        b.sphere(0.022, WHITE, T(s * 0.062, 0.19, -0.145), {}, 8, 6);
        b.sphere(0.011, 0x120e10, T(s * 0.076, 0.19, -0.15), {}, 6, 5);
      }
      break;
    case 'crown':
      b.cyl(0.116, 0.112, 0.06, GOLD, T(0, 0.15, 0), {}, 18);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(new THREE.ConeGeometry(0.03, 0.09, 4), GOLD, T(Math.cos(a) * 0.106, 0.22, Math.sin(a) * 0.106));
        b.sphere(0.013, i % 2 ? 0xc01c30 : 0x2a58c0, T(Math.cos(a) * 0.117, 0.152, Math.sin(a) * 0.117), {}, 6, 5);
      }
      break;
    case 'wizard':
      b.add(new THREE.ConeGeometry(0.128, 0.5, 14), col, T(0.02, 0.37, 0.01, 0.1, 0, -0.14));
      lathe([[0.0, 0.135], [0.12, 0.13], [0.27, 0.095], [0.272, 0.088], [0.12, 0.118], [0.0, 0.124]], col, 22);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.2;
        const y = 0.17 + i * 0.045;
        const r = 0.12 * (1 - (y - 0.12) / 0.5) + 0.005;
        b.sphere(0.012, GOLD, T(Math.cos(a) * r + 0.02, y, Math.sin(a) * r + 0.01), {}, 5, 4);
      }
      break;
    case 'sombrero':
      lathe([[0.112, 0.125], [0.1, 0.25], [0.07, 0.3], [0.0, 0.308]], col, 18);
      lathe([[0.0, 0.14], [0.14, 0.12], [0.34, 0.09], [0.46, 0.14], [0.462, 0.13], [0.34, 0.078], [0.14, 0.108], [0.0, 0.126]], col, 26);
      b.add(new THREE.TorusGeometry(0.455, 0.012, 5, 28), 0xb8392e, T(0, 0.138, 0, Math.PI / 2, 0, 0));
      band(0.112, 0.13, 0.17, 0xb8392e);
      break;
    default:
  }
}

// ---- Body ---------------------------------------------------------------------------------------

function buttons(b: Builder, col: number, n = 4) {
  for (let i = 0; i < n; i++) b.sphere(0.012, col, TRS(0, 0.02 + i * 0.1, -0.148 - i * 0.002), {}, 6, 5);
}

const CHEST: [number, number][] = [[0.15, -0.05], [0.165, 0.1], [0.185, 0.26], [0.17, 0.38], [0.1, 0.46], [0.05, 0.48]];
const FLAT = (x = 0, y = 0, z = 0) => TRS(x, y, z, 0, 0, 0, 1, 1, 0.8);

function torso(b: Builder, L: CharacterLook, main: number, skin: number) {
  const r = (t: number) => {
    // Chest radius at height t, for rings painted round it.
    for (let i = 0; i < CHEST.length - 1; i++) {
      const [ra, ya] = CHEST[i];
      const [rb, yb] = CHEST[i + 1];
      if (t >= ya && t <= yb) return ra + ((rb - ra) * (t - ya)) / (yb - ya);
    }
    return 0.15;
  };
  switch (L.outfit) {
    case 'jumper':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      for (let i = 0; i < 6; i++) {
        const y = 0.0 + i * 0.07;
        b.lathe([[r(y) + 0.003, y], [r(y + 0.03) + 0.003, y + 0.03]], WHITE, FLAT(), {}, 18);
      }
      break;
    case 'dungarees':
      b.lathe(CHEST, WHITE, FLAT(), {}, 18);
      b.lathe([[r(-0.05) + 0.004, -0.05], [r(0.12) + 0.004, 0.12]], main, FLAT(), {}, 18);
      b.box(0.17, 0.2, 0.012, main, TRS(0, 0.2, -0.14), {}, 0.004);
      for (const s of [-1, 1]) {
        b.tube([V(s * 0.07, 0.3, -0.14), V(s * 0.1, 0.44, -0.07), V(s * 0.09, 0.44, 0.09), V(s * 0.07, 0.15, 0.14)], 0.018, main, {}, 10, 4);
        b.sphere(0.012, GOLD, TRS(s * 0.07, 0.29, -0.15), {}, 6, 5);
      }
      break;
    case 'hoodie':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      b.sphere(0.13, main, TRS(0, 0.42, 0.09, 0, 0, 0, 1, 0.7, 0.75), {}, 12, 8);
      b.box(0.17, 0.09, 0.02, mixHex(main, 0x000000, 0.14), TRS(0, 0.05, -0.135), {}, 0.008);
      for (const s of [-1, 1]) b.tube([V(s * 0.03, 0.43, -0.09), V(s * 0.03, 0.28, -0.14)], 0.005, WHITE, {}, 4, 4);
      break;
    case 'hawaiian':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      for (let i = 0; i < 34; i++) {
        const a = i * 2.399;
        const y = 0.0 + ((i * 0.618) % 1) * 0.4;
        const rr = r(y) + 0.002;
        b.sphere(0.018 + (i % 3) * 0.006, [0xf0d030, 0xe8408c, 0xf2ecdc, 0x40c8e8][i % 4], TRS(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.8, 0, 0, 0, 1, 1, 0.35), {}, 6, 4);
      }
      break;
    case 'tux':
      b.lathe(CHEST, 0x16161c, FLAT(), {}, 18);
      b.box(0.1, 0.34, 0.012, WHITE, TRS(0, 0.24, -0.138), {}, 0.004);
      for (const s of [-1, 1]) b.box(0.07, 0.28, 0.014, 0x24242c, TRS(s * 0.075, 0.27, -0.13, 0, 0, s * 0.3), {}, 0.004);
      for (let i = 0; i < 3; i++) b.sphere(0.008, 0x16161c, TRS(0, 0.16 + i * 0.07, -0.147), {}, 5, 4);
      break;
    case 'tutu':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      break;
    case 'barrel':
      b.lathe([[0.2, -0.12], [0.25, 0.08], [0.25, 0.22], [0.2, 0.38]], 0x7a5a36, FLAT(), { jit: 0.06 }, 16);
      for (const y of [-0.04, 0.3]) b.cyl(0.235, 0.235, 0.02, 0x3a3a3e, TRS(0, y, 0, 0, 0, 0, 1, 1, 0.8), {}, 16);
      break;
    case 'box':
      b.box(0.46, 0.54, 0.34, 0xb08a58, TRS(0, 0.12, 0), { jit: 0.04 }, 0.008);
      for (const s of [-1, 1]) b.box(0.22, 0.012, 0.16, 0xa07c4c, TRS(s * 0.29, 0.385, 0, 0, 0, s * 0.5), {}, 0.004);
      b.box(0.05, 0.06, 0.012, 0x8a3a2a, TRS(0.1, 0.2, -0.176), {}, 0.002);
      b.box(0.14, 0.012, 0.012, 0x5a4a30, TRS(-0.08, 0.26, -0.176), {}, 0.002);
      break;
    case 'robe':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      for (let i = 0; i < 8; i++) {
        const a = i * 2.2;
        const y = 0.0 + i * 0.05;
        const rr = r(y) + 0.002;
        b.sphere(0.012, GOLD, TRS(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.8), {}, 5, 4);
      }
      break;
    case 'jacket':
      b.lathe(CHEST, main, FLAT(), {}, 18);
      buttons(b, mixHex(main, 0x000000, 0.45));
      b.lathe([[r(0.4) + 0.006, 0.38], [0.075, 0.47]], mixHex(main, 0x000000, 0.2), FLAT(), {}, 16);
      break;
    default:
      b.lathe(CHEST, main, FLAT(), {}, 18);
      buttons(b, 0xe7dcc0);
  }
  void skin;
}

function hips(b: Builder, L: CharacterLook, main: number, trousers: number) {
  const flat = TRS(0, 0, 0, 0, 0, 0, 1, 1, 0.84);
  switch (L.outfit) {
    case 'jacket':
    case 'hoodie':
      b.lathe([[0.17, -0.2], [0.16, -0.02], [0.15, 0.09]], main, flat, { ao: 0.2 }, 18);
      b.lathe([[0.15, -0.12], [0.15, 0.05]], trousers, flat, {}, 16);
      break;
    case 'jumper':
    case 'hawaiian':
      b.lathe([[0.16, -0.1], [0.155, 0.0], [0.15, 0.09]], main, flat, {}, 18);
      break;
    case 'dungarees':
      b.lathe([[0.15, -0.12], [0.155, 0.0], [0.15, 0.09]], main, flat, {}, 18);
      break;
    case 'tux':
      b.lathe([[0.16, -0.12], [0.155, 0.0], [0.15, 0.09]], 0x16161c, flat, {}, 18);
      // Tails.
      for (const s of [-1, 1]) b.box(0.13, 0.5, 0.016, 0x16161c, TRS(s * 0.07, -0.26, 0.135, 0.12, 0, s * 0.06), {}, 0.006);
      break;
    case 'robe':
      b.lathe([[0.3, -0.93], [0.34, -0.945], [0.25, -0.5], [0.165, -0.1], [0.15, 0.09]], main, flat, { ao: 0.2 }, 22);
      break;
    case 'barrel':
      b.lathe([[0.16, -0.46], [0.2, -0.3], [0.2, -0.12], [0.16, 0.09]], 0x7a5a36, flat, { jit: 0.06 }, 16);
      b.cyl(0.21, 0.21, 0.02, 0x3a3a3e, TRS(0, -0.36, 0, 0, 0, 0, 1, 1, 0.8), {}, 16);
      break;
    case 'box':
      b.box(0.46, 0.42, 0.34, 0xb08a58, TRS(0, -0.15, 0), { jit: 0.04 }, 0.008);
      break;
    case 'tutu':
      b.lathe([[0.16, -0.1], [0.155, 0.0], [0.15, 0.09]], main, flat, {}, 18);
      for (let i = 0; i < 3; i++) {
        const y = -0.09 - i * 0.024;
        b.lathe([[0.15, y + 0.02], [0.34 - i * 0.03, y], [0.15, y - 0.02]], i === 1 ? mixHex(main, 0xffffff, 0.45) : main, TRS(0, 0, 0, 0, 0, 0, 1, 1, 0.9), {}, 22);
      }
      break;
    default:
      b.lathe([[0.2, -0.57], [0.235, -0.585], [0.185, -0.25], [0.155, -0.02], [0.15, 0.09]], main, flat, { ao: 0.3 }, 20);
  }
}

function neckwear(b: Builder, a: Builder, z: Builder, L: CharacterLook) {
  const col = choiceOf('neckColor', L.neckColor).color!;
  switch (L.neck) {
    case 'scarf':
      b.add(new THREE.TorusGeometry(0.075, 0.042, 8, 16), col, TRS(0, 0.47, 0, Math.PI / 2 + 0.1, 0, 0, 1, 1, 0.8), { jit: 0.05 });
      a.box(0.11, 0.22, 0.024, col, TRS(0, -0.1, 0), { jit: 0.06 }, 0.008);
      z.box(0.1, 0.2, 0.02, col, TRS(0, -0.09, 0), {}, 0.007);
      z.box(0.1, 0.022, 0.02, 0xe7dcc0, TRS(0, -0.175, 0), {}, 0.004);
      break;
    case 'bandana':
      b.add(new THREE.TorusGeometry(0.07, 0.022, 6, 14), col, TRS(0, 0.47, 0, Math.PI / 2 + 0.1, 0, 0, 1, 1, 0.8));
      b.add(new THREE.ConeGeometry(0.075, 0.13, 3), col, TRS(0, 0.39, -0.1, 0.2 + Math.PI, 0, 0, 1, 1, 0.22));
      break;
    case 'bowtie':
      for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.04, 0.075, 4), col, TRS(s * 0.038, 0.44, -0.096, 0, 0, s * (Math.PI / 2), 1, 1, 0.42));
      b.sphere(0.015, col, TRS(0, 0.44, -0.1), {}, 6, 5);
      break;
    case 'tie':
      b.box(0.05, 0.032, 0.016, col, TRS(0, 0.44, -0.095), {}, 0.005);
      b.box(0.058, 0.3, 0.008, col, TRS(0, 0.27, -0.14, -0.06, 0, 0), {}, 0.003);
      break;
    case 'toiletseat':
      b.add(new THREE.TorusGeometry(0.17, 0.032, 8, 22), 0xf2efe6, TRS(0, 0.385, -0.03, Math.PI / 2 + 0.28, 0, 0, 0.92, 1.12, 1), { jit: 0.02 });
      b.box(0.3, 0.32, 0.024, 0xf2efe6, TRS(0, 0.52, 0.16, -0.5, 0, 0), {}, 0.012);
      break;
    case 'medal':
      for (const s of [-1, 1]) b.box(0.03, 0.24, 0.006, 0x2f62b8, TRS(s * 0.05, 0.3, -0.14, -0.12, 0, s * 0.28), {}, 0.002);
      b.cyl(0.05, 0.05, 0.012, 0xc08a40, TRS(0, 0.17, -0.165, Math.PI / 2, 0, 0), {}, 16);
      break;
    case 'lei':
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        b.sphere(0.026, [0xe8408c, 0xf0d030, 0xf2ecdc, 0xe0702a][i % 4], TRS(Math.cos(t) * 0.11, 0.41 + Math.sin(t) * 0.02, Math.sin(t) * 0.1 - 0.03), {}, 6, 5);
      }
      break;
    case 'boa':
      for (let i = 0; i < 26; i++) {
        const t = (i / 26) * Math.PI * 2;
        b.sphere(0.04, col, TRS(Math.cos(t) * 0.1, 0.44 + Math.sin(t * 3) * 0.012, Math.sin(t) * 0.085), { jit: 0.2 }, 6, 5);
      }
      for (let i = 0; i < 12; i++) b.sphere(0.036, col, TRS(0.09 + Math.sin(i) * 0.012, 0.4 - i * 0.04, -0.13), { jit: 0.2 }, 6, 5);
      break;
    case 'bigbow':
      for (const s of [-1, 1]) b.sphere(0.095, col, TRS(s * 0.11, 0.42, -0.14, 0, 0, s * 0.3, 1.1, 0.72, 0.28), {}, 10, 8);
      b.sphere(0.034, mixHex(col, 0x000000, 0.2), TRS(0, 0.42, -0.15), {}, 8, 6);
      break;
    default:
  }
}

function backItem(b: Builder, cape: Builder, L: CharacterLook, skin: number) {
  switch (L.back) {
    case 'creel':
      b.lathe([[0.0, 0.0], [0.11, 0.015], [0.135, 0.08], [0.125, 0.2], [0.1, 0.24], [0.0, 0.25]], 0xb79a5e, TRS(0.03, 0.07, 0.205, 0.06, 0, 0, 1.06, 1, 0.68), { jit: 0.08 }, 14);
      b.lathe([[0.125, 0.0], [0.13, 0.02]], 0x7b5a3f, TRS(0.03, 0.1, 0.205, 0.06, 0, 0, 1.06, 1, 0.68), {}, 14);
      b.tube([V(-0.17, 0.36, 0.05), V(-0.03, 0.2, -0.155), V(0.14, -0.0, -0.11)], 0.012, 0x6b4a33, {}, 8, 5);
      break;
    case 'rucksack':
      b.box(0.26, 0.34, 0.13, 0x4a6a4a, TRS(0, 0.2, 0.19), { jit: 0.05 }, 0.04);
      b.box(0.2, 0.13, 0.05, 0x3c583c, TRS(0, 0.12, 0.26), {}, 0.02);
      for (const s of [-1, 1]) b.tube([V(s * 0.1, 0.37, 0.12), V(s * 0.14, 0.4, -0.04), V(s * 0.14, 0.18, -0.14), V(s * 0.12, 0.1, 0.06)], 0.012, 0x2c3a2c, {}, 10, 4);
      break;
    case 'cape':
      cape.add(new THREE.PlaneGeometry(0.5, 1.08, 6, 10), 0xb8202c, TRS(0, -0.54, 0));
      cape.add(new THREE.PlaneGeometry(0.5, 1.08, 6, 10), 0xe8c030, TRS(0, -0.54, -0.002, 0, Math.PI, 0));
      break;
    case 'parrot': {
      const px = 0.2;
      const py = 0.47;
      b.sphere(0.055, 0xd02a2a, TRS(px, py, 0.01, -0.3, 0, 0, 0.85, 1.25, 0.95), {}, 10, 8);
      b.sphere(0.038, 0xd02a2a, TRS(px, py + 0.08, -0.02), {}, 10, 8);
      b.add(new THREE.ConeGeometry(0.017, 0.04, 6), 0xe8c030, TRS(px, py + 0.076, -0.06, -Math.PI / 2 - 0.5, 0, 0));
      for (const s of [-1, 1]) b.sphere(0.008, 0x120e10, TRS(px + s * 0.028, py + 0.09, -0.04), {}, 5, 4);
      b.sphere(0.04, 0x2a6ae0, TRS(px + 0.05, py - 0.005, 0.03, 0.3, 0, 0, 0.3, 1.2, 0.9), {}, 8, 6);
      b.box(0.04, 0.16, 0.012, 0x2a8ae0, TRS(px, py - 0.1, 0.08, -0.4, 0, 0), {}, 0.004);
      break;
    }
    case 'cat': {
      const px = -0.2;
      const py = 0.45;
      const fur = 0xd9862c;
      b.sphere(0.075, fur, TRS(px - 0.01, py, 0.03, 0, 0, 0, 0.85, 0.8, 1.45), {}, 10, 8);
      b.sphere(0.058, fur, TRS(px - 0.015, py + 0.06, -0.09), {}, 10, 8);
      for (const s of [-1, 1]) {
        b.add(new THREE.ConeGeometry(0.02, 0.042, 4), fur, TRS(px - 0.015 + s * 0.032, py + 0.115, -0.09));
        b.sphere(0.007, 0x120e10, TRS(px - 0.015 + s * 0.022, py + 0.07, -0.142), {}, 5, 4);
      }
      b.tube([V(px, py, 0.13), V(px - 0.08, py - 0.12, 0.14), V(px - 0.04, py - 0.25, 0.12)], 0.016, fur, {}, 8, 5);
      break;
    }
    case 'duck':
      b.add(new THREE.TorusGeometry(0.235, 0.075, 10, 22), 0xf0d030, TRS(0, 0.0, 0, Math.PI / 2, 0, 0, 1, 0.86, 1));
      b.sphere(0.068, 0xf0d030, TRS(0, 0.1, -0.25), {}, 10, 8);
      b.add(new THREE.ConeGeometry(0.024, 0.06, 6), 0xe0702a, TRS(0, 0.095, -0.325, -Math.PI / 2, 0, 0, 1, 1, 0.6));
      for (const s of [-1, 1]) b.sphere(0.012, 0x120e10, TRS(s * 0.038, 0.125, -0.3), {}, 5, 4);
      break;
    case 'fridge':
      b.box(0.46, 0.76, 0.34, 0xe8e8e4, TRS(0, 0.1, 0.33), { jit: 0.02 }, 0.03);
      b.box(0.462, 0.008, 0.342, 0x9a9a98, TRS(0, 0.26, 0.33), {}, 0.002);
      b.box(0.02, 0.2, 0.025, 0x9a9a98, TRS(-0.17, 0.08, 0.505), {}, 0.006);
      b.box(0.08, 0.08, 0.008, 0xd84a3a, TRS(0.1, 0.38, 0.502), {}, 0.002);
      break;
    case 'ladder':
      for (const s of [-1, 1]) b.box(0.03, 1.7, 0.03, 0xa98a68, TRS(s * 0.15, 0.32, 0.22, 0.05, 0, 0), { jit: 0.06 }, 0.006);
      for (let i = 0; i < 6; i++) b.box(0.3, 0.022, 0.022, 0xa98a68, TRS(0, -0.32 + i * 0.26, 0.22 + i * 0.012), {}, 0.005);
      break;
    case 'wings':
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.2, 0.3, 0.45, 0.32, 0.55, 0.16);
        shape.bezierCurveTo(0.46, 0.08, 0.42, -0.05, 0.34, -0.1);
        shape.bezierCurveTo(0.26, -0.26, 0.14, -0.28, 0, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
        b.add(g, 0xf4f0e6, TRS(s * 0.05, 0.3, 0.13, 0, s > 0 ? -0.35 : Math.PI + 0.35, 0));
      }
      break;
    default:
  }
  void skin;
}

function shoe(b: Builder, L: CharacterLook, skin: number, trousers: number) {
  const col = choiceOf('shoeColor', L.shoeColor).color!;
  const sole = 0x2a2024;
  switch (L.shoes) {
    case 'work':
      b.cyl(0.058, 0.06, 0.14, col, TRS(0, -0.36, 0), {}, 10);
      b.box(0.115, 0.08, 0.235, col, TRS(0, -0.425, -0.045), {}, 0.03);
      b.box(0.125, 0.022, 0.25, sole, TRS(0, -0.47, -0.045), {}, 0.006);
      for (let i = 0; i < 3; i++) b.box(0.07, 0.006, 0.01, WHITE, TRS(0, -0.385 + i * 0.012, -0.075 - i * 0.022, -0.5, 0, 0), {}, 0.002);
      break;
    case 'sneakers':
      b.cyl(0.052, 0.055, 0.1, trousers, TRS(0, -0.36, 0), {}, 9);
      b.box(0.108, 0.07, 0.235, col, TRS(0, -0.43, -0.045), {}, 0.03);
      b.box(0.116, 0.022, 0.248, WHITE, TRS(0, -0.47, -0.045), {}, 0.009);
      break;
    case 'sandals':
      b.cyl(0.05, 0.05, 0.1, skin, TRS(0, -0.37, 0), {}, 9);
      b.box(0.1, 0.05, 0.22, skin, TRS(0, -0.435, -0.045), {}, 0.022);
      b.box(0.115, 0.018, 0.245, col, TRS(0, -0.47, -0.045), {}, 0.006);
      b.box(0.115, 0.012, 0.03, col, TRS(0, -0.415, -0.08), {}, 0.004);
      break;
    case 'bare':
      b.cyl(0.05, 0.05, 0.1, skin, TRS(0, -0.37, 0), {}, 9);
      b.box(0.1, 0.05, 0.22, skin, TRS(0, -0.445, -0.045), {}, 0.022);
      for (let i = 0; i < 5; i++) b.sphere(0.012 - i * 0.001, skin, TRS(-0.036 + i * 0.018, -0.46, -0.158), {}, 5, 4);
      break;
    case 'clown':
      b.cyl(0.052, 0.055, 0.1, trousers, TRS(0, -0.36, 0), {}, 9);
      b.sphere(0.12, col, TRS(0, -0.42, -0.13, 0, 0, 0, 0.85, 0.5, 1.7), {}, 12, 8);
      b.box(0.16, 0.02, 0.36, WHITE, TRS(0, -0.468, -0.12), {}, 0.01);
      break;
    case 'fishfeet':
      b.cyl(0.05, 0.05, 0.1, trousers, TRS(0, -0.37, 0), {}, 9);
      b.sphere(0.09, 0x8fa4ac, TRS(0, -0.435, -0.05, 0, 0, 0, 0.62, 0.55, 2.1), { jit: 0.05 }, 12, 8);
      b.add(new THREE.ConeGeometry(0.08, 0.14, 4), 0x6a8088, TRS(0, -0.435, 0.2, -Math.PI / 2, 0, 0, 1, 1, 0.35));
      b.sphere(0.018, 0x15110f, TRS(0.04, -0.42, -0.2), {}, 6, 4);
      b.sphere(0.018, 0x15110f, TRS(-0.04, -0.42, -0.2), {}, 6, 4);
      break;
    case 'skis':
      b.cyl(0.05, 0.055, 0.1, col, TRS(0, -0.37, 0), {}, 9);
      b.box(0.1, 0.05, 0.16, col, TRS(0, -0.43, -0.02), {}, 0.02);
      b.box(0.08, 0.018, 1.25, 0xc23a2c, TRS(0, -0.465, -0.08), {}, 0.006);
      b.box(0.08, 0.018, 0.14, 0xc23a2c, TRS(0, -0.44, -0.74, 0.5, 0, 0), {}, 0.006);
      break;
    case 'flippers':
      b.cyl(0.05, 0.05, 0.1, skin, TRS(0, -0.37, 0), {}, 9);
      b.box(0.11, 0.05, 0.2, col, TRS(0, -0.445, -0.04), {}, 0.02);
      b.add(new THREE.ConeGeometry(0.2, 0.45, 3), col, TRS(0, -0.465, -0.3, Math.PI / 2, 0, Math.PI, 1, 1, 0.04));
      break;
    case 'bunny':
      b.cyl(0.05, 0.055, 0.08, trousers, TRS(0, -0.37, 0), {}, 9);
      b.sphere(0.088, 0xf2ecdc, TRS(0, -0.425, -0.05, 0, 0, 0, 0.8, 0.55, 1.4), {}, 12, 8);
      b.sphere(0.052, 0xf2ecdc, TRS(0, -0.4, -0.16), {}, 10, 8);
      for (const s of [-1, 1]) {
        b.sphere(0.022, 0xf2ecdc, TRS(s * 0.026, -0.3, -0.13, 0, 0, s * 0.2, 0.6, 2.4, 0.4), {}, 8, 6);
        b.sphere(0.009, 0x120e10, TRS(s * 0.022, -0.39, -0.208), {}, 5, 4);
      }
      b.sphere(0.012, 0xe88aa0, TRS(0, -0.408, -0.215), {}, 5, 4);
      break;
    default:
      b.cyl(0.066, 0.058, 0.25, col, TRS(0, -0.3, 0), {}, 10);
      b.box(0.115, 0.075, 0.25, col, TRS(0, -0.425, -0.05), {}, 0.03);
      b.box(0.125, 0.018, 0.265, sole, TRS(0, -0.468, -0.05), {}, 0.006);
      b.cyl(0.07, 0.07, 0.022, 0xe7dcc0, TRS(0, -0.176, 0), {}, 10);
  }
}

export function buildBody(L: CharacterLook): BodyParts {
  const skin = choiceOf('skin', L.skin).color!;
  const hair = choiceOf('hairColor', L.hairColor).color!;
  const main = choiceOf('coatColor', L.coatColor).color!;
  const trouserChoice = choiceOf('trouserColor', L.trouserColor).color!;
  const trousers = L.outfit === 'dungarees' ? main : L.outfit === 'tux' ? 0x16161c : trouserChoice;
  const sleeve = L.outfit === 'tux' ? 0x16161c : main;
  const shortSleeve = L.outfit === 'hawaiian';
  const dark = mixHex(sleeve, 0x000000, 0.22);

  const hipsB = new Builder(2);
  hips(hipsB, L, main, trousers);

  const torsoB = new Builder(3);
  const capeB = new Builder(33);
  torso(torsoB, L, main, skin);
  backItem(torsoB, capeB, L, skin);

  const neckB = new Builder(4);
  const scarfAB = new Builder(5);
  const scarfBB = new Builder(6);
  neckwear(neckB, scarfAB, scarfBB, L);

  const headB = new Builder(7);
  const spinB = new Builder(77);
  headB.sphere(0.108, skin, TRS(0, 0.05, 0, 0, 0, 0, 1, 1.08, 0.98), {}, 16, 12);
  headB.cyl(0.05, 0.056, 0.09, skin, TRS(0, -0.05, 0), {}, 10);
  markings(headB, L, skin);
  ears(headB, L, skin);
  eyes(headB, L, skin);
  brows(headB, L, hair);
  nose(headB, L, skin);
  mouth(headB, L);
  facialHair(headB, L, hair, skin);
  inMouth(headB, L);
  hairDo(headB, L, hair);
  eyewear(headB, L);
  hat(headB, spinB, L);

  const upper: BG[] = [];
  const fore: BG[] = [];
  const thigh: BG[] = [];
  const shin: BG[] = [];
  const UP = 0.29;
  const FO = 0.27;
  for (let i = 0; i < 2; i++) {
    const u = new Builder(8 + i);
    u.sphere(0.066, sleeve, TRS(0, 0, 0), {}, 10, 8);
    u.cyl(0.058, 0.05, UP, shortSleeve ? skin : sleeve, TRS(0, -UP / 2, 0), { jit: 0.03 }, 10);
    if (shortSleeve) u.cyl(0.062, 0.058, UP * 0.42, sleeve, TRS(0, -UP * 0.2, 0), {}, 10);
    upper.push(u.build());
    const f = new Builder(12 + i);
    f.sphere(0.05, shortSleeve ? skin : sleeve, TRS(0, 0, 0), {}, 9, 7);
    f.cyl(0.05, 0.043, FO, shortSleeve ? skin : sleeve, TRS(0, -FO / 2, 0), {}, 10);
    if (!shortSleeve) f.cyl(0.048, 0.048, 0.03, dark, TRS(0, -FO + 0.02, 0), {}, 10);
    f.sphere(0.042, skin, TRS(0, -FO - 0.03, 0, 0, 0, 0, 0.9, 1.15, 0.9), {}, 8, 6);
    fore.push(f.build());
    const legSkin = L.outfit === 'tutu' ? mixHex(main, 0xffffff, 0.55) : trousers;
    const t = new Builder(15 + i);
    t.cyl(0.082, 0.062, 0.45, legSkin, TRS(0, -0.225, 0), { ao: 0.15 }, 10);
    thigh.push(t.build());
    const s = new Builder(18 + i);
    s.sphere(0.062, legSkin, TRS(0, 0, 0), {}, 8, 6);
    s.cyl(0.06, 0.05, 0.22, legSkin, TRS(0, -0.1, 0), {}, 9);
    shoe(s, L, skin, legSkin);
    shin.push(s.build());
  }

  return {
    hips: finish(hipsB),
    torso: finish(torsoB),
    head: finish(headB),
    spin: finish(spinB),
    neck: finish(neckB),
    scarfA: finish(scarfAB),
    scarfB: finish(scarfBB),
    cape: finish(capeB),
    upper: [upper[0], upper[1]],
    fore: [fore[0], fore[1]],
    thigh: [thigh[0], thigh[1]],
    shin: [shin[0], shin[1]],
  };
}
