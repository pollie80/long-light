// Birds as paintings for the journal: a side view, perched or afloat, facing right like the fish.
import type { BirdKind, BirdShape } from './birddata';

const css = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

interface Form {
  /** Body length and depth, as shares of the picture's width. */
  len: number;
  deep: number;
  /** Body tilt: 0 level, positive head up. */
  tilt: number;
  /** Neck: how far the head sits forward and up from the front of the body. */
  neckX: number;
  neckY: number;
  head: number;
  bill: number;
  billKind: 'flat' | 'point' | 'hook' | 'dagger' | 'long' | 'casque' | 'curve';
  legs: number;
  tail: 'short' | 'fan' | 'fork' | 'long';
  /** Sits on the water rather than standing. */
  water?: boolean;
  disc?: boolean;
  crest?: boolean;
}

const FORMS: Record<BirdShape, Form> = {
  duck: { len: 0.46, deep: 0.2, tilt: 0.02, neckX: 0.05, neckY: 0.13, head: 0.075, bill: 0.07, billKind: 'flat', legs: 0, tail: 'short', water: true },
  goose: { len: 0.5, deep: 0.22, tilt: 0.04, neckX: 0.08, neckY: 0.28, head: 0.065, bill: 0.07, billKind: 'flat', legs: 0, tail: 'short', water: true },
  loon: { len: 0.52, deep: 0.17, tilt: 0, neckX: 0.06, neckY: 0.1, head: 0.07, bill: 0.1, billKind: 'dagger', legs: 0, tail: 'short', water: true },
  gull: { len: 0.44, deep: 0.19, tilt: 0.12, neckX: 0.04, neckY: 0.1, head: 0.075, bill: 0.08, billKind: 'point', legs: 0.13, tail: 'short' },
  pigeon: { len: 0.4, deep: 0.22, tilt: 0.15, neckX: 0.03, neckY: 0.1, head: 0.065, bill: 0.035, billKind: 'point', legs: 0.08, tail: 'fan' },
  heron: { len: 0.36, deep: 0.17, tilt: 0.35, neckX: 0.06, neckY: 0.3, head: 0.055, bill: 0.15, billKind: 'long', legs: 0.32, tail: 'short' },
  raptor: { len: 0.36, deep: 0.22, tilt: 0.9, neckX: 0.02, neckY: 0.06, head: 0.075, bill: 0.05, billKind: 'hook', legs: 0.1, tail: 'long' },
  owl: { len: 0.32, deep: 0.26, tilt: 1.15, neckX: 0.0, neckY: 0.02, head: 0.12, bill: 0.03, billKind: 'hook', legs: 0.06, tail: 'short', disc: true },
  small: { len: 0.32, deep: 0.17, tilt: 0.55, neckX: 0.02, neckY: 0.06, head: 0.075, bill: 0.07, billKind: 'dagger', legs: 0.07, tail: 'fork' },
  corvid: { len: 0.38, deep: 0.19, tilt: 0.45, neckX: 0.03, neckY: 0.07, head: 0.08, bill: 0.06, billKind: 'point', legs: 0.1, tail: 'long' },
  hornbill: { len: 0.4, deep: 0.18, tilt: 0.3, neckX: 0.04, neckY: 0.1, head: 0.07, bill: 0.16, billKind: 'casque', legs: 0.08, tail: 'long' },
  parrot: { len: 0.32, deep: 0.2, tilt: 0.95, neckX: 0.01, neckY: 0.05, head: 0.085, bill: 0.05, billKind: 'curve', legs: 0.07, tail: 'long', crest: true },
};

/** Paints one bird. `silhouette` draws one never brought down as a pale pencil shape. */
export function paintBird(b: BirdKind, w: number, h: number, silhouette = false, neon = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (neon && !silhouette) {
    // Seen as it was: glowing, against the night.
    g.fillStyle = '#0a0f2c';
    g.beginPath();
    g.roundRect(w * 0.01, h * 0.02, w * 0.98, h * 0.96, w * 0.03);
    g.fill();
    const halo = g.createRadialGradient(w * 0.47, h * 0.5, 0, w * 0.47, h * 0.5, w * 0.46);
    halo.addColorStop(0, css(b.body, 0.5));
    halo.addColorStop(1, css(b.body, 0));
    g.fillStyle = halo;
    g.fill();
  }
  const f = FORMS[b.shape];
  const U = w;
  const ink = 'rgba(40,24,20,0.55)';
  const pale = 'rgba(92,72,56,0.15)';
  const paleLine = 'rgba(92,72,56,0.32)';
  const fill = (col: number, a = 1) => (silhouette ? pale : css(col, a));
  const line = (lw = 0.004) => {
    g.strokeStyle = silhouette ? paleLine : ink;
    g.lineWidth = Math.max(1, U * lw);
    g.stroke();
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Where it stands: the waterline, or a branch.
  const groundY = h * 0.84;
  const bodyLen = U * f.len;
  const bodyDeep = U * f.deep;
  const cx = w * 0.46;
  const cy = f.water ? groundY - bodyDeep * 0.28 : groundY - U * f.legs - bodyDeep * 0.42;
  if (f.water) {
    g.strokeStyle = silhouette ? paleLine : 'rgba(60,110,140,0.55)';
    g.lineWidth = Math.max(1, U * 0.005);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const y = groundY + i * h * 0.04;
      g.moveTo(w * (0.12 + i * 0.06), y);
      g.bezierCurveTo(w * 0.35, y - h * 0.015, w * 0.6, y + h * 0.015, w * (0.86 - i * 0.05), y);
      g.stroke();
    }
  } else {
    g.strokeStyle = silhouette ? paleLine : 'rgba(92,64,40,0.85)';
    g.lineWidth = Math.max(2, U * 0.014);
    g.beginPath();
    g.moveTo(w * 0.1, groundY + h * 0.02);
    g.quadraticCurveTo(w * 0.5, groundY - h * 0.02, w * 0.9, groundY + h * 0.03);
    g.stroke();
  }

  const a = Math.min(f.tilt, 1.2);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // A point on the body, in its own frame (x forward, y up), turned by the tilt.
  const P = (x: number, y: number): [number, number] => [cx + x * ca - y * sa, cy - (x * sa + y * ca)];
  const front = P(bodyLen * 0.42, bodyDeep * 0.25);
  const headX = front[0] + U * f.neckX;
  const headY = front[1] - U * f.neckY;
  const hr = U * f.head;

  // Legs.
  if (!f.water && f.legs > 0) {
    g.strokeStyle = silhouette ? paleLine : css(b.shape === 'raptor' || b.shape === 'owl' ? 0xd8b030 : 0x4a3a30, 1);
    g.lineWidth = Math.max(1.5, U * (b.shape === 'heron' ? 0.007 : 0.01));
    const hip = P(-bodyLen * 0.02, -bodyDeep * 0.38);
    for (const dx of [-0.02, 0.02]) {
      g.beginPath();
      g.moveTo(hip[0] + U * dx, hip[1]);
      g.lineTo(hip[0] + U * dx * 1.4, groundY);
      g.lineTo(hip[0] + U * (dx * 1.4 + 0.035), groundY);
      g.stroke();
    }
  }

  // Tail.
  const tailBase = P(-bodyLen * 0.42, 0);
  const tl = f.tail === 'long' ? 0.2 : f.tail === 'fork' ? 0.17 : f.tail === 'fan' ? 0.13 : 0.08;
  const tailEnd = P(-bodyLen * 0.42 - U * tl, -U * 0.01);
  g.beginPath();
  g.moveTo(tailBase[0], tailBase[1] - bodyDeep * 0.18);
  if (f.tail === 'fork') {
    g.lineTo(tailEnd[0], tailEnd[1] - U * 0.03);
    g.lineTo(tailEnd[0] + U * 0.04, tailEnd[1]);
    g.lineTo(tailEnd[0], tailEnd[1] + U * 0.03);
  } else {
    g.lineTo(tailEnd[0], tailEnd[1] - U * (f.tail === 'fan' ? 0.035 : 0.02));
    g.lineTo(tailEnd[0], tailEnd[1] + U * (f.tail === 'fan' ? 0.035 : 0.02));
  }
  g.lineTo(tailBase[0], tailBase[1] + bodyDeep * 0.18);
  g.closePath();
  g.fillStyle = fill(b.wing);
  g.fill();
  line();

  // Neck, behind the head and body.
  if (f.neckY > 0.08) {
    g.beginPath();
    g.moveTo(front[0] - U * 0.03, front[1] + U * 0.02);
    g.quadraticCurveTo(front[0] + U * f.neckX * (b.shape === 'heron' ? -0.6 : 0.2), (front[1] + headY) / 2, headX, headY + hr * 0.4);
    g.lineTo(headX - hr * 0.7, headY + hr * 0.2);
    g.quadraticCurveTo(front[0] - U * f.neckX * (b.shape === 'heron' ? 0.9 : 0.1), (front[1] + headY) / 2, front[0] - U * 0.09, front[1] + U * 0.04);
    g.closePath();
    g.fillStyle = fill(b.shape === 'goose' ? b.head : b.breast ?? b.body);
    g.fill();
    line();
  }

  // Body.
  g.beginPath();
  g.ellipse(cx, cy, bodyLen / 2, bodyDeep / 2, -a, 0, Math.PI * 2);
  g.fillStyle = fill(b.body);
  g.fill();
  line();
  // Breast: the front and underside.
  if (b.breast !== undefined && !silhouette) {
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, bodyLen / 2, bodyDeep / 2, -a, 0, Math.PI * 2);
    g.clip();
    g.beginPath();
    const bp = P(bodyLen * 0.22, -bodyDeep * 0.12);
    g.ellipse(bp[0], bp[1], bodyLen * 0.36, bodyDeep * 0.42, -a, 0, Math.PI * 2);
    g.fillStyle = css(b.breast, 0.95);
    g.fill();
    g.restore();
  }
  // Folded wing along the back, darker at the tips.
  {
    const wa = P(bodyLen * 0.28, bodyDeep * 0.22);
    const wb = P(-bodyLen * 0.5, bodyDeep * 0.06);
    const wc = P(-bodyLen * 0.2, -bodyDeep * 0.2);
    g.beginPath();
    g.moveTo(wa[0], wa[1]);
    g.quadraticCurveTo((wa[0] + wb[0]) / 2, Math.min(wa[1], wb[1]) - bodyDeep * 0.12, wb[0], wb[1]);
    g.quadraticCurveTo(wc[0], wc[1], wa[0], wa[1] + bodyDeep * 0.12);
    g.closePath();
    g.fillStyle = fill(b.wing);
    g.fill();
    line(0.003);
    if (!silhouette) {
      g.beginPath();
      g.moveTo(wb[0], wb[1]);
      const tip = P(-bodyLen * 0.3, bodyDeep * 0.08);
      g.lineTo(tip[0], tip[1]);
      g.strokeStyle = css(b.accent ?? 0x1c1c1e, b.accent !== undefined ? 0.9 : 0.35);
      g.lineWidth = Math.max(2, U * 0.012);
      g.stroke();
      // A few feather lines.
      g.strokeStyle = 'rgba(30,20,16,0.22)';
      g.lineWidth = Math.max(1, U * 0.0025);
      for (let i = 1; i < 4; i++) {
        const p0 = P(bodyLen * (0.2 - i * 0.14), bodyDeep * 0.16);
        const p1 = P(bodyLen * (0.08 - i * 0.14), -bodyDeep * 0.02);
        g.beginPath();
        g.moveTo(p0[0], p0[1]);
        g.lineTo(p1[0], p1[1]);
        g.stroke();
      }
    }
  }

  // Head.
  g.beginPath();
  g.arc(headX, headY, hr, 0, Math.PI * 2);
  g.fillStyle = fill(b.head);
  g.fill();
  line();
  if (f.disc && !silhouette) {
    // The owl's face: a pale dish with the eyes set in it.
    g.beginPath();
    g.ellipse(headX + hr * 0.35, headY + hr * 0.08, hr * 0.62, hr * 0.78, 0, 0, Math.PI * 2);
    g.fillStyle = css(b.breast ?? b.body, 0.95);
    g.fill();
    g.strokeStyle = css(b.wing, 0.8);
    g.lineWidth = Math.max(1, U * 0.004);
    g.stroke();
  }
  if (b.id === 'hornedowl') {
    for (const dx of [-0.35, 0.25]) {
      g.beginPath();
      g.moveTo(headX + hr * dx, headY - hr * 0.8);
      g.lineTo(headX + hr * (dx + 0.12), headY - hr * 1.5);
      g.lineTo(headX + hr * (dx + 0.35), headY - hr * 0.75);
      g.closePath();
      g.fillStyle = fill(b.head);
      g.fill();
      line(0.003);
    }
  }
  if (f.crest) {
    g.beginPath();
    g.moveTo(headX - hr * 0.2, headY - hr * 0.8);
    g.quadraticCurveTo(headX - hr * 1.2, headY - hr * 2.4, headX - hr * 1.5, headY - hr * 1.6);
    g.quadraticCurveTo(headX - hr * 1.0, headY - hr * 1.4, headX - hr * 0.7, headY - hr * 0.5);
    g.closePath();
    g.fillStyle = fill(b.accent ?? b.head);
    g.fill();
    line(0.003);
  }
  // Chin strap, or crown.
  if (b.accent !== undefined && !silhouette) {
    if (b.shape === 'goose') {
      g.beginPath();
      g.ellipse(headX - hr * 0.1, headY + hr * 0.45, hr * 0.55, hr * 0.32, 0.3, 0, Math.PI * 2);
      g.fillStyle = css(b.accent);
      g.fill();
    } else if (b.id === 'whoopingcrane') {
      g.beginPath();
      g.arc(headX + hr * 0.15, headY - hr * 0.35, hr * 0.42, 0, Math.PI * 2);
      g.fillStyle = css(b.accent);
      g.fill();
    }
  }

  // Bill.
  const bl = U * f.bill;
  const bx = headX + hr * 0.85;
  const by = headY + hr * 0.12;
  g.beginPath();
  switch (f.billKind) {
    case 'flat':
      g.moveTo(bx - hr * 0.2, by - hr * 0.3);
      g.quadraticCurveTo(bx + bl, by - hr * 0.25, bx + bl, by + hr * 0.05);
      g.lineTo(bx - hr * 0.2, by + hr * 0.22);
      break;
    case 'hook':
      g.moveTo(bx - hr * 0.2, by - hr * 0.3);
      g.quadraticCurveTo(bx + bl, by - hr * 0.35, bx + bl * 0.8, by + hr * 0.35);
      g.lineTo(bx - hr * 0.1, by + hr * 0.2);
      break;
    case 'curve':
      g.moveTo(bx - hr * 0.3, by - hr * 0.4);
      g.quadraticCurveTo(bx + bl * 1.1, by - hr * 0.5, bx + bl * 0.6, by + hr * 0.55);
      g.lineTo(bx - hr * 0.2, by + hr * 0.25);
      break;
    case 'casque':
      // A great curved bill with the horn on top.
      g.moveTo(bx - hr * 0.2, by - hr * 0.5);
      g.quadraticCurveTo(bx + bl * 0.6, by - hr * 1.3, bx + bl, by - hr * 0.2);
      g.quadraticCurveTo(bx + bl * 0.9, by + hr * 0.2, bx + bl * 0.7, by + hr * 0.35);
      g.lineTo(bx - hr * 0.2, by + hr * 0.25);
      break;
    default: {
      const thick = f.billKind === 'long' || f.billKind === 'dagger' ? 0.2 : 0.28;
      g.moveTo(bx - hr * 0.2, by - hr * thick);
      g.lineTo(bx + bl, by + hr * 0.02);
      g.lineTo(bx - hr * 0.2, by + hr * thick);
    }
  }
  g.closePath();
  g.fillStyle = fill(b.bill);
  g.fill();
  line(0.003);

  // Eye, with its glint.
  if (!silhouette) {
    const owl = f.disc;
    const ex = headX + hr * (owl ? 0.5 : 0.35);
    const ey = headY - hr * (owl ? 0.05 : 0.18);
    const er = hr * (owl ? 0.24 : 0.16);
    g.beginPath();
    g.arc(ex, ey, er, 0, Math.PI * 2);
    g.fillStyle = owl && b.id !== 'barnowl' ? '#f0a020' : '#1a1210';
    g.fill();
    if (owl && b.id !== 'barnowl') {
      g.beginPath();
      g.arc(ex + er * 0.15, ey, er * 0.55, 0, Math.PI * 2);
      g.fillStyle = '#1a1210';
      g.fill();
    }
    g.beginPath();
    g.arc(ex + er * 0.35, ey - er * 0.35, Math.max(1, er * 0.3), 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,250,240,0.9)';
    g.fill();
  }
  return c;
}
