// OWNER: B (world). The city: three depth layers on arcs behind the roof, stepped silhouettes, water towers,
// one crane. Flat paint only. Eleven windows are lit on the first night and seven after it, and a train of
// small lights crosses the far layer every ninety seconds.
import * as THREE from 'three';
import { Batch, box, quad, xf, col, mix, shade, paint, cyl, lathe, follow, clamp } from './kit.js';

export function buildCity(ctx) {
  const { flat: B, rng } = ctx, group = new THREE.Group(), spots = [];
  const face = (base) => (p, n) => n.y > 0.5 ? base.clone().lerp(col('haze'), 0.16) : Math.abs(n.z) > 0.6 ? base : base.clone().multiplyScalar(0.84);
  const layers = [
    { key: 'cityFar', d: 118, n: 30, top: 6, var: 11, w: [9, 20], win: 0 },
    { key: 'cityMid', d: 64, n: 21, top: 2, var: 8, w: [7, 14], win: 1 },
    { key: 'cityNear', d: 31, n: 12, top: -1.5, var: 3.6, w: [6, 11], win: 2 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const th = ((i + 0.5) / L.n - 0.5) * 2.9 + rng.range(-0.03, 0.03), d = L.d + rng.range(-0.1, 0.1) * L.d;
      const w = rng.range(L.w[0], L.w[1]), dep = rng.range(8, 14), top = L.top + rng.range(-1, 1) * L.var + (rng() < 0.14 ? L.var * 1.3 : 0), h = 70;
      const base = mix(L.key, rng() < 0.5 ? 'cityMid' : 'cityFar', rng() * 0.22), M = xf(Math.sin(th) * d, 0, -Math.cos(th) * d, 0, -th);
      const put = (g, c, m) => B.add(g, c, M.clone().multiply(m));
      put(box(w, h, dep), face(base), xf(0, top - h / 2, 0));
      put(box(w + 0.5, 0.5, dep + 0.5), face(base.clone().multiplyScalar(1.07)), xf(0, top + 0.05, 0));       // parapet line
      const r = rng();
      if (r < 0.45) { const w2 = w * rng.range(0.35, 0.6), h2 = rng.range(2.5, 7) * (L.win === 0 ? 1.6 : 1); put(box(w2, h2, dep * 0.6), face(base), xf(rng.range(-0.2, 0.2) * w, top + h2 / 2, 0)); }   // setback
      else if (r < 0.75) {   // water tower: a drum on legs with a conical hat
        const s = L.win === 2 ? 1 : 1.25, tx = rng.range(-0.3, 0.3) * w, tz = dep * 0.2;
        put(lathe([[0, 1.6 * s], [1.3 * s, 1.6 * s], [1.3 * s, 3.9 * s], [1.45 * s, 4.0 * s], [0, 5.0 * s]], 8), face(base.clone().multiplyScalar(0.92)), xf(tx, top, tz));
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(box(0.18 * s, 1.7 * s, 0.18 * s), base.clone().multiplyScalar(0.8), xf(tx + a * 0.9 * s, top + 0.85 * s, tz + b * 0.9 * s));
      } else if (r < 0.9) { put(box(2.2, 2.6, 2.6), face(base), xf(rng.range(-0.3, 0.3) * w, top + 1.3, 0)); put(box(0.12, 4.5, 0.12), base.clone().multiplyScalar(0.8), xf(rng.range(-0.4, 0.4) * w, top + 2.25, dep * 0.3)); }
      // windows: dark panes in a grid on the face that looks at us
      if (L.win) {
        const bay = L.win === 2 ? 2.2 : 2.9, flo = L.win === 2 ? 2.9 : 3.3, cols = Math.max(2, Math.floor((w - 1.2) / bay)), rows = L.win === 2 ? 5 : 9, pane = base.clone().multiplyScalar(0.8);
        for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
          if (rng() < 0.12) continue;
          const wx = (cc - (cols - 1) / 2) * bay, wy = top - 1.7 - rr * flo, ww = bay * 0.5, wh = flo * 0.5;
          put(quad(ww, wh), pane, xf(wx, wy, dep / 2 + 0.03));
          if (Math.abs(th) < 0.46 && rr < (L.win === 2 ? 2 : 4) && rr > 0) spots.push({ m: M.clone().multiply(xf(wx, wy, dep / 2 + 0.07)), w: ww, h: wh, th, near: L.win === 2, r: rng() });
        }
      }
    }
  }
  // one crane, left of centre, in the far layer
  { const th = -0.33, d = 104, M = xf(Math.sin(th) * d, 0, -Math.cos(th) * d, 0, -th + 0.5), c = shade('cityFar', 0.9), put = (g, m) => B.add(g, c, M.clone().multiply(m));
    put(box(0.9, 44, 0.9), xf(0, 0, 0)); put(box(26, 0.7, 0.7), xf(8, 22, 0)); put(box(8, 0.7, 0.7), xf(-6, 22, 0)); put(box(2.2, 1.8, 1.4), xf(-8.6, 21.2, 0));
    put(box(0.25, 5, 0.25), xf(0, 24.5, 0)); put(box(13.5, 0.2, 0.2), xf(6.2, 24.4, 0, 0, 0, -0.38)); put(box(7.2, 0.2, 0.2), xf(-3.2, 24.6, 0, 0, 0, 0.7)); }
  // the viaduct the train runs on, in front of the far layer
  const railY = -6.5, railD = 96;
  B.add(box(260, 0.9, 1.2), shade('cityFar', 0.85), xf(0, railY - 1, -railD));
  for (let x = -120; x <= 120; x += 16) B.add(box(1.4, 30, 1.2), shade('cityFar', 0.85), xf(x, railY - 16, -railD));
  // lit windows: eleven on night one, seven after. One mesh, colours eased.
  const lit = [], pick = spots.slice().sort((a, b) => a.r - b.r), chosen = [];
  for (const s of pick) { if (chosen.length >= 12) break; if (chosen.every((q) => Math.abs(q.th - s.th) > 0.035 || q.near !== s.near)) chosen.push(s); }
  const wb = new Batch(); chosen.forEach((s) => wb.add(quad(s.w, s.h), 'paper', s.m));
  const wins = wb.mesh(paint.flat(), { cast: false, receive: false }); group.add(wins);
  const warm = col('winWarm'), cool = col('winCool'), dark = shade('cityMid', 0.8), tmp = new THREE.Color();
  chosen.forEach((s, i) => lit.push({ k: i < 11 ? 1 : 0, c: i % 3 === 1 ? cool : warm }));
  // which windows are lit on which night: 0..10 on night one; four go out; on night three one more goes out and the twelfth comes on
  const isLit = (i, night) => night <= 1 ? i < 11 : night === 2 ? i < 11 && ![2, 5, 8, 9].includes(i) : (i < 11 && ![2, 5, 8, 9, 0].includes(i)) || i === 11;
  // the train
  const tb = new Batch(); for (let i = 0; i < 9; i++) tb.add(quad(1.5, 0.75), i === 0 ? 'winCool' : 'winWarm', xf(i * 3.1, 0, 0));
  const train = tb.mesh(paint.flat(), { cast: false, receive: false }); train.position.set(0, railY + 0.5, -railD + 0.8); group.add(train);
  let first = true;
  return {
    group, cityMaterials: [wins.material],
    update(dt, state) {
      const C = wins.geometry.attributes.color; let moved = false;
      lit.forEach((q, i) => { const goal = isLit(i, state.night) ? 1 : 0; if (first) q.k = goal; if (Math.abs(q.k - goal) > 0.003 || first) { q.k = follow(q.k, goal, dt, 2); tmp.copy(dark).lerp(q.c, q.k); for (let v = 0; v < 4; v++) C.setXYZ(i * 4 + v, tmp.r, tmp.g, tmp.b); moved = true; } });
      if (moved) C.needsUpdate = true; first = false;
      const ph = ((state.time + 52) % 90) / 90;                    // in view for about 45 s of every 90
      train.position.x = -150 + ph * 2 * 300; train.visible = ph < 0.5;
    },
  };
}
