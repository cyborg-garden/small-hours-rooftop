// OWNER: D (game). Where feet may go. The roof is small and full of furniture; a person walking in a
// straight line between two anchors would pass through a chair, a shelf end or an open stair hole.
// This is a tiny visibility graph over the frozen layout: boxes and posts, grown by half a body.
import { HATCH, SHELF, BEDS, BARREL, TANK, ROOF, ANCHORS, stairPoint } from '../core/layout.js';

const BODY = 0.2, EPS = 0.04;
const rect = (x0, x1, z0, z1, grow = BODY) => ({ x0: x0 - grow, x1: x1 + grow, z0: z0 - grow, z1: z1 + grow });
const C = ANCHORS.chair.pos, M = ANCHORS.marlow.pos, S = ANCHORS.sensor.pos;
// the hole with its kerbs and the lid standing behind it; the shelf with the crate at its end; three beds;
// Marlow's post; the chair; the barrel on its blocks; the tank legs
export const BLOCKS = [
  rect(HATCH.x0 - 0.15, HATCH.x1, HATCH.z0 - 0.2, ROOF.z1 + 1, 0.06),
  rect(SHELF.x0, S.x + 0.2, SHELF.upper.z - SHELF.depth / 2, SHELF.lower.z + SHELF.depth / 2 + 0.6, 0.3),   // an arm's swing wider than a body
  ...BEDS.map((b) => rect(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2)),
  rect(M.x - 0.08, M.x + 0.08, M.z - 0.08, M.z + 0.08),
  rect(C.x - 0.27, C.x + 0.27, C.z - 0.3, C.z + 0.27),
  rect(BARREL.x - 0.5, BARREL.x + 0.5, BARREL.z - 0.5, BARREL.z + 0.5),
  rect(TANK.x - 0.65, TANK.x + 0.65, TANK.z - 0.65, TANK.z + 0.65),
];
// The only way on and off the stairs: off the top tread, through the gap between the hole and the shelf end.
export const STAIR_HEAD = { x: stairPoint(0).x, z: stairPoint(0).z };
const GAP = [{ x: -2.78, z: 4.2 }, { x: -2.78, z: 3.58 }];   // between the shelf's end and the open lid, an arm's swing clear of both

const inside = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
// does the open segment a..b pass through the box r (Liang-Barsky)
function crosses(a, b, r) {
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dz, a.z - r.z0], [dz, r.z1 - a.z]]) {
    if (Math.abs(p) < 1e-9) { if (q <= 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}
const CORNERS = BLOCKS.flatMap((r) => [{ x: r.x0 - EPS, z: r.z0 - EPS }, { x: r.x1 + EPS, z: r.z0 - EPS }, { x: r.x0 - EPS, z: r.z1 + EPS }, { x: r.x1 + EPS, z: r.z1 + EPS }])
  .filter((p) => p.z < ROOF.z1 - 0.25 && p.z > ROOF.z0 + 0.5 && p.x > ROOF.x0 + 0.5 && p.x < ROOF.x1 - 0.5 && !BLOCKS.some((r) => inside(p, r)));

// Shortest clear way from a to b as a list of points (b last). A point that sits inside a box (a stand tucked
// against the shelf, the kerb Jo sits on) may be left or reached freely: that box is ignored for its own leg.
function route(a, b) {
  const freeA = BLOCKS.filter((r) => inside(a, r)), freeB = BLOCKS.filter((r) => inside(b, r));
  const clear = (p, q, skip) => !BLOCKS.some((r) => !skip.includes(r) && crosses(p, q, r));
  if (clear(a, b, [...freeA, ...freeB])) return [b];
  const nodes = [a, ...CORNERS, b], n = nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === n - 1) break;
    done[u] = true;
    for (let v = 1; v < n; v++) {
      if (done[v]) continue;
      const skip = [...(u === 0 ? freeA : []), ...(v === n - 1 ? freeB : [])];
      if (!clear(nodes[u], nodes[v], skip)) continue;
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (prev[n - 1] < 0) return [b];            // no clear way found: go straight rather than stand still
  const out = []; for (let i = n - 1; i > 0; i = prev[i]) out.unshift(nodes[i]);
  return out;
}
const onStairHead = (p) => Math.hypot(p.x - STAIR_HEAD.x, p.z - STAIR_HEAD.z) < 0.12;
const inGap = (p) => p.x < -2.55 && p.x > -2.95 && p.z > 3.15 && p.z < 4.4;
// Public: the way from a to b. The gap between the stair hole and the shelf end is a corridor with one mouth:
// anything that starts or ends in it, or on the stair head, goes through that mouth.
const onKerb = (p) => p.x < -2.6 && p.x > -4.6 && p.z < 3.52 && p.z > 3.2;   // the seat on the kerb, with the open lid at its back
// the strip behind the shelf where she stands to pour. Going any distance from it, she steps back out first, so her
// arms swing clear of the plants and the tall end post instead of brushing along them.
const atShelf = (p) => p.x > SHELF.x0 - 0.4 && p.x < 0.9 && p.z > 3.18 && p.z < 3.75 && !inGap(p);
const BACK = 3.08, back = (p) => ({ x: Math.max(p.x, HATCH.x1 + 0.5), z: BACK });   // never closer to the open lid's end than an arm
// The hatch end (the stair head, the gap by the shelf's end, the kerb seat) meets the rest of the roof at one place: the
// squeeze between the open lid's end and the shelf's end. Every way between the two goes through it, so nobody walks
// through the lid.
const SQ = { x: -2.72, z: 3.46 }, SQ_OUT = { x: -2.25, z: 3.02 };
const hatchSide = (p) => onStairHead(p) || inGap(p) || onKerb(p) || (p.x < -2.6 && p.z > 3.3 && p.z < 4.6);
const dedupe = (p, i, l) => i === 0 || p !== l[i - 1];
function near(a, b) {   // both at the hatch end
  if (onKerb(a) && onKerb(b)) return [b];
  if (onKerb(a)) { const o = { x: a.x, z: 3.7 }; return [o, ...near(o, b)]; }     // off the kerb square on, not along the lid
  if (onKerb(b)) return [...near(a, { x: b.x, z: 3.7 }), b];
  const ha = onStairHead(a), hb = onStairHead(b);
  return [...(ha ? [GAP[0]] : []), ...(hb ? [GAP[0]] : []), b].filter(dedupe);
}
// the shelf's tall end post (the bean's rail): a way that would pass within an arm of it goes round its back corner
const POST = { x: 0.07, z: SHELF.upper.z - 0.165 }, ROUND = { x: 0.52, z: 3.12 };
function aroundPost(a, pts) {
  const out = []; let p = a;
  for (const q of pts) {
    const dx = q.x - p.x, dz = q.z - p.z, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((POST.x - p.x) * dx + (POST.z - p.z) * dz) / L2));
    const d = Math.hypot(p.x + dx * t - POST.x, p.z + dz * t - POST.z), endsFar = Math.hypot(p.x - POST.x, p.z - POST.z) > 0.5 && Math.hypot(q.x - POST.x, q.z - POST.z) > 0.5;
    if (d < 0.55 && endsFar && t > 0.05 && t < 0.95) out.push(ROUND);
    out.push(q); p = q;
  }
  return out;
}
export function pathBetween(a, b) { return aroundPost(a, way(a, b)); }
function way(a, b) {
  const ha = hatchSide(a), hb = hatchSide(b);
  if (ha && hb) return near(a, b);
  if (ha) return [...near(a, SQ), SQ_OUT, ...way(SQ_OUT, b)];
  if (hb) return [...way(a, SQ_OUT), SQ, ...near(SQ, b)];
  const far = Math.hypot(b.x - a.x, b.z - a.z) > 1.0;
  if (far && atShelf(a)) return [back(a), ...way(back(a), b)];
  if (far && atShelf(b)) return [...way(a, back(b)), b];
  return route(a, b);
}
export const pathLength = (a, pts) => { let d = 0, p = a; for (const q of pts) { d += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return d; };
