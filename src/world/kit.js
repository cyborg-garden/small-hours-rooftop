// OWNER: B (world). The modelling kit. Every model on the roof is built from these few tools and painted with
// vertex colours, so a whole object (or the whole static roof) is ONE mesh with ONE gouache material.
// Nothing here animates. Colours come from the palette only (mixes of palette entries are allowed).
import * as THREE from 'three';
import { gouache } from '../render/materials.js';
import { PAL } from '../core/palette.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const col = (k) => (k && k.isColor ? k.clone() : new THREE.Color(PAL[k] || k));
export const mix = (a, b, t) => col(a).lerp(col(b), t);
export const shade = (k, f) => col(k).multiplyScalar(f);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

// White gouache with vertex colours. material.color stays a plain multiplier (hot things breathe through it).
function vc(opts) {
  let m;
  try { m = gouache('#ffffff', { unique: 1, ...opts }); }
  catch (_) { m = opts.flat ? new THREE.MeshBasicMaterial({ fog: false }) : new THREE.MeshToonMaterial(); }
  m.vertexColors = true; if (opts.side !== undefined) m.side = opts.side; m.needsUpdate = true;
  return m;
}
export const paint = {
  lit: () => vc({}), lit2: () => vc({ side: THREE.DoubleSide }),
  flat: () => vc({ flat: 1 }), flat2: () => vc({ flat: 1, side: THREE.DoubleSide }),
  // paint with no drawn line round it: water, mist, the fine pipework that would otherwise read as wire
  water: () => vc({ flat: 1, noInk: 1 }), quiet: () => vc({ noInk: 1 }),
};

// transform shorthand: xf(x, y, z, rx, ry, rz, sx, sy, sz)
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
export const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b));

// ---- Batch: collect painted geometry, emit one mesh ---------------------------------------------------------
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
export class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  // colour: palette key | Color | (pos, normal) => Color (pos and normal already transformed) | null (use geo colours)
  add(geo, colour, m) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, gc = geo.attributes.color, base = this.p.length / 3;
    if (m) _nm.getNormalMatrix(m);
    const fn = typeof colour === 'function' ? colour : null, fixed = fn || colour == null ? null : col(colour);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k); _n.fromBufferAttribute(nor, k);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      const c = fn ? fn(_v, _n) : fixed || (gc ? _c.fromBufferAttribute(gc, k) : _c.set(1, 1, 1));
      this.c.push(c.r, c.g, c.b);
    }
    if (geo.index) { const ix = geo.index; for (let k = 0; k < ix.count; k++) this.i.push(ix.getX(k) + base); }
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
    return this;
  }
  get count() { return this.p.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
  mesh(material, o = {}) {
    const m = new THREE.Mesh(this.geometry(), material || paint.lit());
    m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true; if (o.name) m.name = o.name;
    return m;
  }
}

// ---- primitives -------------------------------------------------------------------------------------------
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const ball = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
export const disc = (r, seg = 12) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);   // faces up
export const quad = (w, h) => new THREE.PlaneGeometry(w, h);
export function flat(g) { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; }

// Lathe with hard creases between profile segments (round about the axis). pts: [[r, y], ...] bottom to top or any order.
export function lathe(pts, seg = 12, soft = false, arc = Math.PI * 2, a0 = 0) {
  const P = [], N = [], I = [], full = Math.abs(arc - Math.PI * 2) < 1e-6;
  const segN = (k) => { const dr = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l]; };
  const ring = (r, y, nr, ny) => { const b = P.length / 3; for (let s = 0; s <= seg; s++) { const a = a0 + (s / seg) * arc, c = Math.cos(a), sn = Math.sin(a); P.push(r * c, y, r * sn); N.push(nr * c, ny, nr * sn); } return b; };
  for (let k = 0; k < pts.length - 1; k++) {
    let n0 = segN(k), n1 = n0;
    if (soft) { if (k > 0) { const q = segN(k - 1); n0 = [(n0[0] + q[0]) / 2, (n0[1] + q[1]) / 2]; } if (k < pts.length - 2) { const q = segN(k + 1); n1 = [(n1[0] + q[0]) / 2, (n1[1] + q[1]) / 2]; } }
    const a = ring(pts[k][0], pts[k][1], n0[0], n0[1]), b = ring(pts[k + 1][0], pts[k + 1][1], n1[0], n1[1]);
    for (let s = 0; s < seg; s++) I.push(a + s, b + s, a + s + 1, a + s + 1, b + s, b + s + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  // the profile may run either way; make the faces point away from the axis side they were drawn on
  const flip = (() => { let a = 0; for (let k = 0; k < pts.length - 1; k++) a += (pts[k + 1][1] - pts[k][1]) * (pts[k][0] + pts[k + 1][0]); return a < 0; })();
  if (flip) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } const n = g.attributes.normal.array; for (let k = 0; k < n.length; k++) n[k] = -n[k]; }
  void full; return g;
}

// Tube along a polyline. radius: number or (t 0..1) => number. Round about its length. caps: true (both) | false | 'start' | 'end'.
export function tube(pts, radius, sides = 6, caps = true) {
  const n = pts.length, P = [], N = [], I = [], rad = typeof radius === 'function' ? radius : () => radius;
  const tan = (k) => _v.subVectors(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]).normalize().clone();
  let t0 = tan(0), u = new THREE.Vector3(0, 1, 0); if (Math.abs(t0.dot(u)) > 0.9) u.set(1, 0, 0);
  u.sub(t0.clone().multiplyScalar(u.dot(t0))).normalize();
  for (let k = 0; k < n; k++) {
    const t = tan(k); u.sub(t.clone().multiplyScalar(u.dot(t))).normalize(); const w = new THREE.Vector3().crossVectors(t, u), r = rad(n > 1 ? k / (n - 1) : 0);
    for (let s = 0; s < sides; s++) { const a = (s / sides) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const nx = u.x * c + w.x * sn, ny = u.y * c + w.y * sn, nz = u.z * c + w.z * sn;
      P.push(pts[k].x + nx * r, pts[k].y + ny * r, pts[k].z + nz * r); N.push(nx, ny, nz); }
    if (k) for (let s = 0; s < sides; s++) { const a = (k - 1) * sides + s, b = (k - 1) * sides + (s + 1) % sides, c2 = k * sides + s, d = k * sides + (s + 1) % sides; I.push(a, b, c2, b, d, c2); }
  }
  const capStart = I.length, capMid = [];   // index count of the walls, then where the second cap begins: tests find the end caps
  if (caps) for (const [k, sg] of [[0, -1], [n - 1, 1]]) {
    if ((caps === 'start' && k) || (caps === 'end' && !k)) continue;
    const t = tan(k).multiplyScalar(sg), b = P.length / 3; capMid.push(I.length);
    for (let s = 0; s < sides; s++) { const o = (k * sides + s) * 3; P.push(P[o], P[o + 1], P[o + 2]); N.push(t.x, t.y, t.z); }
    for (let s = 1; s < sides - 1; s++) sg > 0 ? I.push(b, b + s, b + s + 1) : I.push(b, b + s + 1, b + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  if (caps) { g.userData.capStart = capStart; g.userData.capMid = capMid[1]; if (capMid.length < 2) g.userData.capOnly = caps === 'end' ? 1 : 0; }
  return g;
}

// Skin a stack of closed rings (each an array of Vector3, same count). Smooth normals. caps: 'both' | 'start' | 'end' | null.
// The rings may be listed in either direction: every face is turned to point away from the loft's centre, so the
// near wall is the one drawn (a loft wound the other way draws its far wall, and anything inside shows through).
export function loft(rings, caps = 'both') {
  const m = rings[0].length, P = [], I = [];
  for (const r of rings) for (const p of r) P.push(p.x, p.y, p.z);
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < m; s++) { const a = k * m + s, b = k * m + (s + 1) % m, c = (k + 1) * m + s, d = (k + 1) * m + (s + 1) % m; I.push(a, c, b, b, c, d); }
  const cen = new THREE.Vector3(); for (let i = 0; i < P.length; i += 3) cen.x += P[i] / (P.length / 3), cen.y += P[i + 1] / (P.length / 3), cen.z += P[i + 2] / (P.length / 3);
  outward(P, I, cen);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  if (!caps) return g;
  const parts = [g];
  for (const [k, on] of [[0, caps === 'both' || caps === 'start'], [rings.length - 1, caps === 'both' || caps === 'end']]) {
    if (!on) continue; const r = rings[k], cp = [], ci = [], c = r.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / m);
    cp.push(c.x, c.y, c.z); for (const p of r) cp.push(p.x, p.y, p.z);
    for (let s = 0; s < m; s++) ci.push(0, 1 + s, 1 + (s + 1) % m);
    outward(cp, ci, cen);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals(); parts.push(cg);
  }
  const b = new Batch(); for (const q of parts) b.add(q, 'paper'); const out = b.geometry(); out.deleteAttribute('color');
  if (parts.length > 1) { out.userData.capStart = g.index.count; if (parts.length > 2) out.userData.capMid = g.index.count + parts[1].index.count; else out.userData.capOnly = caps === 'end' ? 1 : 0; }   // the skin's indices come first, then the caps
  return out;
}
// turn every triangle of (P, I) to face away from a centre point: the winding test the lathe does, for any shape
function outward(P, I, cen) {
  let vote = 0;
  for (let k = 0; k < I.length; k += 3) {
    const A = I[k] * 3, B = I[k + 1] * 3, C = I[k + 2] * 3;
    const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2], vx = P[C] - P[A], vy = P[C + 1] - P[A + 1], vz = P[C + 2] - P[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    vote += nx * ((P[A] + P[B] + P[C]) / 3 - cen.x) + ny * ((P[A + 1] + P[B + 1] + P[C + 1]) / 3 - cen.y) + nz * ((P[A + 2] + P[B + 2] + P[C + 2]) / 3 - cen.z);
  }
  if (vote < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
}
// an ellipse ring in the xz plane at height y, n points, optional offsets; front (+z) can be flattened or pushed
export function ring(y, rx, rz, n = 10, cx = 0, cz = 0, squash = 0) {
  const r = []; for (let s = 0; s < n; s++) { const a = (s / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); r.push(new THREE.Vector3(cx + rx * sn, y, cz + rz * c * (c < 0 ? 1 - squash : 1))); } return r;
}

// Flat shape extruded along z (depth), centred on z. pts: [[x, y], ...] counter-clockwise.
export function extrude(pts, depth, holes) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2); return g;
}

// A leaf: lies along +z from its stalk at the origin, face up (+y). Folded along the midrib (a crease the ink
// line finds), tip curling down by `curl` radians. len, wid in metres. kind: 0 oval, 1 pointed, 2 round, 3 heart.
export function leafGeo(len, wid, fold = 0.35, curl = 0.3, kind = 0, segs = 4) {
  const P = [], I = [], prof = (t) => kind === 2 ? Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.15 * t)
    : kind === 1 ? Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - 0.5 * t)
    : kind === 3 ? Math.min(1, 0.55 + 2.2 * t) * Math.pow(Math.max(0, 1 - t), 0.6) * 1.25
    : Math.sin(Math.PI * Math.pow(t, 0.85));
  const up = Math.sin(fold), out = Math.cos(fold);
  for (let k = 0; k <= segs; k++) {
    const t = k / segs, a = curl * t * t, z = len * (t - curl * 0.12 * t * t), y = -len * 0.5 * a * t, w = 0.5 * wid * prof(Math.max(0.02, Math.min(0.98, t)));
    const yy = y, zz = z; P.push(0, yy, zz, -w * out, yy + w * up, zz, w * out, yy + w * up, zz);
  }
  for (let k = 0; k < segs; k++) { const a = k * 3, b = a + 3; I.push(a, a + 1, b + 1, a, b + 1, b, a, b, b + 2, a, b + 2, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  return flat(g);
}

// eased state follower for view-side easings (never changes an outcome)
export const follow = (cur, goal, dt, rate = 6) => cur + (goal - cur) * (1 - Math.exp(-dt * rate));
