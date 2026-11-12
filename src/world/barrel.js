// OWNER: B (world). The rain barrel (staves, bands, a sight gauge that shows the level), the water tank that feeds
// it, the folding chair and the jar. Also the copper cup model, which is made once and used everywhere.
import * as THREE from 'three';
import { BARREL, TANK, ANCHORS, ROOF } from '../core/layout.js';
import { Batch, box, xf, col, mix, shade, paint, tube, V, ball, cyl, lathe, disc, follow, quad, extrude } from './kit.js';

// The copper cup. Origin at the centre of its base; the handle is on -z; it pours over the +z lip.
export const CUP = { r: 0.068, h: 0.13 };
export function cupGeometry() {
  const b = new Batch(), cu = (p, n) => (n.y > 0.5 || Math.hypot(p.x, p.z) < CUP.r * 0.8) ? mix('copper', 'barrelBand', 0.55) : mix('copper', 'copperLit', 0.18);
  b.add(lathe([[0, 0], [0.05, 0], [CUP.r, CUP.h], [CUP.r - 0.012, CUP.h], [0.04, 0.02], [0, 0.02]], 10), cu);
  b.add(lathe([[CUP.r - 0.004, CUP.h - 0.012], [CUP.r + 0.008, CUP.h - 0.006], [CUP.r + 0.008, CUP.h + 0.004], [CUP.r - 0.012, CUP.h + 0.004]], 10), 'copperLit');   // rolled rim
  b.add(tube([V(0, CUP.h - 0.015, -CUP.r + 0.004), V(0, CUP.h - 0.01, -CUP.r - 0.045), V(0, CUP.h - 0.05, -CUP.r - 0.06), V(0, 0.035, -CUP.r - 0.035), V(0, 0.03, -0.05)], 0.011, 5), 'copper');
  return b.geometry();
}
export function makeCup() { const m = new THREE.Mesh(cupGeometry(), paint.lit2()); m.castShadow = true; return m; }

export function buildBarrel(ctx) {
  const { lit, flat: flatB, rng } = ctx, B = BARREL, T = TANK, group = new THREE.Group();
  // ---- barrel ---------------------------------------------------------------------------------------------------
  const bb = new Batch(), y0 = B.stand, prof = []; const R = (t) => B.r * (0.9 + 0.1 * Math.sin(Math.PI * (0.12 + 0.8 * t)));
  for (let k = 0; k <= 6; k++) prof.push([R(k / 6), y0 + B.h * k / 6]);
  for (let s = 0; s < 14; s++) bb.add(lathe(prof, 1, true, Math.PI * 2 / 14, s * Math.PI * 2 / 14), mix('barrel', s % 2 ? 'tank' : 'marlowBox', 0.12 + rng() * 0.2), xf(B.x, 0, B.z));
  for (const t of [0.2, 0.78]) bb.add(lathe([[R(t) + 0.004, y0 + B.h * t - 0.035], [R(t) + 0.018, y0 + B.h * t - 0.035], [R(t) + 0.018, y0 + B.h * t + 0.035], [R(t) + 0.004, y0 + B.h * t + 0.035]], 14), 'barrelBand', xf(B.x, 0, B.z));
  const rt = R(1);   // turned lip, then the inside going down into the dark
  bb.add(lathe([[rt, y0 + B.h], [rt + 0.02, y0 + B.h + 0.015], [rt + 0.02, y0 + B.h + 0.04], [rt - 0.045, y0 + B.h + 0.04], [rt - 0.045, y0 + 0.08], [0, y0 + 0.08]], 14),
    (p, n) => n.y > 0.5 && p.y > y0 + B.h ? mix('barrel', 'chalk', 0.25) : (Math.hypot(p.x - B.x, p.z - B.z) < rt - 0.03 ? shade('barrelBand', 0.72) : col('barrel')), xf(B.x, 0, B.z));
  for (const s of [-1, 1]) bb.add(box(0.44, B.stand, 0.94), (p, n) => n.y > 0.5 ? mix('parapetShade', 'parapet', 0.5) : mix('parapetShade', 'parapet', 0.2), xf(B.x + s * 0.25, B.stand / 2, B.z));
  // sight gauge on the side the camera and Jo see: a dark slot, a pale float bar that falls as the barrel empties
  const ga = 2.3, gx = B.x + Math.cos(ga) * (B.r + 0.012), gz = B.z + Math.sin(ga) * (B.r + 0.012), gry = Math.PI / 2 - ga, gh = B.h * 0.74, gy = y0 + B.h * 0.13;
  bb.add(box(0.1, gh + 0.06, 0.03), 'barrelBand', xf(gx, gy + gh / 2, gz, 0, gry));
  for (const yy of [gy - 0.02, gy + gh + 0.02]) bb.add(box(0.13, 0.035, 0.05), mix('barrelBand', 'marlowBox', 0.4), xf(gx, yy, gz, 0, gry));
  const hookX = B.x - B.r - 0.02, hookY = y0 + B.h + 0.03;
  for (const hz of [0.14, -0.16]) bb.add(tube([V(hookX + 0.06, hookY, B.z + hz), V(hookX - 0.02, hookY + 0.01, B.z + hz), V(hookX - 0.03, hookY - 0.07, B.z + hz), V(hookX - 0.0, hookY - 0.1, B.z + hz)], 0.011, 5), 'barrelBand');
  const barrel = bb.mesh(paint.lit()); group.add(barrel);
  const gb = new Batch(); gb.add(box(0.055, 1, 0.016).translate(0, 0.5, 0), 'paper');
  const bar = gb.mesh(paint.flat(), { cast: false, receive: false }); bar.position.set(gx + Math.cos(ga) * 0.012, gy, gz + Math.sin(ga) * 0.012); bar.rotation.y = gry; group.add(bar);
  const wb = new Batch(); wb.add(disc(rt - 0.046, 14), 'paper');
  const water = wb.mesh(paint.flat(), { cast: false, receive: false }); water.position.set(B.x, y0 + 0.1, B.z); group.add(water);
  const cGauge = mix('water', 'barrel', 0.3), cGaugeLow = mix('water', 'barrel', 0.6), cWater = mix('water', 'barrel', 0.5);
  // the cups that hang on the barrel
  const cupA = makeCup(), cupB = makeCup();
  cupA.position.set(hookX - 0.105, hookY - 0.2, B.z + 0.14); cupB.position.set(hookX - 0.105, hookY - 0.2, B.z - 0.16);
  for (const c of [cupA, cupB]) { c.rotation.set(0, Math.PI / 2, 0); group.add(c); }
  // ---- tank -------------------------------------------------------------------------------------------------------
  const ty = T.legs, tp = [[0, ty], [T.r - 0.03, ty]];
  for (let k = 0; k < 5; k++) { const y = ty + 0.04 + k * (T.h - 0.08) / 5, d = (T.h - 0.08) / 5; tp.push([T.r, y + d * 0.1], [T.r, y + d * 0.42], [T.r - 0.035, y + d * 0.5], [T.r - 0.035, y + d * 0.92]); }
  tp.push([T.r, ty + T.h - 0.02], [T.r + 0.04, ty + T.h], [T.r + 0.04, ty + T.h + 0.03], [0.1, ty + T.h + 0.36], [0.1, ty + T.h + 0.42], [0, ty + T.h + 0.42]);
  lit.add(lathe(tp, 16), (p, n) => n.y > 0.4 ? mix('tank', 'barrel', 0.6) : col('tank'), xf(T.x, 0, T.z));
  const steel = 'barrelBand', lx = 0.56;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lit.add(box(0.09, T.legs, 0.09), steel, xf(T.x + sx * lx, T.legs / 2, T.z + sz * lx));
  for (const s of [-1, 1]) { lit.add(box(2 * lx + 0.09, 0.09, 0.07), steel, xf(T.x, T.legs - 0.05, T.z + s * lx)); lit.add(box(0.07, 0.09, 2 * lx + 0.09), steel, xf(T.x + s * lx, T.legs - 0.05, T.z)); }
  const diag = Math.hypot(2 * lx, T.legs - 0.25), da = Math.atan2(T.legs - 0.25, 2 * lx);
  for (const s of [-1, 1]) { lit.add(box(diag, 0.045, 0.02), steel, xf(T.x, T.legs / 2 - 0.05, T.z + lx + 0.04, 0, 0, s * da)); lit.add(box(diag, 0.045, 0.02), steel, xf(T.x - lx - 0.04, T.legs / 2 - 0.05, T.z, 0, Math.PI / 2, s * da)); }
  // ladder up the camera side
  const ladX = T.x - 0.35, ladZ = T.z + T.r + 0.1, ladH = T.legs + T.h + 0.25;
  for (const s of [-1, 1]) lit.add(tube([V(ladX + s * 0.2, 0, ladZ + 0.3), V(ladX + s * 0.2, T.legs, ladZ + 0.05), V(ladX + s * 0.2, ladH, ladZ + 0.02), V(ladX + s * 0.2, ladH + 0.12, ladZ - 0.15)], 0.02, 5), steel);
  for (let k = 1; k < 10; k++) { const y = k * 0.3, z = y < T.legs ? ladZ + 0.3 - 0.25 * y / T.legs : ladZ + 0.04; lit.add(box(0.4, 0.03, 0.03), steel, xf(ladX, y, z)); }
  // downpipe: out of the tank, along the inside of the parapet, over the barrel
  const px = ROOF.x1 - ROOF.parapetT - 0.07;
  lit.add(tube([V(T.x + 0.3, ty + 0.1, T.z + T.r - 0.05), V(T.x + 0.3, ty - 0.1, T.z + T.r + 0.1), V(px, 0.72, T.z + T.r + 0.5), V(px, 0.72, B.z + 0.0), V(px - 0.25, 0.9, B.z), V(B.x + 0.3, y0 + B.h + 0.34, B.z), V(B.x + 0.16, y0 + B.h + 0.34, B.z), V(B.x + 0.12, y0 + B.h + 0.2, B.z)], 0.04, 6), mix('tank', 'barrelBand', 0.5));
  for (const z of [-1.6, 0.4, 2.0]) lit.add(box(0.06, 0.1, 0.1), steel, xf(px + 0.06, 0.72, z));
  // ---- chair and jar --------------------------------------------------------------------------------------------
  const c = ANCHORS.chair.pos, cb = new Batch(), CM = xf(c.x, 0, c.z, 0, -0.62), frame = 'barrelBand', slat = mix('tamTrousers', 'barrel', 0.45);
  for (const s of [-1, 1]) {
    cb.add(tube([V(s * 0.2, 0, 0.23), V(s * 0.2, 0.46, -0.17), V(s * 0.2, 0.9, -0.27)], 0.016, 5), frame, CM);
    cb.add(tube([V(s * 0.17, 0, -0.26), V(s * 0.17, 0.46, 0.2)], 0.016, 5), frame, CM);
  }
  cb.add(tube([V(-0.2, 0.07, 0.19), V(0.2, 0.07, 0.19)], 0.012, 5), frame, CM); cb.add(tube([V(-0.17, 0.07, -0.2), V(0.17, 0.07, -0.2)], 0.012, 5), frame, CM);
  for (let k = 0; k < 4; k++) cb.add(box(0.44, 0.022, 0.085), k % 2 ? slat : mix(slat, 'barrel', 0.3), mul2(CM, xf(0, 0.47, 0.18 - k * 0.105)));
  for (const [y, w] of [[0.86, 0.1], [0.7, 0.07]]) cb.add(box(0.44, w, 0.022), slat, mul2(CM, xf(0, y, -0.255 + (0.86 - y) * 0.2, -0.22)));
  const chair = cb.mesh(paint.lit()); group.add(chair); chair.matrixAutoUpdate = false;
  // the night after, by sensor, the chair has been carried to the end of the shelf: the same mesh, moved whole
  const chairHome = new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z).premultiply(new THREE.Matrix4().makeRotationY(0.62));
  let chairKey = '';
  const jb = new Batch(), plum = mix('cedar', 'tamCap', 0.25);
  jb.add(lathe([[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.1], [0.045, 0.118], [0.045, 0.13], [0, 0.13]], 9), (p) => p.y - 0.48 > 0.105 ? col('tag') : plum, mul2(CM, xf(0.03, 0.482, 0.04)));
  jb.add(lathe([[0, 0.128], [0.062, 0.118], [0.066, 0.1], [0.05, 0.118]], 9), 'tag', mul2(CM, xf(0.03, 0.482, 0.04)));           // cloth cover, tied
  jb.add(quad(0.05, 0.07), 'tag', mul2(CM, xf(0.03 + 0.07, 0.52, 0.09, -0.5, 0.5, 0.3)));
  const jar = jb.mesh(paint.lit2()); jar.visible = false; group.add(jar);
  let lvl = 0.8;
  return {
    group, chair, barrelMaterials: [barrel.material], chairMaterials: [chair.material, jar.material], cupA, cupB,
    rim: V(B.x - 0.12, y0 + B.h, B.z + 0.05), waterY: () => water.position.y, centre: V(B.x, 0, B.z),
    update(dt, state) {
      lvl = follow(lvl, state.barrel.level, dt, 1.4);
      bar.scale.y = Math.max(0.02, lvl * gh); bar.material.color.copy(cGaugeLow).lerp(cGauge, Math.min(1, lvl * 2));
      water.position.y = y0 + 0.085 + lvl * (B.h - 0.2); water.material.color.copy(cWater); water.visible = lvl > 0.06;
      const ca = state.chairAt, key = ca ? `${ca.x},${ca.z},${ca.heading}` : '';
      if (key !== chairKey) { chairKey = key;
        if (ca) chair.matrix.makeRotationY(ca.heading).setPosition(ca.x, 0, ca.z).multiply(chairHome); else chair.matrix.identity();
        chair.matrixWorldNeedsUpdate = true; }
      jar.visible = state.night >= 3 && !ca;   // the jam has gone home with someone
      const epi = state.night >= 4;
      cupA.visible = epi && state.ending === 'sensor'; cupB.visible = !!state.secondCup;
    },
  };
}
function mul2(a, b) { return a.clone().multiply(b); }
