// OWNER: B (world). The twelve gift pots. Each plant is a function of (species, growth, lift): it is regrown
// on the CPU whenever one of those moves, so a dry plant really hangs and a watered one really stands up.
// One mesh per pot (pot, soil, tag and plant together), vertex coloured.
import * as THREE from 'three';
import { SHELF } from '../core/layout.js';
import { Batch, box, quad, xf, col, mix, paint, tube, V, ball, lathe, disc, leafGeo, lerp, clamp, smooth } from './kit.js';
import { POST, TOP_U } from './shelf.js';

export const SOIL_Y = 0.172;
const leafCache = new Map();
const PUMPKIN_DRY = mix('amber', 'giftLeafDry', 0.45);
const leaf = (len, wid, kind, fold = 0.35, curl = 0.3) => {
  const k = `${len.toFixed(3)}|${wid.toFixed(3)}|${kind}|${fold}|${curl}`;
  if (!leafCache.has(k)) leafCache.set(k, leafGeo(len, wid, fold, curl, kind, 3));
  return leafCache.get(k);
};
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
// seedlings are drawn a third bigger than life, or they vanish at play scale
const G3 = (g, a, b, c) => g <= 1 ? lerp(a * 1.3, b, clamp(g)) : lerp(b, c, clamp(g - 1));
const EAST_AZ = Math.atan2(0.56, -0.83), LS = 1.5;

// the plant builder: every species draws with these three strokes
class PB {
  constructor(b, L, fresh, pot) { this.b = b; this.L = L; this.pot = pot; this.n = 0; this.fresh = col(fresh); this.dry = mix('giftLeafDry', 'tag', 0.22);
    this.stemC = mix(mix('stem', 'giftLeafDry', 0.55), 'stem', L); }
  leafC(tint, dry) { const h = hash(this.pot, this.n++), c = (dry || this.dry).clone().lerp(tint ? col(tint) : this.fresh, 0.06 + 0.94 * this.L); return c.multiplyScalar(0.9 + 0.2 * h); }
  // a stem from `base`: azimuth az, lean (radians from upright at the tip when standing), droop (extra when dry)
  stem(base, az, lean, len, droop = 1.8, r0 = 0.009, r1 = 0.005, n = 5, fixed = false) {
    const pts = [base.clone()], L = fixed ? 1 : this.L; let p = base.clone();
    for (let k = 0; k < n; k++) { const s = (k + 0.5) / n, th = lean * Math.pow(s, 0.7) + (1 - L) * droop * Math.pow(s, 1.5);
      p = p.clone().add(V(Math.sin(th) * Math.sin(az), Math.cos(th), Math.sin(th) * Math.cos(az)).multiplyScalar(len / n)); pts.push(p); }
    this.b.add(tube(pts, (t) => lerp(r0, r1, t) * 1.35, 4), this.stemC);
    const at = (s) => { const f = clamp(s) * n, i = Math.min(n - 1, Math.floor(f)); return pts[i].clone().lerp(pts[i + 1], f - i); };
    return { pts, at, tip: pts[n], az };
  }
  // a leaf at a point: azimuth, elevation when standing (radians above level), size, kind
  leaf(at, az, elev, len, wid, kind = 0, o = {}) {
    const e = lerp(o.hang ?? -1.4, elev, this.L) + (hash(this.pot, this.n) - 0.5) * 0.2;
    const k = o.exact ? 1 : LS;
    this.b.add(leaf(len * k, wid * k * 1.1, kind, o.fold ?? 0.3, o.curl ?? 0.3), this.leafC(o.tint, o.dry), xf(at.x, at.y, at.z, -e, az, 0));
  }
  // three (or n) leaflets fanned from one point
  fan(at, az, elev, len, wid, kind, n = 3, spread = 0.75, o = {}) { for (let j = 0; j < n; j++) { const d = j - (n - 1) / 2; this.leaf(at, az + d * spread, elev - Math.abs(d) * 0.12, len * (d ? 0.82 : 1), wid * (d ? 0.82 : 1), kind, o); } }
  // leaves up a stem: spiral (golden angle) or opposite pairs
  along(st, count, s0, s1, fn, pairs = false) {
    for (let i = 0; i < count; i++) { const s = count === 1 ? s1 : lerp(s0, s1, i / (count - 1)), p = st.at(s);
      if (pairs) { const a = st.az + (i % 2) * Math.PI / 2; fn(p, a, i, s); fn(p, a + Math.PI, i, s); } else fn(p, st.az + 0.8 + i * 2.4, i, s); }
  }
  blob(at, r, colour, sy = 1) { this.b.add(ball(r, 7, 5), colour, xf(at.x, at.y, at.z, 0, 0, 0, 1, sy, 1)); }
  flower(at, az, tilt, r, petals, colour, heart, kind = 2) {
    const M = xf(at.x, at.y, at.z, tilt, az, 0);
    for (let j = 0; j < petals; j++) this.b.add(leaf(r, r * 0.62, kind, 0.25, 0.2), colour, M.clone().multiply(xf(0, 0, 0, -0.25, (j / petals) * Math.PI * 2, 0)));
    this.b.add(ball(r * 0.3, 6, 4), heart, M.clone().multiply(xf(0, r * 0.08, 0, 0, 0, 0, 1, 0.6, 1)));
  }
}

const O = () => V(0, SOIL_Y, 0);
const SPECIES = [
  // 0 tomato: Mum's seed
  { fresh: mix('giftLeaf', 'leaf', 0.22), grow(pb, g) {
    const st = pb.stem(O(), 0.6, 0.1, G3(g, 0.17, 0.36, 0.6), 2.0, G3(g, 0.008, 0.011, 0.014), 0.006, 6);
    const n = Math.round(G3(g, 3, 4, 6)), ll = G3(g, 0.075, 0.095, 0.11);
    pb.along(st, n, 0.35, 1, (p, a, i, s) => { if (g < 0.5 && i < 2) pb.leaf(p, a, 0.25, 0.07, 0.035, 0); else pb.fan(p, a, 0.35, ll * (1.1 - 0.3 * s), ll * 0.5, 1); });
    if (g > 1.5) { const p = st.at(0.5), q = p.clone().add(V(0.05, -0.02 - 0.03 * (1 - pb.L), 0.05)); pb.b.add(tube([p, q], 0.004, 4), pb.stemC); pb.blob(q.add(V(0, -0.035, 0)), 0.043, mix('giftLeaf', 'leafLight', 0.5)); }
  } },
  // 1 basil
  { fresh: mix('giftLeaf', 'leafLight', 0.25), grow(pb, g) {
    const h = G3(g, 0.1, 0.19, 0.28), ll = G3(g, 0.065, 0.085, 0.1), st = pb.stem(O(), 2.2, 0.06, h, 1.7, 0.009, 0.006, 5);
    pb.along(st, Math.round(G3(g, 2, 3, 4)), 0.45, 1, (p, a, i, s) => pb.leaf(p, a, 0.3, ll * (1.15 - 0.35 * s), ll * 0.72, 2, { fold: 0.55 }), true);
    if (g > 1.5) for (const az of [0.4, 2.6, 4.6]) { const s2 = pb.stem(st.at(0.3), az, 0.75, h * 0.62, 1.5, 0.006, 0.004, 4); pb.along(s2, 2, 0.6, 1, (p, a) => pb.leaf(p, a, 0.3, ll * 0.8, ll * 0.58, 2, { fold: 0.55 }), true); }
  } },
  // 2 chilli: taking its time
  { fresh: mix('giftLeaf', 'stem', 0.35), grow(pb, g) {
    const st = pb.stem(O(), 4.0, 0.12, G3(g, 0.13, 0.21, 0.36), 1.9, 0.007, 0.004, 6), ll = G3(g, 0.07, 0.085, 0.11);
    pb.along(st, Math.round(G3(g, 3, 4, 6)), 0.4, 1, (p, a) => pb.leaf(p, a, 0.2, ll, ll * 0.4, 1));
    if (g > 1.5) { const p = st.at(0.72).add(V(0.035, 0.0, 0.03)); pb.flower(p, 0.8, 1.9 - 0.5 * pb.L, 0.04, 5, col('paper'), mix('amber', 'giftLeaf', 0.4), 0); }
  } },
  // 3 marigold: keeps the bugs honest
  { fresh: mix('giftLeaf', 'leaf', 0.4), grow(pb, g) {
    const h = G3(g, 0.1, 0.2, 0.3), st = pb.stem(O(), 1.0, 0.08, h, 1.8, 0.008, 0.006, 5), ll = G3(g, 0.05, 0.06, 0.07);
    pb.along(st, Math.round(G3(g, 2, 3, 5)), 0.3, 0.85, (p, a) => { const pet = pb.stem(p, a, 1.2, ll * 1.4, 1.2, 0.004, 0.003, 3); pb.fan(pet.tip, a, 0.1, ll, ll * 0.34, 1, 3, 0.7); pb.fan(pet.at(0.5), a, 0.1, ll * 0.8, ll * 0.3, 1, 2, 1.6); });
    if (g > 1.5) pb.flower(st.tip.clone().add(V(0, 0.012, 0)), 0.5, 0.35 + 0.9 * (1 - pb.L), 0.062, 11, mix('potLit', 'amber', 0.5).multiplyScalar(1.5), mix('pot', 'amber', 0.4));
    else if (g > 0.5) pb.b.add(lathe([[0, 0], [0.02, 0.012], [0.024, 0.03], [0.012, 0.05], [0, 0.056]], 6), mix('giftLeaf', 'stem', 0.5), xf(st.tip.x, st.tip.y - 0.005, st.tip.z, 0.3 + 1.2 * (1 - pb.L), 1.0, 0));
  } },
  // 4 the mystery (a pumpkin, of course)
  { fresh: mix('giftLeaf', 'leafLight', 0.3), grow(pb, g) {
    const st = pb.stem(O(), 3.0, 0.2, G3(g, 0.06, 0.09, 0.12), 0.9, 0.013, 0.011, 3);
    for (const s of [0, 1]) pb.leaf(st.tip, 1.2 + s * Math.PI, 0.3, 0.085, 0.06, 2, { fold: 0.2 });
    const n = Math.round(G3(g, 0, 2, 5)), ll = G3(g, 0.1, 0.13, 0.2);
    for (let i = 0; i < n; i++) { const a = 0.4 + i * 2.2, pet = pb.stem(st.tip, a, G3(g, 0.7, 0.8, 1.05), ll * G3(g, 0.6, 0.7, 1.0), 1.3, 0.008, 0.006, 4); pb.leaf(pet.tip, a, 0.12, ll, ll * 1.05, 3, { fold: 0.06, curl: 0.35, dry: PUMPKIN_DRY }); }   // nearly flat, so a leaf is one colour and not two halves; thirsty, it goes straw yellow, not grey
    // and once it is plain what it is: one small pumpkin, sitting on the soil
    if (g > 1.5) pb.b.add(lathe([[0, 0], [0.03, 0.004], [0.047, 0.022], [0.05, 0.04], [0.042, 0.06], [0.02, 0.072], [0, 0.068]], 10), (p) => mix('amber', 'pot', 0.45 + 0.25 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 4))), xf(0.062, SOIL_Y - 0.004, 0.05, 0, 0.4, 0));
  } },
  // 5 bean: for the stairwell rail. It leaves the pot on night two.
  { fresh: col('giftLeaf'), grow(pb, g, vine) {
    if (g < 0.5) { const st = pb.stem(O(), 1.6, 0.1, 0.13, 1.9, 0.007, 0.005, 5); for (const s of [0, 1]) pb.leaf(st.tip, 0.4 + s * Math.PI, 0.3, 0.085, 0.085, 3); return; }
    const pts = vine(g), n = pts.length;
    pb.b.add(tube(pts, (t) => lerp(0.0085, 0.005, t), 4, true), pb.stemC);
    const every = g > 1.5 ? 3 : 3;
    for (let i = 2; i < n - 1; i += every) { const d = pts[i + 1].clone().sub(pts[i - 1]), a = Math.atan2(d.x, d.z) + (i % 2 ? 1.4 : -1.4); pb.fan(pts[i], a, 0.15, 0.085, 0.075, 3, 3, 0.9); }
    for (const s of [0, 1]) pb.leaf(pts[2], 0.4 + s * Math.PI, 0.3, 0.07, 0.07, 3);
  } },
  // 6 tomato again, in case
  { fresh: mix('giftLeaf', 'leaf', 0.3), grow(pb, g) { SPECIES[0].grow(pb, g * 0.72); } },
  // 7 mint: keep it in the pot
  { fresh: mix('giftLeaf', 'leafLight', 0.5), grow(pb, g) {
    const n = Math.round(G3(g, 3, 4, 6)), ll = G3(g, 0.048, 0.055, 0.06);
    for (let i = 0; i < n; i++) { const a = i * 2.4 + 0.3, trail = g > 1.5 && i % 3 === 0, st = pb.stem(V(Math.sin(a) * 0.03, SOIL_Y, Math.cos(a) * 0.03), a, trail ? 2.3 : 0.25 + 0.5 * hash(7, i), G3(g, 0.1, 0.16, trail ? 0.3 : 0.22), trail ? 0.5 : 1.7, 0.006, 0.004, 5);
      pb.along(st, Math.round(G3(g, 2, 3, trail ? 5 : 4)), 0.35, 1, (p, aa) => pb.leaf(p, aa, 0.25, ll, ll * 0.66, 0), true); }
  } },
  // 8 sunflower: too tall for 4B
  { fresh: mix('giftLeaf', 'stem', 0.22), grow(pb, g) {
    const st = pb.stem(O(), EAST_AZ, 0.07, G3(g, 0.2, 0.44, 0.74), 1.7, G3(g, 0.009, 0.013, 0.016), 0.009, 7), ll = G3(g, 0.09, 0.13, 0.16);
    pb.along(st, Math.round(G3(g, 2, 4, 6)), 0.3, 0.88, (p, a, i, s) => pb.leaf(p, a, 0.15, ll * (1.1 - 0.3 * s), ll * 0.85, 3, { curl: 0.5 }));
    const nod = 0.9 + 1.0 * (1 - pb.L);
    if (g > 1.5) { const M = xf(st.tip.x, st.tip.y, st.tip.z, nod, EAST_AZ, 0), pc = mix('joHat', 'amber', 0.5).multiplyScalar(1.25);
      for (let j = 0; j < 13; j++) pb.b.add(leaf(0.075, 0.034, 1, 0.2, 0.2), pc, M.clone().multiply(xf(0, 0.01, 0, -0.12, (j / 13) * Math.PI * 2, 0)));
      pb.b.add(lathe([[0, 0], [0.055, 0], [0.05, 0.02], [0, 0.028]], 8), mix('cedar', 'soil', 0.4), M); pb.b.add(lathe([[0, -0.03], [0.03, -0.02], [0.055, 0], [0, 0]], 8), pb.stemC, M); }
    else if (g > 0.5) { const M = xf(st.tip.x, st.tip.y, st.tip.z, nod * 0.8, EAST_AZ, 0); pb.b.add(lathe([[0, -0.01], [0.03, 0], [0.036, 0.025], [0.02, 0.05], [0, 0.06]], 7), mix('giftLeaf', 'stem', 0.4), M);
      for (let j = 0; j < 6; j++) pb.b.add(leaf(0.05, 0.022, 1, 0.2, 0.2), pb.leafC(), M.clone().multiply(xf(0, 0.012, 0, -0.75, j * 1.05, 0))); }
  } },
  // 9 parsley: slow
  { fresh: mix('giftLeaf', 'leaf', 0.5), grow(pb, g) {
    const n = Math.round(G3(g, 3, 4, 6));
    for (let i = 0; i < n; i++) { const a = i * 2.4, st = pb.stem(V(Math.sin(a) * 0.015, SOIL_Y, Math.cos(a) * 0.015), a, 0.35 + 0.5 * hash(9, i), G3(g, 0.075, 0.1, 0.14) * (0.8 + 0.4 * hash(3, i)), 1.9, 0.004, 0.003, 4); pb.fan(st.tip, a, 0.3, G3(g, 0.04, 0.045, 0.055), 0.03, 0, 3, 0.9); }
  } },
  // 10 strawberry: for whoever waters
  { fresh: mix('giftLeaf', 'leafDark', 0.28), grow(pb, g) {
    const n = Math.round(G3(g, 3, 4, 6)), ll = G3(g, 0.045, 0.055, 0.062);
    for (let i = 0; i < n; i++) { const a = i * 2.4 + 0.5, st = pb.stem(O(), a, 0.75 + 0.3 * hash(10, i), G3(g, 0.06, 0.09, 0.11), 1.2, 0.005, 0.004, 4); pb.fan(st.tip, a, 0.1, ll, ll * 0.85, 2, 3, 1.0); }
    if (g > 0.5) { const st = pb.stem(O(), 0.9, 0.5, 0.13, 1.4, 0.004, 0.003, 4); pb.flower(st.tip, 0.9, 0.5 + 0.8 * (1 - pb.L), 0.036, 5, col('paper'), col('amber'), 2); }
    if (g > 1.5) { const st = pb.stem(O(), 3.6, 1.5, 0.13, 0.6, 0.004, 0.003, 4); pb.b.add(lathe([[0, 0], [0.022, 0.006], [0.026, 0.028], [0.012, 0.05], [0, 0.052]], 6), mix('tamCap', 'pot', 0.2).multiplyScalar(1.2), xf(st.tip.x, st.tip.y, st.tip.z, Math.PI, 0, 0)); }
  } },
  // 11 no tag: it came up by itself
  { fresh: mix('stem', 'giftLeaf', 0.45), grow(pb, g) {
    const st = pb.stem(V(0.035, SOIL_Y, -0.02), 5.2, 0.16, G3(g, 0.1, 0.2, 0.33), 1.9, 0.006, 0.004, 6), ll = G3(g, 0.05, 0.065, 0.08);
    pb.along(st, Math.round(G3(g, 2, 4, 7)), 0.5, 1, (p, a) => pb.leaf(p, a, 0.3, ll, ll * 0.55, 0));
  } },
];

export function buildPots(ctx, state) {
  const group = new THREE.Group(), views = [];
  // the bean's road: from its pot to the shelf's end post, then up it, in pot-local coordinates
  const p5 = state.pots[5].pos, px = POST.x - p5.x, pz = POST.z - p5.z, py = -(TOP_U);
  const vine = (g) => {
    const pts = [V(0, SOIL_Y, 0), V(0.01, SOIL_Y + 0.07, 0), V(0.05, SOIL_Y + 0.15, -0.03), V(0.14, SOIL_Y + 0.17, -0.07), V(0.24, SOIL_Y + 0.1, -0.12), V(px - 0.06, 0.2, pz + 0.03)];
    const topY = g > 1.5 ? py + POST.h + 0.02 : 0.52, turns = g > 1.5 ? 3.2 : 1.1, y0 = 0.2, n = g > 1.5 ? 20 : 8;
    for (let k = 1; k <= n; k++) { const t = k / n, a = Math.PI + t * turns * Math.PI * 2; pts.push(V(px + Math.cos(a) * 0.058, lerp(y0, topY, t), pz + Math.sin(a) * 0.058)); }
    if (g > 1.5) pts.push(V(px - 0.08, py + POST.h + 0.13, pz + 0.02), V(px - 0.17, py + POST.h + 0.18, pz + 0.05));
    return pts;
  };
  const potC = [mix('pot', 'potLit', 0.12), mix('pot', 'potShade', 0.18), col('pot')];
  const potProf = [[0, 0], [0.085, 0], [0.116, 0.158], [0.132, 0.16], [0.132, 0.2], [0.113, 0.2], [0.107, SOIL_Y], [0, SOIL_Y]];
  const potGeo = lathe(potProf, 16);
  const soilDry = mix('soil', 'tag', 0.32), soilWet = col('soilWet'), tmp = new THREE.Color();   // dry soil is pale and dusty; wet is dark
  state.pots.forEach((p, i) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), paint.lit2()); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(p.pos.x, p.pos.y - 0.135, p.pos.z); mesh.rotation.y = (hash(i, 4) - 0.5) * 0.8; group.add(mesh);
    views.push({ mesh, key: '', i });
  });
  function regrow(v, p, lift, wet) {
    const b = new Batch(), i = v.i, sp = SPECIES[i], g = p.growth, body = potC[i % 3];
    // a dark ring of spilt water on the plank round a pot that has been watered tonight: it stays till morning
    if (wet > 0.05) b.add(disc(0.165 + 0.05 * wet, 14), mix('cedarWarm', 'soilWet', 0.35 + 0.45 * wet), xf(0.02, 0.003, 0.03));
    b.add(potGeo, (q, n) => {
      const r = Math.hypot(q.x, q.z);
      if (n.y > 0.5 && r < 0.11 && q.y < SOIL_Y + 0.004) return tmp.copy(soilDry).lerp(soilWet, wet).clone();
      if (n.y < -0.2 || (r < 0.114 && q.y > SOIL_Y)) return mix('potShade', 'soil', 0.2);
      return q.y > 0.158 ? body.clone().lerp(col('potLit'), 0.3) : body.clone().lerp(col('potShade'), wet * 0.35 * smooth(0.02, 0.15, q.y));
    });
    if (i !== 11) { const a = 0.9 + hash(i, 2) * 0.8;   // the neighbour's tag, on a stick
      const M = xf(Math.sin(a) * 0.085, SOIL_Y, Math.cos(a) * 0.085, -0.12, a, 0.12 * (hash(i, 9) - 0.5));
      b.add(box(0.012, 0.2, 0.006), mix('tray', 'tag', 0.3), M.clone().multiply(xf(0, 0.06, 0))); b.add(box(0.09, 0.115, 0.006), 'tag', M.clone().multiply(xf(0, 0.2, 0.004)));
      b.add(box(0.06, 0.012, 0.007), mix('tag', 'textInk', 0.5), M.clone().multiply(xf(-0.005, 0.22, 0.006))); b.add(box(0.045, 0.012, 0.007), mix('tag', 'textInk', 0.5), M.clone().multiply(xf(-0.012, 0.19, 0.006))); }
    const inv = xf(0, 0, 0, 0, -v.mesh.rotation.y, 0);     // species are authored in shelf axes; the pot itself is turned a little
    const pb = new PB(new Batch(), lift, sp.fresh, i); sp.grow(pb, g, vine);
    b.add(pb.b.geometry(), null, inv);
    v.mesh.geometry.dispose(); v.mesh.geometry = b.geometry();
  }
  return {
    group, materials: views.map((v) => v.mesh.material),
    // where a pot is shown when it is not on its shelf (in the tray, or being set out). null = on the shelf.
    setAt(i, v) { views[i].at = v; },
    soil(i, out) { const p = state.pots[i].pos; return out.set(p.x, p.y - 0.135 + SOIL_Y, p.z); },
    // the height of the top of pot i's plant as drawn now (world y), so the cup can be held above its leaves
    top(i) { const m = views[i].mesh, g = m.geometry; if (!g.boundingBox || g.userData.bbFor !== g.attributes.position.version) { g.computeBoundingBox(); g.userData.bbFor = g.attributes.position.version; }
      m.updateMatrixWorld(true); return g.boundingBox.max.y * m.matrixWorld.elements[5] + m.matrixWorld.elements[13]; },
    // the leaf of pot i nearest a world point (a green vertex well above the soil and the tag), in world space
    leafNear(i, from, out) {
      const m = views[i].mesh, g = m.geometry, P = g.attributes.position, C = g.attributes.color; m.updateMatrixWorld(true);
      let best = Infinity; const w = new THREE.Vector3();
      for (let k = 0; k < P.count; k++) {
        if (P.getY(k) < SOIL_Y + 0.12) continue;
        const r = C.getX(k), gr = C.getY(k), bl = C.getZ(k); if (!(gr > r * 1.1 && gr > bl)) continue;
        w.fromBufferAttribute(P, k).applyMatrix4(m.matrixWorld); const d = w.distanceTo(from);
        if (d < best) { best = d; out.copy(w); }
      }
      if (best === Infinity) this.soil(i, out).y += 0.3;
      return out;
    },
    update(dt, state) {
      const k = 1 - Math.exp(-dt * 2.0);
      state.pots.forEach((p, i) => {
        const v = views[i], at = v.at; v.mesh.visible = !!p.present || !!at;
        p.lift += ((p.watered ? 1 : 0) - p.lift) * k; p.wetShown += ((p.wet || 0) - p.wetShown) * k;
        if (at) v.mesh.position.copy(at); else v.mesh.position.set(p.pos.x, p.pos.y - 0.135, p.pos.z);
        if (!v.mesh.visible) return;
        const lift = Math.round(clamp(p.lift) * 40) / 40, wet = Math.round(clamp(p.wetShown) * 10) / 10, key = `${p.growth}|${lift}|${wet}`;
        if (key !== v.key) { v.key = key; regrow(v, p, ease3(lift), wet); }
      });
    },
  };
}
const ease3 = (t) => t * t * (3 - 2 * t);
void SHELF; void quad;
