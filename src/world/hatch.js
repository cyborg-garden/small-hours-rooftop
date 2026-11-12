// OWNER: B (world). The stair hatch and the stairwell under it: three flights going DOWN into the building,
// the bulkhead lamp, the door of 4B on the landing, the kerb, the cedar lid on its stay.
// Treads match core/layout stairPoint: tread k (1..13) has its top at y = -0.2 k, centred on x = -3.0 - k * RUN.
import * as THREE from 'three';
import { HATCH, ROOF } from '../core/layout.js';
import { Batch, box, quad, xf, col, mix, shade, paint, extrude, cyl, tube, V, lathe, ball, follow, clamp } from './kit.js';
import { SHAFT } from './roof.js';

export const RISE = HATCH.depth / HATCH.steps, RUN = (HATCH.x1 - HATCH.x0 - 0.5) / HATCH.steps, STAIR_X = HATCH.x1 - 0.2;
// height of the walking surface at x inside the top flight (deck = 0), for foot planting
export function treadY(x) {
  const k = Math.round((STAIR_X - x) / RUN);
  return -RISE * clamp(k, 0, HATCH.steps);
}

export function buildHatch(ctx) {
  const { lit, flat: flatB } = ctx, H = HATCH, z0 = H.z0, z1 = H.z1, zc = (z0 + z1) / 2, zd = z1 - z0;
  const stairs = new Batch();   // the hero flight is its own mesh so the hatch can breathe when it is hot
  const warmWall = (p) => mix('stairWall', 'cedar', clamp((-p.y - 2.2) / 4.5) * 0.85);
  const tread = (p) => mix('stairTread', 'section', clamp((-p.y - 2.6) / 4) * 0.6);
  // ---- shaft walls ------------------------------------------------------------------------------------------
  const sh = SHAFT.bottom, hgt = -ROOF.slab - sh;
  lit.add(quad(SHAFT.x1 - SHAFT.x0, hgt), warmWall, xf((SHAFT.x0 + SHAFT.x1) / 2, (-ROOF.slab + sh) / 2, z0));          // back
  // back, through the slab. It stops at the deck: the kerb's own face stands above that, and two faces in one plane
  // fight for every pixel (that was the blue flicker on the warm wall above the steps)
  lit.add(quad(H.x1 - H.x0, ROOF.slab), warmWall, xf((H.x0 + H.x1) / 2, -ROOF.slab / 2, z0));
  lit.add(quad(zd, hgt), (p) => warmWall(p).multiplyScalar(0.86), xf(SHAFT.x0, (-ROOF.slab + sh) / 2, zc, 0, Math.PI / 2)); // left
  lit.add(quad(zd, -sh), (p) => warmWall(p).multiplyScalar(0.9), xf(SHAFT.x1, sh / 2, zc, 0, -Math.PI / 2));             // right
  lit.add(quad(zd, ROOF.slab), 'stairWall', xf(H.x0, -ROOF.slab / 2, zc, 0, Math.PI / 2));
  lit.add(quad(H.x0 - SHAFT.x0, zd), shade('stairWall', 0.8), xf((H.x0 + SHAFT.x0) / 2, -ROOF.slab, zc, Math.PI / 2));  // soffit
  // a painted dado line along the back wall of the top flight: one more thing that says "stairs"
  // ---- flights ----------------------------------------------------------------------------------------------
  // flight(b, x at top, y at top, direction -1 left / +1 right, treads, landing extent)
  const flight = (b, xT, yT, dir, n, land) => {
    for (let k = 1; k <= n; k++) {
      const x = xT + dir * k * RUN, y = yT - k * RISE, last = k === n;
      const w = last && land ? Math.abs(land - (x - dir * RUN / 2)) : RUN + 0.035, cx = last && land ? (land + x - dir * RUN / 2) / 2 : x + dir * 0.0175;
      b.add(box(w, 0.05, zd), tread, xf(cx, y - 0.025, zc));
      b.add(box(0.025, RISE - 0.05, zd), (p) => tread(p).multiplyScalar(0.72), xf(x - dir * (RUN / 2 - 0.02), y + RISE / 2 - 0.025, zc));   // riser
    }
    // the waist under the treads, and its cut end at the section plane (darker: end grain)
    const a = [xT + dir * RUN * 0.5, yT - RISE - 0.05], e = [xT + dir * (n - 0.5) * RUN, yT - n * RISE - 0.05];
    const poly = [a, e, [e[0], e[1] - 0.2], [a[0] - dir * 0.02, a[1] - 0.2]];
    b.add(extrude(dir < 0 ? poly : poly.slice().reverse(), zd - 0.02), (p, nn) => Math.abs(nn.z) > 0.5 ? tread(p).multiplyScalar(0.55) : tread(p).multiplyScalar(0.8), xf(0, 0, zc));
  };
  const topX = STAIR_X;
  // threshold board flush with the deck, then the hero flight down to the landing by 4B
  stairs.add(box(RUN / 2 + 0.2 + 0.035, 0.05, zd), 'stairTread', xf((H.x1 + topX - RUN / 2 - 0.035) / 2, -0.025, zc));
  flight(stairs, topX, 0, -1, H.steps, SHAFT.x0);
  // the flights below: out of the lamp's best light, going on down
  const x2 = topX - (H.steps - 0.5) * RUN;                       // right edge of the first landing
  flight(lit, x2 + RUN / 2, SHAFT.floor1, 1, 13, SHAFT.x1);
  flight(lit, topX, SHAFT.floor2, -1, 13, SHAFT.x0);
  flight(lit, x2 + RUN / 2, SHAFT.floor2 - HATCH.depth, 1, 13, SHAFT.x1);
  // ---- handrail on the back wall (lower half of the hero flight: the lid must be able to shut) ---------------
  const railY = (x) => -RISE * ((topX - x) / RUN) + 0.88;
  stairs.add(tube([V(-5.86, railY(-5.86) - 0.86, z0 + 0.09), V(-5.86, railY(-5.86), z0 + 0.09), V(-5.0, railY(-5.0), z0 + 0.09), V(-4.93, railY(-5.0) - 0.05, z0 + 0.09)], 0.028, 6), 'tray');
  stairs.add(box(0.03, 0.03, 0.09), 'barrelBand', xf(-5.3, railY(-5.3) - 0.04, z0 + 0.045));
  // ---- the door of 4B, on the landing --------------------------------------------------------------------------
  const dx = -6.33, dy = SHAFT.floor1, door = new Batch();
  lit.add(box(0.96, 2.08, 0.05), shade('stairTread', 0.9), xf(dx, dy + 1.04, z0 + 0.025));                 // frame
  lit.add(box(0.8, 1.98, 0.03), mix('tamTrousers', 'barrel', 0.35), xf(dx, dy + 1.0, z0 + 0.055));         // leaf: a cool blue door in a warm wall
  for (const y of [0.55, 1.45]) lit.add(box(0.56, 0.62, 0.012), mix('tamTrousers', 'barrel', 0.6), xf(dx, dy + y, z0 + 0.072));   // two panels
  lit.add(box(0.13, 0.09, 0.012), 'tag', xf(dx, dy + 1.72, z0 + 0.075));                                   // the number plate
  lit.add(ball(0.03, 6, 5), 'copper', xf(dx + 0.3, dy + 1.0, z0 + 0.1));                                   // the knob
  lit.add(box(0.7, 0.02, 0.45), mix('tamCap', 'stairTread', 0.6), xf(dx, dy + 0.012, z0 + 0.32));          // a doormat
  door.add(box(0.74, 0.035, 0.012), 'paper', xf(dx, dy + 0.022, z0 + 0.073));                              // the slit of light under it
  door.add(quad(0.7, 0.3), 'paper', xf(dx, dy + 0.026, z0 + 0.24, -Math.PI / 2));                          // and what it throws on the mat
  const slit = door.mesh(paint.flat(), { cast: false, receive: false });
  // ---- bulkhead lamp --------------------------------------------------------------------------------------------
  const L = H.lamp, lampB = new Batch();
  lit.add(lathe([[0, 0], [0.19, 0], [0.19, 0.03], [0, 0.03]], 12), 'barrelBand', xf(L.x, L.y, z0, Math.PI / 2, 0, 0, 1, 1, 0.66));
  lampB.add(lathe([[0, 0], [0.165, 0], [0.15, 0.05], [0.09, 0.09], [0, 0.1]], 12, true), 'paper', xf(L.x, L.y, z0 + 0.03, Math.PI / 2, 0, 0, 1, 1, 0.66));
  const lamp = lampB.mesh(paint.flat(), { cast: false, receive: false });
  // ---- kerb round the hole (not on the side people step out of, not on the cut front) -------------------------
  const kc = (p, n) => n.y > 0.5 ? mix('parapet', 'chalk', 0.14) : col('parapet');
  lit.add(box(H.x1 - H.x0 + 0.5, H.kerb, 0.16), kc, xf((H.x0 + H.x1) / 2 + 0.1, H.kerb / 2, z0 - 0.08));
  lit.add(box(0.16, H.kerb, zd), kc, xf(H.x0 - 0.08, H.kerb / 2, zc));
  // the grab post at the stair head, on the cut edge
  lit.add(tube([V(-2.7, 0, 4.9), V(-2.7, 0.86, 4.9), V(-2.72, 0.95, 4.86), V(-2.72, 0.98, 4.74), V(-2.72, 0.95, 4.62)], 0.024, 6), 'barrelBand');
  // ---- the lid: five cedar boards, three battens and a brace on the underside, a stay ---------------------------
  const lidB = new Batch(), lw = H.x1 - H.x0 + 0.1, bw = (zd + 0.07) / 5;
  const lc = (k) => (p, n) => n.y < -0.5 ? mix('cedarWarm', 'stairTread', 0.12 + (k % 3) * 0.1) : n.y > 0.5 ? mix('cedar', 'parapet', 0.15 + (k % 2) * 0.12) : mix('cedar', 'cedarWarm', 0.4);
  for (let k = 0; k < 5; k++) lidB.add(box(lw - (k === 1 ? 0.06 : 0), 0.045, bw - 0.012), lc(k), xf(k === 1 ? 0.03 : 0, 0, bw * (k + 0.5)));
  const bat = mix('cedarWarm', 'stairTread', 0.45);
  for (const x of [-lw / 2 + 0.25, 0, lw / 2 - 0.25]) lidB.add(box(0.12, 0.04, zd - 0.1), bat, xf(x, -0.042, (zd + 0.07) / 2));
  for (const s of [-1, 1]) lidB.add(box(1.95, 0.035, 0.1), bat, xf(s * (lw / 4 - 0.06), -0.04, (zd + 0.07) / 2, 0, s * 0.72));
  lidB.add(tube([V(lw / 2 - 0.5, 0.03, zd - 0.12), V(lw / 2 - 0.5, 0.09, zd - 0.2), V(lw / 2 - 0.8, 0.09, zd - 0.2), V(lw / 2 - 0.8, 0.03, zd - 0.12)], 0.016, 5), 'tag');   // rope handle
  const lid = new THREE.Group(); lid.position.set((H.x0 + H.x1) / 2, H.kerb + 0.03, z0 - 0.1);
  const lidMesh = lidB.mesh(paint.lit()); lid.add(lidMesh);
  const stay = new THREE.Mesh(cyl(0.014, 0.014, 1, 5).translate(0, 0.5, 0), paint.lit()); stay.castShadow = true;
  { const b = new Batch(); b.add(stay.geometry, 'barrelBand'); stay.geometry = b.geometry(); }
  const stairMesh = stairs.mesh(paint.lit(), { cast: false });
  const group = new THREE.Group(); group.add(stairMesh, slit, lamp, lid, stay);
  const cOn = col('warm'), cOff = mix('barrelBand', 'cedar', 0.5), cSlit = col('warm'), cSlitOff = shade('stairTread', 0.5), cSpill = mix('warmSpill', 'warm', 0.35), cMat = mix('tamCap', 'stairTread', 0.6);
  let open = 1, lampK = 1, slitK = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    group, stairMaterial: stairMesh.material,
    update(dt, state, slitOn) {
      open = follow(open, state.hatchOpen ? 1 : 0, dt, 2.2); lampK = follow(lampK, state.lampOn ? 1 : 0, dt, 5); slitK = follow(slitK, slitOn ? 1 : 0, dt, 3.5);
      lid.rotation.x = -2.0 * open;                     // open: leaning well back past upright, out of the way of an arm. Shut: flat on the kerb.
      lamp.material.color.copy(cOff).lerp(cOn, lampK);
      // the slit and its spill share one flat mesh: lerp between "nothing there" and warm
      slit.material.color.copy(cSlitOff).lerp(cSlit, slitK); slit.visible = slitK > 0.02;
      // the stay runs from the kerb's far (left) end to a point a third of the way up the lid's edge: the right end, where
      // people come and go past the shelf, is left clear
      lid.updateMatrixWorld(true); a.set(-lw / 2 + 0.04, 0, 0.62).applyMatrix4(lid.matrixWorld); b.set(H.x0 - 0.01, H.kerb, z0 - 0.5);
      stay.visible = open > 0.5; stay.position.copy(b); const d = a.sub(b); stay.scale.set(1, d.length(), 1); stay.quaternion.setFromUnitVectors(up, d.normalize());
      void cSpill; void cMat;
    },
  };
}
