// Merges many small painted parts into one mesh, keeping per-part colour and glow in vertex data.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise';
import { L } from '../render/shared';

export type Col = number | THREE.Color;

export const TRS = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );

export interface PartOpts {
  emis?: number; // glow, 0..1
  jit?: number; // random value variation
  hue?: number; // random hue drift
  ao?: number; // darken towards the bottom of the part
}

export class Builder {
  private parts: THREE.BufferGeometry[] = [];
  rnd: () => number;

  constructor(seed = 1) {
    this.rnd = mulberry32(seed);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  add(geo: THREE.BufferGeometry, color: Col, m?: THREE.Matrix4, o: PartOpts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    if (o.jit) c.multiplyScalar(1 + (this.rnd() - 0.5) * o.jit);
    if (o.hue) c.offsetHSL((this.rnd() - 0.5) * o.hue, 0, 0);
    const cols = new Float32Array(n * 3);
    const emis = new Float32Array(n);
    let minY = Infinity;
    let maxY = -Infinity;
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const ao = o.ao ?? 0;
    for (let i = 0; i < n; i++) {
      const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 1;
      const k = 1 - ao * (1 - t);
      cols[i * 3] = c.r * k;
      cols[i * 3 + 1] = c.g * k;
      cols[i * 3 + 2] = c.b * k;
      emis[i] = o.emis ?? 0;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    out.setAttribute('aEmis', new THREE.BufferAttribute(emis, 1));
    this.parts.push(out);
    g.dispose();
    return this;
  }

  /** Softly bevelled box, so edges catch the light. */
  box(w: number, h: number, d: number, color: Col, m: THREE.Matrix4, o: PartOpts = {}, bevel = 0.02) {
    const r = Math.min(bevel, Math.min(w, h, d) * 0.45);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, r), color, m, o);
  }

  /** Cheap unbevelled box for parts seen in their hundreds, such as shingles. */
  plain(w: number, h: number, d: number, color: Col, m: THREE.Matrix4, o: PartOpts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, m, o);
  }

  cyl(rTop: number, rBot: number, h: number, color: Col, m: THREE.Matrix4, o: PartOpts = {}, seg = 10) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), color, m, o);
  }

  sphere(r: number, color: Col, m: THREE.Matrix4, o: PartOpts = {}, ws = 14, hs = 10) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, m, o);
  }

  lathe(profile: [number, number][], color: Col, m?: THREE.Matrix4, o: PartOpts = {}, seg = 16) {
    return this.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), color, m, o);
  }

  /** A rope or rail following a list of points. */
  tube(points: THREE.Vector3[], radius: number, color: Col, o: PartOpts = {}, seg = 16, rad = 6) {
    const curve = new THREE.CatmullRomCurve3(points);
    return this.add(new THREE.TubeGeometry(curve, seg, radius, rad, false), color, undefined, o);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (!g) throw new Error('Builder had no parts');
    return g;
  }
}

/** A solid painted mesh that shows in reflections and casts shadow. */
export function solid(geo: THREE.BufferGeometry, mat: THREE.Material, casts = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.layers.set(L.OPAQUE);
  if (casts) m.layers.enable(L.CAST_SOLID);
  return m;
}
