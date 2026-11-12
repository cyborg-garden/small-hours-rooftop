// OWNER: B (world). The roof slab, the cut section face (the shadowbox front), the parapet, the building below.
// The section is drawn, not empty: slab bands, brick courses and hatching on a canvas, and three rooms of
// people asleep cut open in deep indigo. Only the stairwell is warm.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { ROOF, HATCH } from '../core/layout.js';
import { Batch, box, quad, xf, col, mix, shade, paint, extrude, cyl, tube, V, lathe } from './kit.js';

export const SHAFT = { x0: -6.9, x1: HATCH.x1, bottom: -11, floor1: -HATCH.depth, floor2: -5.2 };
export const ROOMS = [   // cut-open rooms: [x0, x1, yTop, yFloor]
  [-2.45, 1.9, -0.6, -2.6], [2.2, 6.7, -0.6, -2.6], [-2.45, 2.9, -3.2, -5.2], [3.2, 6.7, -3.2, -5.2],
];
const SEC_W = ROOF.x1 - ROOF.x0, SEC_H = -SHAFT.bottom;

function sectionTexture(rng) {
  const W = 1536, H = Math.round(W * SEC_H / SEC_W), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), X = (x) => (x - ROOF.x0) / SEC_W * W, Y = (y) => -y / SEC_H * H, S = W / SEC_W;
  g.fillStyle = PAL.section; g.fillRect(0, 0, W, H);
  // brick courses: broken, hand-ruled strokes, lighter than the wash
  g.lineCap = 'round';
  for (let y = -0.5; y > SHAFT.bottom; y -= 0.15) {
    let x = ROOF.x0 + rng() * 0.4;
    while (x < ROOF.x1) {
      const len = rng.range(0.5, 2.4), a = rng.range(0.1, 0.34);
      g.strokeStyle = `rgba(108,118,170,${a})`; g.lineWidth = rng.range(1, 2.2);
      g.beginPath(); g.moveTo(X(x), Y(y) + rng.range(-1, 1)); g.lineTo(X(x + len), Y(y) + rng.range(-1.5, 1.5)); g.stroke();
      if (rng() < 0.5) { const jx = x + rng() * len; g.beginPath(); g.moveTo(X(jx), Y(y)); g.lineTo(X(jx) + rng.range(-1, 1), Y(y - 0.15)); g.stroke(); }
      x += len + rng.range(0.15, 1.1);
    }
  }
  // cut concrete: the roof slab and each floor, paler, hatched on the diagonal
  const slab = (y0, y1) => {
    g.fillStyle = PAL.sectionEdge; g.fillRect(0, Y(y0), W, Y(y1) - Y(y0));
    g.save(); g.beginPath(); g.rect(0, Y(y0), W, Y(y1) - Y(y0)); g.clip(); g.lineWidth = 1.3;
    for (let x = -1; x < SEC_W + 1; x += rng.range(0.07, 0.13)) { g.strokeStyle = `rgba(154,166,208,${rng.range(0.1, 0.3)})`; g.beginPath(); g.moveTo(x * S, Y(y1)); g.lineTo((x + (y0 - y1)) * S, Y(y0)); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(154,166,208,0.42)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(y1)); g.lineTo(W, Y(y1) + 1); g.stroke();
  };
  slab(0, -ROOF.slab); slab(SHAFT.floor1, SHAFT.floor1 - 0.3); slab(SHAFT.floor2, SHAFT.floor2 - 0.3); slab(-7.8, -8.1);
  // the roof build-up: one pale line of membrane along the very top
  g.fillStyle = 'rgba(120,130,185,0.9)'; g.fillRect(0, 0, W, Math.max(2, 0.05 * S));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}

// one sleeper's room, cut open: floor, back wall, a bed with someone in it, one more thing. All unlit, all indigo.
function room(flatB, [x0, x1, yT, yF], k) {
  const zB = 2.6, w = x1 - x0, h = yT - yF, cx = (x0 + x1) / 2;
  const wall = mix('section', 'deckShade', 0.55), floor = mix('section', 'deckShade', 0.9), dark = shade('section', 0.86), pale = mix('deckShade', 'deck', 0.35);
  flatB.add(quad(w, h), wall, xf(cx, (yT + yF) / 2, zB));
  flatB.add(quad(w, 5 - zB), floor, xf(cx, yF + 0.002, (5 + zB) / 2, -Math.PI / 2));
  flatB.add(quad(w, 5 - zB), dark, xf(cx, yT - 0.002, (5 + zB) / 2, Math.PI / 2));
  flatB.add(quad(5 - zB, h), mix('section', 'deckShade', 0.3), xf(x0 + 0.002, (yT + yF) / 2, (5 + zB) / 2, 0, Math.PI / 2));
  flatB.add(quad(5 - zB, h), mix('section', 'deckShade', 0.75), xf(x1 - 0.002, (yT + yF) / 2, (5 + zB) / 2, 0, -Math.PI / 2));
  // the bed, side on, and the sleeper: a long low hill under a blanket, a head on a pillow
  const flip = k % 2 ? -1 : 1, bx = cx + flip * (w * 0.5 - 1.35), by = yF, bz = 3.6;
  flatB.add(box(2.0, 0.22, 0.95), dark, xf(bx, by + 0.3, bz));
  for (const sx of [-0.95, 0.95]) flatB.add(box(0.07, sx * flip < 0 ? 0.8 : 0.5, 0.95), dark, xf(bx + sx, by + (sx * flip < 0 ? 0.4 : 0.25), bz));
  const hill = [[0, 0], [0.05, 0.13], [0.3, 0.24], [0.62, 0.2], [0.95, 0.27], [1.3, 0.16], [1.5, 0.05], [1.52, 0]].map(([x, y]) => [x * flip, y]);
  flatB.add(extrude(flip > 0 ? hill : hill.reverse(), 0.8), pale, xf(bx - flip * 0.66, by + 0.41, bz));
  flatB.add(box(0.42, 0.1, 0.6), mix('deckShade', 'parapet', 0.5), xf(bx - flip * 0.74, by + 0.46, bz, 0, 0, flip * 0.08));
  flatB.add(new THREE.SphereGeometry(0.105, 8, 6), mix('deckShade', 'deck', 0.15), xf(bx - flip * 0.7, by + 0.58, bz + 0.1, 0, 0, 0, 1.15, 0.9, 1));
  // one more thing per room, so no two are the same
  const ox = cx - flip * (w * 0.5 - 0.7);
  if (k === 0) { flatB.add(box(0.9, 1.75, 0.5), dark, xf(ox, by + 0.875, zB + 0.3)); flatB.add(box(0.02, 1.6, 0.02), wall, xf(ox, by + 0.875, zB + 0.56)); }
  if (k === 1) { flatB.add(box(1.0, 0.05, 0.55), dark, xf(ox, by + 0.72, zB + 0.5)); for (const s of [-0.45, 0.45]) flatB.add(box(0.05, 0.72, 0.5), dark, xf(ox + s, by + 0.36, zB + 0.5));
    flatB.add(box(0.36, 0.26, 0.03), pale, xf(ox + 0.05, by + 0.9, zB + 0.45, 0, 0.2)); flatB.add(box(0.42, 0.85, 0.42), dark, xf(ox - 0.75 * flip, by + 0.42, zB + 0.9)); }
  if (k === 2) { flatB.add(quad(1.1, 1.2), mix('skyLow', 'deckShade', 0.35), xf(ox, by + 1.35, zB + 0.01)); flatB.add(box(0.03, 1.2, 0.03), wall, xf(ox, by + 1.35, zB + 0.02)); flatB.add(box(1.1, 0.03, 0.03), wall, xf(ox, by + 1.35, zB + 0.02));
    flatB.add(cyl(0.16, 0.12, 0.3, 8), dark, xf(ox - 0.2, by + 0.15, zB + 0.5)); flatB.add(new THREE.IcosahedronGeometry(0.3, 0), mix('leafDark', 'section', 0.6), xf(ox - 0.2, by + 0.6, zB + 0.5, 0.4, 0.3, 0, 1, 1.25, 1)); }
  if (k === 3) { for (let i = 0; i < 4; i++) flatB.add(box(1.3, 0.04, 0.3), dark, xf(ox, by + 0.45 + i * 0.42, zB + 0.16));
    for (const s of [-0.65, 0.65]) flatB.add(box(0.04, 1.75, 0.3), dark, xf(ox + s, by + 0.875, zB + 0.16));
    for (let i = 0; i < 7; i++) flatB.add(box(0.08, 0.26 + (i % 3) * 0.04, 0.2), i % 2 ? pale : wall, xf(ox - 0.5 + i * 0.13, by + 0.6 + (i % 2) * 0.42, zB + 0.18, 0, 0, i === 3 ? 0.2 : 0)); }
}

export function buildRoof(ctx) {
  const { lit, flat: flatB, rng } = ctx, R = ROOF, H = HATCH;
  // ---- deck: membrane sheets, slightly different mixes, lapped seams ----------------------------------------
  const sheetW = 1.75, deckY = 0;
  const strip = (x0, x1, z0, z1, c, y = deckY) => { if (x1 - x0 > 1e-4 && z1 - z0 > 1e-4) lit.add(quad(x1 - x0, z1 - z0), c, xf((x0 + x1) / 2, y, (z0 + z1) / 2, -Math.PI / 2)); };
  const cut = (x0, x1, c, y) => {   // a strip of deck in x, with the hatch hole taken out
    strip(x0, x1, R.z0, H.z0, c, y);
    strip(x0, Math.min(x1, H.x0), H.z0, R.z1, c, y); strip(Math.max(x0, H.x1), x1, H.z0, R.z1, c, y);
  };
  for (let x = R.x0, k = 0; x < R.x1 - 0.01; x += sheetW, k++) {
    const c = mix('deck', k % 2 ? 'parapet' : 'deckShade', 0.07 + rng() * 0.08);
    cut(x, Math.min(R.x1, x + sheetW), c);
    if (k) cut(x - 0.03, x + 0.03, mix('deck', 'deckShade', 0.55), 0.004);
  }
  // a worn, paler track where feet go: hatch to shelf to barrel
  for (const [x0, x1, z0, z1] of [[-2.7, 4.2, 2.75, 3.4], [3.4, 4.2, 2.3, 2.75]]) strip(x0, x1, z0, z1, mix('deck', 'parapet', 0.3), 0.006);
  // ---- parapet: back and both sides, with a coping lip; two drain notches in the back ----------------------
  const pc = (p, n) => n.y > 0.5 ? mix('parapet', 'chalk', 0.12) : col('parapet');
  const cope = mix('parapet', 'chalk', 0.3);
  const wallRun = (x, z, w, d) => { lit.add(box(w, R.parapetH, d), pc, xf(x, R.parapetH / 2, z)); lit.add(box(w + 0.08, 0.08, d + 0.08), cope, xf(x, R.parapetH + 0.03, z)); };
  wallRun(0, R.z0 + R.parapetT / 2, SEC_W, R.parapetT);
  wallRun(R.x0 + R.parapetT / 2, 0.15, R.parapetT, 10 - 0.3); wallRun(R.x1 - R.parapetT / 2, 0.15, R.parapetT, 10 - 0.3);
  for (const x of [-3.2, 4.4]) flatB.add(box(0.34, 0.13, 0.04), shade('section', 0.8), xf(x, 0.075, R.z0 + R.parapetT + 0.012));
  // a soil vent stack and a low skylight kerb at the back left: quiet shapes that break the parapet line
  lit.add(cyl(0.07, 0.07, 1.5, 8), 'barrelBand', xf(-6.1, 0.75, -4.2)); lit.add(lathe([[0.07, 0], [0.16, 0.05], [0.16, 0.09], [0, 0.2]], 8), 'barrelBand', xf(-6.1, 1.5, -4.2));
  // ---- the building: side walls with dark windows -------------------------------------------------------------
  const side = (x, ry) => { lit.add(quad(10, SEC_H + R.parapetH), 'parapetShade', xf(x, (R.parapetH + SHAFT.bottom) / 2, 0, 0, ry));
    for (let f = 0; f < 4; f++) for (const z of [-2.8, 0, 2.8]) flatB.add(quad(1.0, 1.3), mix('cityNear', 'section', 0.5), xf(x + (x < 0 ? -0.01 : 0.01), -1.5 - f * 2.6, z, 0, ry)); };
  side(R.x0, -Math.PI / 2); side(R.x1, Math.PI / 2);
  // ---- the cut section face ------------------------------------------------------------------------------------
  // two pieces, so the stairwell is a true notch through the slab: the strip left of the shaft, and everything right of it
  const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const sL = poly([[R.x0, 0], [R.x0, SHAFT.bottom], [SHAFT.x0, SHAFT.bottom], [SHAFT.x0, -R.slab], [H.x0, -R.slab], [H.x0, 0]]);
  const s = poly([[SHAFT.x1, 0], [SHAFT.x1, SHAFT.bottom], [R.x1, SHAFT.bottom], [R.x1, 0]]);
  for (const [x0, x1, yT, yF] of ROOMS) s.holes.push(new THREE.Path([[x0, yT], [x0, yF], [x1, yF], [x1, yT]].map(([x, y]) => new THREE.Vector2(x, y))));
  const sg = new THREE.ShapeGeometry([sL, s]), uv = sg.attributes.uv, pos = sg.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - R.x0) / SEC_W, 1 + pos.getY(i) / SEC_H);
  sg.translate(0, 0, R.z1);
  let secMat; try { secMat = paint.flat(); secMat.vertexColors = false; secMat.map = sectionTexture(rng); secMat.needsUpdate = true; } catch (_) { secMat = paint.flat(); }
  const sec = new THREE.Mesh(sg, secMat); sec.castShadow = false; sec.receiveShadow = false;
  // cut ends of the two side parapets
  for (const x of [R.x0 + R.parapetT / 2, R.x1 - R.parapetT / 2]) flatB.add(quad(R.parapetT, R.parapetH), 'sectionEdge', xf(x, R.parapetH / 2, R.z1 + 0.001));
  ROOMS.forEach((r, k) => room(flatB, r, k));
  // a dark floor to the world, far below, so an orbit never finds the edge of the paper
  flatB.add(quad(400, 400), shade('cityNear', 0.8), xf(0, SHAFT.bottom - 0.5, -60, -Math.PI / 2));
  void tube; void V;
  return { section: sec };
}
