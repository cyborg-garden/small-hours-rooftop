// OWNER: B (world). Water. The pour is a ribbon along the real ballistic path from the cup's lip to the pot,
// thick at the cup, breaking into beads, with a crown where it lands and a few drops after. Also the thin
// stream at Marlow's tap, the ring in the barrel, and the mist, which is slow falling flecks.
// All opaque, all flat paint. The stream is a thin rope of water blue with one line of bare paper down the lamp
// side: real water thins as it falls, and only its highlight is bright.
import * as THREE from 'three';
import { BEDS, SHELF, HATCH, BARREL } from '../core/layout.js';
import { Batch, col, mix, paint, V, clamp, lerp, smooth, follow, ball } from './kit.js';

const G = 5.2;   // lighter than the real thing, so the arc hangs in the air long enough to be seen
export function createWater(ctx) {
  const group = new THREE.Group(), rng = ctx.rng.fork(31);
  const lamp = new THREE.Vector3(HATCH.lamp.x + 0.8, 0.6, HATCH.lamp.z + 0.9);
  const white = col('waterLit'), warm = col('waterWarm'), blue = mix('water', 'barrel', 0.22), deep = mix('water', 'barrel', 0.55), tmp = new THREE.Color();
  // ---- the ribbon: a tube with 8 sides and up to 30 rings, rewritten every frame it flows ------------------------
  const RINGS = 30, SIDES = 8, nv = RINGS * SIDES + 2, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3), idx = [];
  for (let k = 0; k < RINGS - 1; k++) for (let s = 0; s < SIDES; s++) { const a = k * SIDES + s, b = k * SIDES + (s + 1) % SIDES, c = a + SIDES, d = b + SIDES; idx.push(a, b, c, b, d, c); }
  for (let s = 1; s < SIDES - 1; s++) idx.push(0, s + 1, s); for (let s = 1; s < SIDES - 1; s++) { const o = (RINGS - 1) * SIDES; idx.push(o, o + s, o + s + 1); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); rg.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  rg.setAttribute('color', new THREE.BufferAttribute(colr, 3).setUsage(THREE.DynamicDrawUsage)); rg.setIndex(idx);
  const ribbon = new THREE.Mesh(rg, paint.water()); ribbon.frustumCulled = false; ribbon.castShadow = false; ribbon.visible = false; group.add(ribbon);
  // ---- beads: one instanced drop shape for every loose bit of water --------------------------------------------
  const NB = 150, dropG = new THREE.OctahedronGeometry(1, 1); dropG.scale(1, 1.5, 1);
  // the drop and fleck shapes carry a white vertex colour, so the instance colour is what is seen (without it they draw black)
  const whiten = (g) => { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); return g; };
  whiten(dropG);
  const beads = new THREE.InstancedMesh(dropG, paint.water(), NB); beads.frustumCulled = false; beads.castShadow = false; group.add(beads);
  const o = new THREE.Object3D(); let nb = 0;
  const bead = (x, y, z, s, c) => { if (nb >= NB || s <= 0.0005) return; o.position.set(x, y, z); o.scale.setScalar(s); o.updateMatrix(); beads.setMatrixAt(nb, o.matrix); beads.setColorAt(nb, c); nb++; };
  // ---- mist: fixed flecks per bed (and over the shelf), falling slowly, scaled by how hard it is misting ---------
  const NM = 70, mistZones = [...BEDS.map((b) => ({ x0: b.x - b.w / 2 + 0.15, x1: b.x + b.w / 2 - 0.15, z0: b.z - b.d / 2 + 0.08, z1: b.z + b.d / 2 - 0.08, top: b.h + 0.66, bot: b.h + 0.02, k: 0 })),
    { x0: SHELF.x0 + 0.1, x1: SHELF.x1 - 0.1, z0: SHELF.upper.z - 0.2, z1: SHELF.lower.z + 0.2, top: 1.15, bot: 0.4, k: 0, shelf: true }];
  const mistG = whiten(new THREE.OctahedronGeometry(1, 0)), mist = new THREE.InstancedMesh(mistG, paint.water(), NM * mistZones.length); mist.frustumCulled = false; mist.castShadow = false; group.add(mist);
  const flecks = []; mistZones.forEach((z) => { for (let i = 0; i < NM; i++) flecks.push({ z, u: rng(), v: rng(), ph: rng(), sp: rng.range(0.16, 0.3), s: rng.range(0.026, 0.048), dr: rng.range(-1, 1) }); });
  const mistC = mix('water', 'waterLit', 0.35); flecks.forEach((_, i) => mist.setColorAt(i, mistC));
  // ---- ring in the barrel -------------------------------------------------------------------------------------
  const ringG = new THREE.RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2); { const n = ringG.attributes.position.count, c = new Float32Array(n * 3).fill(1); ringG.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const ring = new THREE.Mesh(ringG, paint.water()); ring.material.color.copy(mix('waterLit', 'water', 0.3)); ring.visible = false; ring.castShadow = false; group.add(ring);
  const A = new THREE.Vector3(), Bp = new THREE.Vector3(), vel = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), toLamp = new THREE.Vector3();
  let flowT = -1, sinceFlow = 9, lastLip = new THREE.Vector3(), lastSoil = new THREE.Vector3(), scoopT = 9, T = 0.4;
  const at = (a, out) => out.set(A.x + vel.x * a, A.y + vel.y * a - 0.5 * G * a * a, A.z + vel.z * a);
  return {
    group, flowing: () => ribbon.visible, start: (out) => out.copy(A),   // (for tests: where the stream leaves the cup)
    // lip: world position of the cup's lip. soil: where it should land.
    update(dt, state, env) {
      const J = state.jo, u = J.actionDur ? J.actionT / J.actionDur : 0, t = state.time; nb = 0;
      // (only while the cup is drawn and in her hand: water never comes out of the air)
      const flowing = J.present && J.action === 'pour' && u > 0.15 && u < 0.84 && env.cupInHand();
      // ---- the pour ----
      if (flowing) { if (flowT < 0) flowT = 0; else flowT += dt; sinceFlow = 0; env.lip(lastLip); env.soil(lastSoil); } else { if (flowT >= 0) flowT = -1; sinceFlow += dt; }
      const dur = J.actionDur * 0.69 || 1.5, tEnd = flowing ? Math.max(0, flowT - (dur - 0.0)) : sinceFlow;   // age of the youngest water once the cup has stopped
      A.copy(lastLip); Bp.copy(lastSoil);
      const dx = Bp.x - A.x, dz = Bp.z - A.z, dy = Bp.y - A.y, dh = Math.hypot(dx, dz);
      T = clamp(0.34 + dh * 0.3, 0.34, 0.56); vel.set(dx / T, (dy + 0.5 * G * T * T) / T, dz / T);
      const a1 = flowing ? Math.min(T, flowT) : T, a0 = flowing ? 0 : Math.min(T, sinceFlow);   // ages present in the air: [a0, a1]
      // the rope is drawn only while it runs from the cup's lip. Once the cup comes up, what is left in the air is a few
      // drops falling (below), never a length of rope sailing on by itself beside her hand (round nine: "a white blob
      // floats next to his hand with nothing pouring"). state.__tail puts the old tail back, for tools/scene.mjs.
      const live = !!(flowing || (state.__tail && sinceFlow < T)) && a1 - a0 > 0.012 && (!flowing || flowT > 0.04);
      ribbon.visible = live;
      if (live) {
        toLamp.subVectors(lamp, A).normalize();
        const solidEnd = lerp(a0, a1, flowing ? 0.9 : 0.72);
        for (let k = 0; k < RINGS; k++) {
          const f = k / (RINGS - 1), a = lerp(a0, solidEnd, f); at(a, P); at(a + 0.01, Q); tan.subVectors(Q, P).normalize();
          side.crossVectors(tan, up.set(0, 1, 0)); if (side.lengthSq() < 1e-5) side.set(1, 0, 0); side.normalize(); up.crossVectors(side, tan).normalize();
          // a slow sway along the rope (3 to 5 Hz), never a shimmer
          const an = a / T, wob = 1 + 0.09 * Math.sin(an * 7 - t * 4.2) + 0.05 * Math.sin(an * 13 + t * 2.9);
          // real water thins as it speeds up: 2.8 cm at the lip down to 1.6 cm where it breaks into drops
          const r = (lerp(0.028, 0.016, Math.pow(an, 0.8)) * wob) * (flowing ? smooth(0, 0.05, a1 - a) * 0.4 + 0.6 : 1) * (f > 0.92 ? 1 - (f - 0.92) * 8 : 1) * (!flowing ? 1 - 0.45 * f : 1);
          let best = -1, bi = 0;
          for (let s = 0; s < SIDES; s++) { const th = (s / SIDES) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
            const w = (side.x * c + up.x * sn) * toLamp.x + (side.y * c + up.y * sn) * toLamp.y + (side.z * c + up.z * sn) * toLamp.z; if (w > best) { best = w; bi = s; } }
          for (let s = 0; s < SIDES; s++) { const th = (s / SIDES) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), i = (k * SIDES + s) * 3;
            const nx = side.x * c + up.x * sn, ny = side.y * c + up.y * sn, nz = side.z * c + up.z * sn;
            pos[i] = P.x + nx * r; pos[i + 1] = P.y + ny * r; pos[i + 2] = P.z + nz * r; nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
            // the body is water blue, darker underneath; one column of vertices on the lamp side is bare paper, with a warm
            // neighbour where the stair light catches the edge
            const under = clamp(-ny, 0, 1), d = Math.min(Math.abs(s - bi), SIDES - Math.abs(s - bi));
            if (d === 0) tmp.copy(white); else if (d === 1) tmp.copy(warm).lerp(blue, 0.55); else tmp.copy(blue).lerp(deep, under * 0.8 + 0.15);
            colr[i] = tmp.r; colr[i + 1] = tmp.g; colr[i + 2] = tmp.b; }
        }
        rg.attributes.position.needsUpdate = true; rg.attributes.normal.needsUpdate = true; rg.attributes.color.needsUpdate = true;
        // the broken end: drops on the same path, thinning out, then the crown where it lands
        for (let i = 0; i < 12; i++) { const a = lerp(solidEnd, a1, (i + 0.5 + 0.4 * Math.sin(t * 4.5 + i)) / 12); if (a > a1) continue; at(a, P); const j = Math.sin(i * 12.9898 + Math.floor(t * 6)) * 0.014; bead(P.x + j, P.y, P.z - j, 0.024 - 0.0009 * i, i % 3 ? blue : white); }
      }
      // what was in the air when the cup came up: a short shower of drops, each still on its path, falling into the pot
      if (!flowing && !state.__tail && sinceFlow < T) for (let i = 0; i < 8; i++) { const a = lerp(Math.min(T, sinceFlow + 0.05), T, (i + 0.5) / 8); at(a, P); bead(P.x, P.y, P.z, 0.016 - 0.001 * i, i % 3 ? blue : white); }
      const landing = flowing ? flowT > T : sinceFlow < T + 0.25;
      if (landing) for (let i = 0; i < 18; i++) {   // the crown: drops thrown up and out of the pot in a ring, twice the old size
        const ph = ((t * 2.2 + i * 0.37) % 1), a = i * 2.39996, r = 0.04 + ph * (0.14 + 0.04 * (i % 3)), h = Math.sin(Math.PI * ph) * (0.15 + 0.05 * (i % 4));
        bead(Bp.x + Math.cos(a) * r, Bp.y + 0.01 + h, Bp.z + Math.sin(a) * r, 0.03 * (1 - ph * 0.6) * (flowing ? 1 : clamp(1 - (sinceFlow - T) / 0.25)), i % 2 ? white : blue);
      }
      // and a ring of wet spread on the soil while it lands: a flat dark disc that is simply the pot's own wet soil, so nothing here
      // drops from the lip after the cup comes up
      if (!flowing && sinceFlow < 1.3 && J.present) { env.lip(P); for (let i = 0; i < 3; i++) { const a = sinceFlow - 0.12 - i * 0.3; if (a > 0 && a < 0.5) bead(P.x, P.y - 0.5 * G * a * a - 0.01, P.z, 0.013, white); } }
      // ---- the tap: a thin straight stream into the cup ----
      const atTap = J.present && J.action === 'scoop' && J.target === 'valve' && u > 0.22 && u < 0.62;
      if (atTap) { const sp = env.spout, fall = 0.2; for (let i = 0; i < 12; i++) { const f = ((i / 12) + t * 2.2) % 1; bead(sp.x + Math.sin(i * 7.1) * 0.002, sp.y - f * fall, sp.z, 0.013 + 0.004 * Math.sin(i * 3.3), i % 4 ? white : blue); } }
      // ---- the barrel: a ring spreading on the water when the cup goes in ----
      const scooping = J.present && J.action === 'scoop' && J.target !== 'valve' && u > 0.4 && state.barrel.level > 0.07;
      if (scooping && scoopT > 1.5) scoopT = 0; scoopT += dt;
      ring.visible = scoopT < 1.4; if (ring.visible) { const s = 0.07 + scoopT * 0.24; ring.position.set(BARREL.x - 0.08, env.waterY() + 0.004, BARREL.z + 0.03); ring.scale.set(Math.min(s, 0.37), 1, Math.min(s, 0.37)); ring.material.color.copy(mix('waterLit', 'water', 0.25)).lerp(mix('water', 'barrel', 0.5), smooth(0.4, 1.4, scoopT)); }
      // ---- mist ----
      const calm = state.reducedMotion ? 0.5 : 1;
      mistZones.forEach((z) => { const on = state.marlow.misting && (!z.shelf || state.marlow.shelfSensor) ? 1 : 0; z.k = follow(z.k, on, dt, on ? 1.6 : 1.1); });
      flecks.forEach((f, i) => { const z = f.z, ph = (f.ph + t * f.sp * calm) % 1, y = lerp(z.top, z.bot, ph), sc = f.s * z.k * Math.sin(Math.PI * Math.min(1, ph * 1.15));
        o.position.set(lerp(z.x0, z.x1, f.u) + Math.sin(ph * 5 + f.ph * 9) * 0.05 * f.dr, y, lerp(z.z0, z.z1, f.v) + ph * 0.08 * f.dr); o.scale.setScalar(Math.max(sc, 0.00001)); o.rotation.set(f.ph * 6, ph * 3, 0); o.updateMatrix(); mist.setMatrixAt(i, o.matrix); });
      mist.instanceMatrix.needsUpdate = true; mist.visible = mistZones.some((z) => z.k > 0.01);
      o.rotation.set(0, 0, 0);
      for (let i = nb; i < NB; i++) { o.position.set(0, -50, 0); o.scale.setScalar(0.00001); o.updateMatrix(); beads.setMatrixAt(i, o.matrix); }
      beads.instanceMatrix.needsUpdate = true; if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
    },
  };
}
void ball; void V;
