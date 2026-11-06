// Fish as paintings (for the journal) and as small models (for the moment you lift one from the water).
import * as THREE from 'three';
import { Builder, solid, TRS } from '../world/builder';
import { paintedMaterial } from '../render/shared';
import { mulberry32 } from '../core/noise';
import type { Species } from './fishdata';

const css = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

/** Paints one species to a canvas. `silhouette` draws an unmet fish as a pale pencil shape. */
export function paintFish(sp: Species, w: number, h: number, silhouette = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(strHash(sp.id));
  const cx = w * 0.47;
  const cy = h * 0.52;
  const L = w * 0.72;
  const isEel = sp.pattern === 'eel';
  const isRay = sp.pattern === 'ray';
  const H = isEel ? L * 0.13 : isRay ? L * 0.62 : L * sp.depth;

  // Outline as a closed path, nose to the right.
  const body = () => {
    g.beginPath();
    const nose = cx + L / 2;
    const tail = cx - L / 2 + L * 0.12;
    if (isRay) {
      g.moveTo(nose, cy);
      g.bezierCurveTo(nose - L * 0.25, cy - H * 0.7, cx - L * 0.2, cy - H * 0.65, cx - L * 0.28, cy);
      g.bezierCurveTo(cx - L * 0.2, cy + H * 0.65, nose - L * 0.25, cy + H * 0.7, nose, cy);
      return;
    }
    if (isEel) {
      g.moveTo(nose, cy);
      let px = nose;
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = nose - t * L;
        const y = cy + Math.sin(t * 6.5) * H * 0.9 - H * 0.45 * (1 - t);
        g.quadraticCurveTo((px + x) / 2, y - H * 0.25, x, y);
        px = x;
      }
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const x = nose - t * L;
        const y = cy + Math.sin(t * 6.5) * H * 0.9 + H * 0.45 * (1 - t);
        g.quadraticCurveTo((px + x) / 2, y + H * 0.25, x, y);
        px = x;
      }
      return;
    }
    g.moveTo(nose, cy + H * 0.04);
    g.bezierCurveTo(nose - L * 0.12, cy - H * 0.52, cx + L * 0.02, cy - H * 0.6, tail, cy - H * 0.06);
    g.lineTo(tail, cy + H * 0.06);
    g.bezierCurveTo(cx + L * 0.02, cy + H * 0.56, nose - L * 0.14, cy + H * 0.46, nose, cy + H * 0.04);
  };

  const strokeFin = (pts: [number, number][], col: string, rays = 10) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fill();
    if (silhouette) return;
    g.strokeStyle = 'rgba(40,24,20,0.28)';
    g.lineWidth = Math.max(1, w * 0.0035);
    const a = pts[0];
    const b = pts[pts.length - 1];
    const mid = pts.slice(1, -1);
    for (let i = 1; i < rays; i++) {
      const t = i / rays;
      const k = t * (mid.length - 1);
      const k0 = Math.floor(k);
      const k1 = Math.min(mid.length - 1, k0 + 1);
      const f = k - k0;
      const x = mid[k0][0] + (mid[k1][0] - mid[k0][0]) * f;
      const y = mid[k0][1] + (mid[k1][1] - mid[k0][1]) * f;
      g.beginPath();
      g.moveTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      g.lineTo(x, y);
      g.stroke();
    }
  };

  const finCol = silhouette ? 'rgba(92,72,56,0.13)' : css(sp.fin, 0.92);
  const tx = cx - L / 2 + L * 0.13;
  if (!isEel && !isRay) {
    // Tail, dorsal, anal, pectoral.
    strokeFin([[tx, cy - H * 0.05], [tx - L * 0.17, cy - H * 0.52], [tx - L * 0.11, cy], [tx - L * 0.17, cy + H * 0.52], [tx, cy + H * 0.05]], finCol, 8);
    strokeFin([[cx + L * 0.16, cy - H * 0.42], [cx + L * 0.05, cy - H * 0.86], [cx - L * 0.12, cy - H * 0.72], [cx - L * 0.22, cy - H * 0.22]], finCol, 9);
    strokeFin([[cx - L * 0.02, cy + H * 0.4], [cx - L * 0.1, cy + H * 0.72], [cx - L * 0.2, cy + H * 0.55], [cx - L * 0.25, cy + H * 0.2]], finCol, 7);
  }
  if (isRay) {
    g.strokeStyle = silhouette ? 'rgba(92,72,56,0.2)' : css(sp.top, 1);
    g.lineWidth = w * 0.012;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - L * 0.26, cy);
    g.quadraticCurveTo(cx - L * 0.42, cy + H * 0.08, cx - L * 0.5, cy - H * 0.05);
    g.stroke();
  }

  if (silhouette) {
    body();
    g.fillStyle = 'rgba(92,72,56,0.15)';
    g.fill();
    g.strokeStyle = 'rgba(92,72,56,0.32)';
    g.lineWidth = Math.max(1, w * 0.004);
    g.stroke();
    return c;
  }

  // Body: back to belly gradient, then patterns clipped to the body.
  g.save();
  body();
  g.clip();
  const grad = g.createLinearGradient(0, cy - H * 0.6, 0, cy + H * 0.6);
  grad.addColorStop(0, css(sp.top));
  grad.addColorStop(0.45, css(sp.side));
  grad.addColorStop(0.95, css(sp.belly));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // Loose brush strokes along the flank.
  for (let i = 0; i < 90; i++) {
    const x = cx - L / 2 + rnd() * L;
    const y = cy - H * 0.55 + rnd() * H * 1.1;
    const t = (y - (cy - H * 0.55)) / (H * 1.1);
    const col = t < 0.35 ? sp.top : t < 0.7 ? sp.side : sp.belly;
    g.strokeStyle = css(col, 0.2 + rnd() * 0.26);
    g.lineWidth = w * (0.004 + rnd() * 0.012);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - L * (0.03 + rnd() * 0.07), y + (rnd() - 0.5) * H * 0.07);
    g.stroke();
  }

  // Pattern.
  const acc = sp.accent ?? sp.top;
  if (sp.pattern === 'bars') {
    for (let i = 0; i < 7; i++) {
      const x = cx + L * 0.25 - i * L * 0.095;
      g.strokeStyle = css(acc, 0.72);
      g.lineWidth = L * (0.02 + rnd() * 0.014);
      g.beginPath();
      g.moveTo(x + rnd() * 3, cy - H * 0.6);
      g.quadraticCurveTo(x - L * 0.02, cy, x + rnd() * 3, cy + H * 0.2);
      g.stroke();
    }
  } else if (sp.pattern === 'spots' || sp.pattern === 'ray') {
    const n = sp.pattern === 'ray' ? 70 : 34;
    for (let i = 0; i < n; i++) {
      const x = cx - L / 2 + rnd() * L;
      const y = cy - H * 0.55 + Math.pow(rnd(), sp.pattern === 'ray' ? 1 : 1.5) * H * (sp.pattern === 'ray' ? 1.1 : 0.72);
      g.fillStyle = css(acc, 0.55 + rnd() * 0.4);
      g.beginPath();
      g.arc(x, y, L * (sp.pattern === 'ray' ? 0.003 + rnd() * 0.007 : 0.006 + rnd() * 0.012), 0, Math.PI * 2);
      g.fill();
    }
  } else if (sp.pattern === 'stripes') {
    for (let i = 0; i < 5; i++) {
      const y = cy - H * 0.4 + i * H * 0.17;
      g.strokeStyle = css(acc, 0.62);
      g.lineWidth = H * 0.042;
      g.beginPath();
      g.moveTo(cx + L * 0.4, y + H * 0.03);
      g.quadraticCurveTo(cx, y - H * 0.03, cx - L * 0.42, y + H * 0.02);
      g.stroke();
    }
  } else if (sp.pattern === 'glow') {
    const gr = g.createRadialGradient(cx + L * 0.2, cy - H * 0.45, 0, cx + L * 0.2, cy - H * 0.45, L * 0.2);
    gr.addColorStop(0, css(acc, 0.95));
    gr.addColorStop(1, css(acc, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }

  // Scales: tiny arcs along the flank.
  if (!isEel && !isRay) {
    g.strokeStyle = 'rgba(30,20,20,0.1)';
    g.lineWidth = Math.max(0.7, w * 0.0018);
    const s = L * 0.03;
    for (let yy = cy - H * 0.5; yy < cy + H * 0.5; yy += s * 0.8) {
      const off = (Math.round(yy / s) % 2) * s * 0.5;
      for (let xx = cx - L * 0.4 + off; xx < cx + L * 0.25; xx += s) {
        g.beginPath();
        g.arc(xx, yy, s * 0.6, -1.1, 1.1);
        g.stroke();
      }
    }
  }
  // Light from above.
  const sheen = g.createLinearGradient(0, cy - H * 0.55, 0, cy);
  sheen.addColorStop(0, 'rgba(255,245,220,0.0)');
  sheen.addColorStop(0.6, 'rgba(255,245,220,0.18)');
  sheen.addColorStop(1, 'rgba(255,245,220,0.0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  g.restore();

  // Pencil outline and details, the storybook illustrator's hand.
  body();
  g.strokeStyle = 'rgba(46,30,26,0.55)';
  g.lineWidth = Math.max(1.2, w * 0.0045);
  g.stroke();

  if (!isRay) {
    const nose = cx + L / 2;
    const ex = nose - L * (isEel ? 0.05 : 0.13);
    const ey = cy + (isEel ? -H * 0.1 : -H * 0.12);
    const r = L * (isEel ? 0.012 : 0.026);
    g.fillStyle = '#f6efdc';
    g.beginPath();
    g.arc(ex, ey, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c1416';
    g.beginPath();
    g.arc(ex + r * 0.12, ey, r * 0.58, 0, Math.PI * 2);
    g.fill();
    if (!isEel) {
      // Gill and pectoral.
      g.strokeStyle = 'rgba(46,30,26,0.42)';
      g.lineWidth = Math.max(1, w * 0.004);
      g.beginPath();
      g.moveTo(nose - L * 0.2, cy - H * 0.3);
      g.quadraticCurveTo(nose - L * 0.255, cy, nose - L * 0.195, cy + H * 0.3);
      g.stroke();
      const px = nose - L * 0.27;
      strokeFin([[px, cy + H * 0.02], [px - L * 0.11, cy + H * 0.22], [px - L * 0.02, cy + H * 0.26]], css(sp.fin, 0.82), 4);
    }
  }
  return c;
}

/** A small lofted model of the fish, for the moment it comes out of the water. */
export function fishModel(sp: Species): THREE.Group {
  const group = new THREE.Group();
  const b = new Builder(strHash(sp.id));
  const L = Math.max(0.25, sp.length) * 1.05; // storybook fish are a bit bigger than life
  const H = L * Math.min(sp.depth, 0.6);
  const thick = H * 0.34;
  const rings = 18;
  const sides = 12;
  const top = new THREE.Color(sp.top);
  const side = new THREE.Color(sp.side);
  const belly = new THREE.Color(sp.belly);
  const pos: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const profile = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.03)), 0.72) * (0.32 + 0.68 * Math.min(1, t * 2.4));
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings; // 0 tail, 1 nose
    const z = (0.5 - t) * L * -1;
    const k = profile(t);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const y = Math.cos(a) * (H / 2) * k;
      const x = Math.sin(a) * (thick / 2) * k;
      pos.push(x, y, z);
      const v = Math.cos(a) * 0.5 + 0.5;
      if (v > 0.55) c.copy(side).lerp(top, (v - 0.55) / 0.45);
      else c.copy(belly).lerp(side, v / 0.55);
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s;
      const b2 = r * sides + (s + 1) % sides;
      const c2 = a + sides;
      const d = b2 + sides;
      idx.push(a, b2, c2, b2, d, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('aEmis', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Tail and fins from thin bevelled plates.
  const tail = new THREE.Shape();
  tail.moveTo(0, 0);
  tail.lineTo(-H * 0.55, 0.0);
  tail.closePath();
  const fin = sp.fin;
  const plate = (w: number, h: number, m: THREE.Matrix4) => b.add(new THREE.BoxGeometry(0.008, h, w), fin, m);
  plate(L * 0.16, H * 0.72, TRS(0, 0, L * 0.53));
  plate(L * 0.32, H * 0.22, TRS(0, H * 0.5, L * -0.02, 0.1, 0, 0));
  plate(L * 0.18, H * 0.16, TRS(0, -H * 0.46, L * 0.12, -0.1, 0, 0));
  plate(L * 0.12, H * 0.14, TRS(thick * 0.5, -H * 0.15, -L * 0.14, 0, 0, 0.6));
  plate(L * 0.12, H * 0.14, TRS(-thick * 0.5, -H * 0.15, -L * 0.14, 0, 0, -0.6));
  b.sphere(H * 0.05 + 0.006, 0xf2ead8, TRS(thick * 0.28, H * 0.09, -L * 0.36), {}, 6, 5);
  b.sphere(H * 0.05 + 0.006, 0xf2ead8, TRS(-thick * 0.28, H * 0.09, -L * 0.36), {}, 6, 5);
  b.sphere(H * 0.03 + 0.004, 0x1c1416, TRS(thick * 0.3, H * 0.09, -L * 0.365), {}, 6, 5);
  b.sphere(H * 0.03 + 0.004, 0x1c1416, TRS(-thick * 0.3, H * 0.09, -L * 0.365), {}, 6, 5);
  const mat = paintedMaterial();
  if (sp.glow) {
    mat.uniforms.uEmisCol.value.set(sp.glow);
    mat.uniforms.uEmisOn.value = 1.8;
    (g.attributes.aEmis as THREE.BufferAttribute).array.fill(0.7);
  }
  group.add(solid(g, mat, false));
  group.add(solid(b.build(), mat, false));
  return group;
}
