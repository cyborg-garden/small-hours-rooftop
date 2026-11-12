// OWNER: B (world). The three kitchen beds: cedar boards, hoops with a mist line and four heads, rows of chard,
// lettuce and herbs (instanced, swayed on the CPU), a sensor stake with its dot, the feed lines, the brass tap.
import * as THREE from 'three';
import { BEDS, ANCHORS } from '../core/layout.js';
import { Batch, box, xf, col, mix, shade, paint, tube, V, ball, cyl, leafGeo, lathe, follow, quad } from './kit.js';

export function buildBeds(ctx) {
  const { lit, rng } = ctx, group = new THREE.Group(), dots = [], plants = [];
  const pipe = 'barrelBand';
  // leaf clusters, one geometry per crop
  const cluster = (n, len, wid, kind, tilt0, tilt1, fold, curl, cA, cB) => {
    const b = new Batch();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rng() * 0.5, tilt = tilt0 + (tilt1 - tilt0) * rng(), s = 0.75 + rng() * 0.5, c = mix(cA, cB, rng());
      b.add(leafGeo(len * s, wid * s, fold, curl, kind, 3), (p, nn) => c, xf(Math.sin(a) * 0.02, 0, Math.cos(a) * 0.02, tilt - Math.PI / 2, a, 0)); }
    return b.geometry();
  };
  const crops = [
    { geo: cluster(6, 0.46, 0.2, 0, 0.25, 0.6, 0.35, 0.5, 'leaf', 'leafLight'), rows: 2, per: 6, s: 1 },        // chard: tall, upright
    { geo: cluster(9, 0.26, 0.24, 2, 0.75, 1.25, 0.5, 0.25, 'leafLight', 'leaf'), rows: 2, per: 7, s: 1 },      // lettuce: low rosettes
    { geo: cluster(11, 0.3, 0.07, 1, 0.15, 0.95, 0.2, 0.35, 'leafDark', 'leaf'), rows: 3, per: 8, s: 1 },       // herbs: fine and dark
  ];
  BEDS.forEach((b, bi) => {
    const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2, top = b.h;
    // boards: three courses, the mix changes board to board
    for (let k = 0; k < 3; k++) { const y = top / 6 + k * top / 3, c = () => mix('cedar', k % 2 ? 'parapetShade' : 'cedarWarm', 0.1 + rng() * 0.14);
      lit.add(box(b.w, top / 3 - 0.012, 0.05), c(), xf(b.x, y, z0 + 0.025)); lit.add(box(b.w, top / 3 - 0.012, 0.05), c(), xf(b.x, y, z0 + b.d - 0.025));
      lit.add(box(0.05, top / 3 - 0.012, b.d - 0.1), c(), xf(x0 + 0.025, y, b.z)); lit.add(box(0.05, top / 3 - 0.012, b.d - 0.1), c(), xf(x0 + b.w - 0.025, y, b.z)); }
    for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) lit.add(box(0.09, top + 0.05, 0.09), shade('cedar', 0.85), xf(x0 + 0.02 + sx * (b.w - 0.04), (top + 0.05) / 2, z0 + 0.02 + sz * (b.d - 0.04)));
    lit.add(box(b.w - 0.1, 0.03, b.d - 0.1), mix('soilWet', 'soil', 0.3), xf(b.x, top - 0.05, b.z));
    // hoops and the mist line
    const hy = 0.78, hz = b.d / 2 - 0.04;
    for (const hx of [-b.w / 2 + 0.12, 0, b.w / 2 - 0.12]) { const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push(V(b.x + hx, top - 0.05 + hy * Math.sin(a), b.z + hz * Math.cos(a))); } lit.add(tube(pts, 0.016, 5, false), pipe); }
    lit.add(tube([V(x0 + 0.1, top + hy - 0.07, b.z), V(x0 + b.w - 0.1, top + hy - 0.07, b.z)], 0.02, 5), pipe);
    for (let k = 0; k < 4; k++) lit.add(cyl(0.012, 0.03, 0.06, 5), 'marlowBox', xf(b.x - 0.9 + k * 0.6, top + hy - 0.11, b.z));
    // sensor stake with its dot
    const sx = b.x + b.w / 2 - 0.3, sz = b.z + 0.36;
    lit.add(cyl(0.016, 0.008, 0.5, 5), 'marlowBox', xf(sx, top + 0.2, sz)); lit.add(box(0.075, 0.1, 0.045), 'marlowBox', xf(sx, top + 0.46, sz));
    const db = new Batch(); db.add(ball(0.05, 8, 6), 'paper', xf(sx, top + 0.56, sz));
    const dot = db.mesh(paint.flat(), { cast: false, receive: false }); group.add(dot); dots.push({ m: dot.material, k: 0 });
    // crop rows
    const crop = crops[bi % 3], count = crop.rows * crop.per, im = new THREE.InstancedMesh(crop.geo, paint.lit2(), count), list = [];
    for (let r = 0; r < crop.rows; r++) for (let i = 0; i < crop.per; i++) {
      list.push({ x: x0 + 0.28 + (i + (r % 2) * 0.5) * ((b.w - 0.56) / (crop.per - 0.5)) + rng.range(-0.04, 0.04), z: b.z + (crop.rows === 1 ? 0 : (r / (crop.rows - 1) - 0.5) * (b.d - 0.42)) + rng.range(-0.03, 0.03),
        ry: rng() * 6.28, s: rng.range(0.82, 1.18), ph: rng() * 6.28, y: top - 0.035 });
    }
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; group.add(im); plants.push({ im, list });
  });
  // feed lines along the front of the beds: line one, two, three. Line two has the tap.
  const fz = BEDS[0].z + BEDS[0].d / 2 + 0.06, v = ANCHORS.valve.pos, m = ANCHORS.marlow.pos;
  lit.add(tube([V(BEDS[0].x + 1.2, 0.03, fz + 0.05), V(m.x + 0.12, 0.03, fz + 0.05), V(BEDS[2].x - 1.2, 0.03, fz + 0.05)], 0.02, 5), pipe);
  // the risers up to the mist line. Bed B's stands a hand's width behind its tap, so the tap's handle turns free of it
  for (const [x, hasTap] of [[BEDS[0].x + 1.2, 0], [v.x, 1], [BEDS[2].x - 1.2, 0]]) { const bz = hasTap ? fz - 0.11 : fz - 0.02;
    lit.add(tube([V(x, 0.03, fz + 0.05), V(x, 0.05, hasTap ? fz - 0.06 : fz), V(x, 0.1, bz), V(x, BEDS[0].h + 0.72, bz), V(x, BEDS[0].h + 0.72, BEDS[0].z)], 0.018, 5), pipe); }
  // the brass tap (its own mesh: it breathes on night three) and its paper seal
  // a brass standpipe off the feed line, a bib tap on top with a big cross handle, the spout out over the deck.
  // Big on purpose: on night three this is the only water, and it has to be found from across the roof.
  const tb = new Batch(), brass = mix('amber', 'barrelBand', 0.2), brassLit = mix('amber', 'copperLit', 0.35), tz = fz;
  tb.add(cyl(0.03, 0.03, 0.4, 8), brass, xf(v.x, v.y - 0.18, tz));                                           // riser from the feed
  tb.add(cyl(0.058, 0.058, 0.15, 8), brass, xf(v.x, v.y + 0.04, tz));                                         // body
  tb.add(tube([V(v.x, v.y + 0.03, tz), V(v.x, v.y + 0.03, tz + 0.15), V(v.x, v.y - 0.03, tz + 0.21), V(v.x, v.y - 0.1, tz + 0.215)], (t) => 0.036 - 0.009 * t, 7), brass);   // spout
  tb.add(cyl(0.022, 0.022, 0.12, 6), brass, xf(v.x, v.y + 0.17, tz));                                         // stem
  tb.add(box(0.22, 0.03, 0.03), brassLit, xf(v.x, v.y + 0.24, tz, 0, 0.5)); tb.add(box(0.03, 0.03, 0.22), brassLit, xf(v.x, v.y + 0.24, tz, 0, 0.5));   // cross handle
  tb.add(cyl(0.04, 0.04, 0.045, 8), brassLit, xf(v.x, v.y + 0.24, tz));
  const tap = tb.mesh(paint.lit()); group.add(tap);
  const sb = new Batch();   // the paper seal maintenance fits: round the handle, a tag hanging off the spout
  sb.add(box(0.14, 0.06, 0.09), 'tag', xf(v.x, v.y + 0.24, tz, 0, 0.5)); sb.add(quad(0.11, 0.17), 'tag', xf(v.x + 0.02, v.y - 0.02, tz + 0.23, 0.12, 0, 0.1));
  sb.add(quad(0.11, 0.04), mix('tamCap', 'tag', 0.35), xf(v.x + 0.02, v.y + 0.01, tz + 0.233, 0.12, 0, 0.1));
  const seal = sb.mesh(paint.lit2()); seal.visible = false; group.add(seal);
  const on = col('marlow'), off = col('marlowDim'), d = new THREE.Object3D();
  return {
    group, tapMaterial: tap.material, spout: V(v.x, v.y - 0.11, tz + 0.215), handle: V(v.x, v.y + 0.24, tz), bedsTop: BEDS[0].h + 0.72,
    update(dt, state) {
      dots.forEach((q, i) => { q.k = follow(q.k, state.marlow.beds[i] ? 1 : 0, dt, 4.5); q.m.color.copy(off).lerp(on, q.k); });
      seal.visible = !!state.valve.sealed;
      const t = state.time, calm = state.reducedMotion ? 0 : 1;
      for (const { im, list } of plants) {
        list.forEach((q, i) => { d.position.set(q.x, q.y, q.z); d.rotation.set(Math.sin(t * 0.7 + q.ph) * 0.035 * calm, q.ry, Math.sin(t * 0.53 + q.ph * 1.7) * 0.03 * calm); d.scale.setScalar(q.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
        im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
