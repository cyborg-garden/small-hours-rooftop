// OWNER: B (world). The gift shelf: two stepped tiers of planks on stepped end boards, an offcut of stair rail
// as its right end post (the bean's rail), and the crate with the spare sensor in its wrapper.
import * as THREE from 'three';
import { SHELF, ANCHORS } from '../core/layout.js';
import { Batch, box, xf, col, mix, shade, paint, extrude, cyl, tube, V, ball, follow, lerp, ease, smooth } from './kit.js';

export const TOP_U = SHELF.upper.y + 0.025, TOP_L = SHELF.lower.y + 0.025;
export const POST = { x: 0.07, z: SHELF.upper.z - 0.165, h: 1.22 };

// a sensor stake: origin at its point. Returns { group, dot (flat material), wrap }.
export function makeStake(withWrap) {
  const b = new Batch();
  b.add(cyl(0.016, 0.006, 0.4, 5), 'marlowBox', xf(0, 0.2, 0));
  b.add(box(0.075, 0.1, 0.045), 'marlowBox', xf(0, 0.43, 0));
  b.add(box(0.085, 0.02, 0.055), mix('marlowBox', 'chalk', 0.25), xf(0, 0.49, 0));
  b.add(box(0.05, 0.06, 0.05), 'marlowBox', xf(0, 0.52, 0));
  const g = new THREE.Group(); g.add(b.mesh(paint.lit()));
  const db = new Batch(); db.add(ball(0.052, 8, 6), 'paper', xf(0, 0.54, 0));
  const dot = db.mesh(paint.flat(), { cast: false, receive: false }); g.add(dot);
  let wrap = null;
  if (withWrap) { const w = new Batch(); w.add(box(0.11, 0.2, 0.075), 'tag', xf(0, 0.46, 0)); w.add(box(0.115, 0.03, 0.08), mix('tag', 'tray', 0.5), xf(0, 0.4, 0)); wrap = w.mesh(paint.lit()); g.add(wrap); }
  return { group: g, dot: dot.material, wrap };
}

export function buildShelf(ctx) {
  const { lit, rng } = ctx, S = SHELF;
  const wood = (k) => mix('cedarWarm', k % 2 ? 'tray' : 'stairTread', 0.1 + rng() * 0.22);
  const endGrain = (c) => (p, n) => Math.abs(n.x) > 0.5 ? c.clone().multiplyScalar(0.7) : c;
  // planks: two boards per tier, ends not quite level
  const tier = (y, z, x0, x1) => { for (const s of [-1, 1]) { const a = x0 + rng.range(-0.03, 0.05), b = x1 + rng.range(-0.02, 0.07);
    lit.add(box(b - a, 0.05, S.depth / 2 - 0.008), endGrain(wood(s)), xf((a + b) / 2, y, z + s * S.depth / 4, 0, rng.range(-0.006, 0.006))); } };
  tier(S.upper.y, S.upper.z, S.x0 + 0.02, S.x1 - 0.02); tier(S.lower.y, S.lower.z, S.x0 + 0.12, S.x1 - 0.02);
  // stepped end boards with cut-out feet (shape drawn in z,y and stood across the shelf)
  const zb = S.upper.z - S.depth / 2 + 0.01, zm = S.upper.z + S.depth / 2 + 0.02, zf = S.lower.z + S.depth / 2 - 0.01, yu = S.upper.y - 0.025, yl = S.lower.y - 0.025;
  const sidePts = [[zb, 0], [zb + 0.1, 0], [zb + 0.17, 0.11], [zf - 0.17, 0.11], [zf - 0.1, 0], [zf, 0], [zf, yl], [zm, yl], [zm, yu], [zb, yu]];
  for (const x of [S.x0 + 0.3, S.x1 - 0.22]) lit.add(extrude(sidePts, 0.045), (p, n) => Math.abs(n.x) > 0.5 ? mix('cedarWarm', 'stairTread', 0.5) : mix('cedarWarm', 'stairTread', 0.7), xf(x, 0, 0, 0, -Math.PI / 2));
  lit.add(box(S.x1 - S.x0 - 0.5, 0.07, 0.03), mix('cedarWarm', 'stairTread', 0.6), xf((S.x0 + S.x1) / 2 + 0.04, 0.3, zb + 0.02));   // back stretcher
  // the right end post: a length of old stair rail, lashed on. The bean will find it.
  const P = POST, metal = mix('barrelBand', 'cedar', 0.3);
  const newel = mix('tray', 'stairTread', 0.3);
  lit.add(box(0.07, P.h, 0.07), newel, xf(P.x, P.h / 2, P.z));
  lit.add(box(0.1, 0.03, 0.1), mix('tray', 'cedarWarm', 0.4), xf(P.x, P.h + 0.015, P.z)); lit.add(ball(0.05, 8, 6), newel, xf(P.x, P.h + 0.07, P.z));
  lit.add(box(0.09, 0.05, 0.09), mix('tray', 'cedarWarm', 0.4), xf(P.x, P.h - 0.2, P.z));
  for (const y of [0.2, 0.44]) lit.add(cyl(0.05, 0.05, 0.035, 6), 'tag', xf(P.x, y, P.z));                                 // twine lashings
  // the crate
  const c = ANCHORS.sensor.pos, cx = c.x + 0.03, cz = c.z, cw = 0.4, cd = 0.3, crate = (k) => mix('cedar', 'cedarWarm', 0.25 + 0.15 * (k % 3));
  for (let k = 0; k < 2; k++) { const y = 0.065 + k * 0.115;
    lit.add(box(cw, 0.095, 0.014), crate(k), xf(cx, y, cz + cd / 2)); lit.add(box(cw, 0.095, 0.014), crate(k + 1), xf(cx, y, cz - cd / 2));
    lit.add(box(0.014, 0.095, cd), crate(k + 2), xf(cx - cw / 2, y, cz)); lit.add(box(0.014, 0.095, cd), crate(k), xf(cx + cw / 2, y, cz)); }
  lit.add(box(cw, 0.014, cd), shade('cedar', 0.7), xf(cx, 0.012, cz));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lit.add(box(0.03, 0.25, 0.03), crate(1), xf(cx + sx * (cw / 2 - 0.02), 0.125, cz + sz * (cd / 2 - 0.02)));
  lit.add(box(cw - 0.06, 0.05, cd - 0.06), mix('tag', 'cedar', 0.55), xf(cx, 0.06, cz, 0, 0.1));   // wood wool
  // the spare sensor
  const st = makeStake(true); st.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const inCrate = { p: V(cx - 0.02, 0.03, cz + 0.02), rz: 0.42, rx: -0.2 }, inBean = { p: V(ANCHORS.p5.pos.x + 0.085, TOP_U + 0.1, S.upper.z + 0.05), rz: 0.05, rx: 0 };
  const byTomato = { p: V(ANCHORS.p6.pos.x + 0.07, TOP_L + 0.1, S.lower.z + 0.07), rz: -0.04, rx: 0.03 };   // tied to the second tomato, on the front tier: in plain view, clear of an arm going by
  const cAmber = col('amber'), cGreen = col('marlow'), cDead = mix('barrelBand', 'marlowBox', 0.3), cur = new THREE.Color().copy(cAmber);
  // the feed line that maintenance fits once the shelf is on record (sensor ending, the night after)
  const fb = new Batch(), fy = 1.22, fzc = (S.upper.z + S.lower.z) / 2;
  for (const x of [S.x0 + 0.85, S.x1 - 0.3]) {   // (round fourteen: two hoops, not three. The one at the shelf's end by her chair stood between the phone's reading camera and the near pot, a pale band down the picture)
    const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push(V(x, fy * Math.sin(a) + 0.01, fzc + Math.cos(a) * 0.46)); } fb.add(tube(pts, 0.016, 5), 'barrelBand'); }
  fb.add(tube([V(S.x0 + 0.75, fy, fzc), V(S.x1 - 0.2, fy, fzc)], 0.02, 5), 'barrelBand');
  for (let k = 0; k < 3; k++) fb.add(cyl(0.012, 0.03, 0.06, 5), 'marlowBox', xf(S.x0 + 1.05 + k * 0.6, fy - 0.045, fzc));
  const feed = fb.mesh(paint.quiet()); feed.visible = false;
  const group = new THREE.Group(); group.add(st.group, feed);
  const tmp = new THREE.Vector3();
  return {
    group, stake: st, stakeMaterials: [st.group.children[0].material, st.dot], crateP: inCrate.p, beanP: inBean.p,
    // carry: 0..1 while Jo's hand has it (plant action), grip: world point of her hand
    update(dt, state, carry, grip) {
      const epi = state.night >= 4, sensor = state.marlow.shelfSensor, prop = state.stakeAsProp && epi;
      let pose = inCrate; if (sensor) pose = inBean; if (prop) pose = byTomato;
      st.group.position.copy(pose.p); st.group.rotation.set(pose.rx, 0, pose.rz);
      if (!sensor && carry > 0 && grip) {     // in her hand, on its way from the crate to the bean pot
        const k = ease(smooth(0.0, 1, carry));
        tmp.copy(grip); tmp.y -= 0.3; st.group.position.lerpVectors(inCrate.p, tmp, smooth(0, 0.25, carry)).lerp(inBean.p, smooth(0.62, 1, carry));
        st.group.position.y += Math.sin(Math.PI * k) * 0.05; st.group.rotation.set(0, 0, lerp(inCrate.rz, inBean.rz, smooth(0.1, 0.6, carry)));
      }
      st.wrap.visible = !sensor && !prop && !(carry > 0.2);
      cur.lerp(sensor ? cGreen : state.stakeAsProp ? cDead : cAmber, 1 - Math.exp(-dt * 3)); st.dot.color.copy(cur);
      feed.visible = sensor && epi;
    },
  };
}
