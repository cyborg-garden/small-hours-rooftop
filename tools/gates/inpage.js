// Injected into the game page by the gates in tools/. Geometry checks on the posed figures, done against the
// meshes themselves (raycasts and triangle tests), never by eye and never through game state.
//   window.__gate.body()   -> { caps, joints, cloth }   limb continuity: no cap or open end seen, no bare joint,
//                                                        no jacket or coat triangle cutting through the trousers
//   window.__gate.clash()  -> [ ... ]                    hand or arm triangles inside a prop or piece of furniture
(() => {
  const G = window.__game, D = G.debug(), T = D.T;
  const V3 = T.Vector3, ray = new T.Raycaster();
  const HIDE = /^(leg|ankle|pelvis|torso|collar|sleeve|cuff|fore|palm|fingers|thumb|neck|book)/;   // caps that must never be seen
  const ARM = /^(shoulder|sleeve|cuff|fore|palm|fingers|thumb)/;
  const TROUSER = /^(leg|pelvis)/;
  // a cap that must never be seen: every end of a limb or garment tube, except the tips of the fingers and the thumb
  const hidden = (part) => part.kind === 'cap' && HIDE.test(part.tag) && !(part.end === 1 && /^(thumb|fingers)/.test(part.tag));
  const JOINTS = ['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'legR', 'shinR', 'neck', 'head'];
  const a = new V3(), b = new V3(), c = new V3(), p = new V3(), dir = new V3();

  // ---- Moller tri-tri intersection (coplanar pairs count as not crossing) ----------------------------------------
  const sub = (o, u, v) => { o[0] = u[0] - v[0]; o[1] = u[1] - v[1]; o[2] = u[2] - v[2]; return o; };
  const cross = (o, u, v) => { o[0] = u[1] * v[2] - u[2] * v[1]; o[1] = u[2] * v[0] - u[0] * v[2]; o[2] = u[0] * v[1] - u[1] * v[0]; return o; };
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const E1 = [0, 0, 0], E2 = [0, 0, 0], N1 = [0, 0, 0], N2 = [0, 0, 0], DD = [0, 0, 0];
  function interval(VV0, VV1, VV2, D0, D1, D2, D0D1, D0D2) {
    if (D0D1 > 0) return [VV2 + (VV0 - VV2) * D2 / (D2 - D0), VV2 + (VV1 - VV2) * D2 / (D2 - D1)];
    if (D0D2 > 0) return [VV1 + (VV0 - VV1) * D1 / (D1 - D0), VV1 + (VV2 - VV1) * D1 / (D1 - D2)];
    if (D1 * D2 > 0 || D0 !== 0) return [VV0 + (VV1 - VV0) * D0 / (D0 - D1), VV0 + (VV2 - VV0) * D0 / (D0 - D2)];
    if (D1 !== 0) return [VV1 + (VV0 - VV1) * D1 / (D1 - D0), VV1 + (VV2 - VV1) * D1 / (D1 - D2)];
    if (D2 !== 0) return [VV2 + (VV0 - VV2) * D2 / (D2 - D0), VV2 + (VV1 - VV2) * D2 / (D2 - D1)];
    return null;   // coplanar
  }
  function triTri(V0, V1, V2, U0, U1, U2) {
    const EPS = 1e-7;
    cross(N1, sub(E1, V1, V0), sub(E2, V2, V0)); const d1 = -dot(N1, V0);
    let du0 = dot(N1, U0) + d1, du1 = dot(N1, U1) + d1, du2 = dot(N1, U2) + d1;
    if (Math.abs(du0) < EPS) du0 = 0; if (Math.abs(du1) < EPS) du1 = 0; if (Math.abs(du2) < EPS) du2 = 0;
    const du0du1 = du0 * du1, du0du2 = du0 * du2; if (du0du1 > 0 && du0du2 > 0) return false;
    cross(N2, sub(E1, U1, U0), sub(E2, U2, U0)); const d2 = -dot(N2, U0);
    let dv0 = dot(N2, V0) + d2, dv1 = dot(N2, V1) + d2, dv2 = dot(N2, V2) + d2;
    if (Math.abs(dv0) < EPS) dv0 = 0; if (Math.abs(dv1) < EPS) dv1 = 0; if (Math.abs(dv2) < EPS) dv2 = 0;
    const dv0dv1 = dv0 * dv1, dv0dv2 = dv0 * dv2; if (dv0dv1 > 0 && dv0dv2 > 0) return false;
    cross(DD, N1, N2); let ix = 0, m = Math.abs(DD[0]); if (Math.abs(DD[1]) > m) { m = Math.abs(DD[1]); ix = 1; } if (Math.abs(DD[2]) > m) ix = 2;
    const i1 = interval(V0[ix], V1[ix], V2[ix], dv0, dv1, dv2, dv0dv1, dv0dv2); if (!i1) return false;
    const i2 = interval(U0[ix], U1[ix], U2[ix], du0, du1, du2, du0du1, du0du2); if (!i2) return false;
    const a0 = Math.min(i1[0], i1[1]), a1 = Math.max(i1[0], i1[1]), b0 = Math.min(i2[0], i2[1]), b1 = Math.max(i2[0], i2[1]);
    return !(a1 < b0 || b1 < a0);
  }

  // ---- figures and props ----------------------------------------------------------------------------------------
  const figs = { jo: D.jo.fig, tam: D.tam.fig };
  const faceFlags = {};   // per figure: 1 where a face belongs to a cap that must stay hidden
  for (const k in figs) {
    const f = figs[k], n = f.mesh.geometry.index.count / 3, fl = new Uint8Array(n);
    for (const part of f.parts) if (hidden(part)) for (let i = part.start / 3; i < (part.start + part.count) / 3; i++) fl[i] = 1;
    faceFlags[k] = fl;
  }
  const tagOfFace = (f, fi) => { const o = fi * 3; for (const part of f.parts) if (o >= part.start && o < part.start + part.count) return part.tag + (part.kind === 'cap' ? ':cap' + part.end : ''); return '?'; };
  const prepFig = (f) => { f.root.updateMatrixWorld(true); const g = f.mesh.geometry; g.computeBoundingSphere(); g.boundingBox = null; };
  const present = (k) => (k === 'jo' ? G.state.jo.present : G.state.tam.present) && figs[k].mesh.visible && figs[k].root.parent && figs[k].root.parent.visible;
  // world-space triangles of a figure, filtered by part tag, with bind-space y for the hem filter
  function figTris(f, re, kind) {
    const pos = f.mesh.geometry.attributes.position.array, idx = f.mesh.geometry.index.array, M = f.mesh.matrixWorld, out = [];
    for (const part of f.parts) {
      if (!re.test(part.tag) || (kind && part.kind !== kind)) continue;
      for (let o = part.start; o < part.start + part.count; o += 3) {
        const tri = [];
        for (let k = 0; k < 3; k++) { const i = idx[o + k]; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M); tri.push([p.x, p.y, p.z]); }
        tri.bindY = Math.max(f.bind[idx[o] * 3 + 1], f.bind[idx[o + 1] * 3 + 1], f.bind[idx[o + 2] * 3 + 1]); tri.tag = part.tag; out.push(tri);
      }
    }
    return out;
  }
  const bbox = (tris) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const t of tris) for (const v of t) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; } return { lo, hi }; };
  const triBox = (t) => ({ lo: [Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]), Math.min(t[0][2], t[1][2], t[2][2])], hi: [Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1]), Math.max(t[0][2], t[1][2], t[2][2])] });
  const overlap = (A, B, m = 0) => !(A.hi[0] + m < B.lo[0] || B.hi[0] + m < A.lo[0] || A.hi[1] + m < B.lo[1] || B.hi[1] + m < A.lo[1] || A.hi[2] + m < B.lo[2] || B.hi[2] + m < A.lo[2]);

  // props: every mesh under the furniture groups, minus the things people hold. Triangles cached in world space
  // and refreshed when a mesh moves (the lid, the stay).
  const heldIds = new Set(D.held.map((m) => m.id));
  const propMeshes = [];
  for (const name in D.props) D.props[name].traverse((o) => { if (o.isMesh && !heldIds.has(o.id) && o.geometry && o.geometry.attributes.position) propMeshes.push({ name: name + (o.name ? '/' + o.name : ''), mesh: o, tris: null, boxes: null, mw: null }); });
  function propTris(P) {
    const m = P.mesh; m.updateMatrixWorld(true); const e = m.matrixWorld.elements;
    if (P.mw && P.mw.every((v, i) => v === e[i])) return;
    P.mw = Array.from(e);
    const g = m.geometry, pos = g.attributes.position.array, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.length / 3;
    P.tris = []; P.boxes = [];
    for (let o = 0; o < n; o += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) { const i = idx ? idx[o + k] : o + k; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m.matrixWorld); tri.push([p.x, p.y, p.z]); }
      P.tris.push(tri); P.boxes.push(triBox(tri));
    }
  }
  const occluders = propMeshes.map((P) => P.mesh);

  // ---- the checks -------------------------------------------------------------------------------------------------
  const cam = D.camera, cp = cam.position;
  const S = () => G.state;
  function body() {
    const out = { caps: [], joints: [], cloth: [] };
    for (const k in figs) {
      if (!present(k)) continue;
      const f = figs[k]; prepFig(f);
      const pos = f.mesh.geometry.attributes.position.array, idx = f.mesh.geometry.index.array, M = f.mesh.matrixWorld, fl = faceFlags[k];
      const seenParts = new Set();
      // 1. caps: a ray from the camera to a cap triangle must not find that cap as the first thing it meets
      for (const part of f.parts) {
        if (!hidden(part)) continue;
        const nTri = part.count / 3, every = Math.max(1, Math.floor(nTri / 5));
        for (let t = 0; t < nTri; t += every) {
          const o = part.start + t * 3;
          a.set(pos[idx[o] * 3], pos[idx[o] * 3 + 1], pos[idx[o] * 3 + 2]).applyMatrix4(M); b.set(pos[idx[o + 1] * 3], pos[idx[o + 1] * 3 + 1], pos[idx[o + 1] * 3 + 2]).applyMatrix4(M); c.set(pos[idx[o + 2] * 3], pos[idx[o + 2] * 3 + 1], pos[idx[o + 2] * 3 + 2]).applyMatrix4(M);
          p.copy(a).add(b).add(c).multiplyScalar(1 / 3);
          const pr = G.project(p); if (!pr.on || pr.behind) continue;
          const ppm = D.render.pxPerMetre(p), px = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) * ppm;
          if (px < 1.5) continue;   // too small to be a mark on the sheet
          dir.copy(p).sub(cp).normalize(); ray.set(cp, dir); ray.far = cp.distanceTo(p) + 0.01;
          const hits = ray.intersectObject(f.mesh, false); if (!hits.length) continue;
          const h = hits[0]; if (!fl[h.faceIndex]) continue;   // something of the body covers this cap
          if (ray.intersectObjects(occluders, false).some((x) => x.distance < h.distance - 0.004)) continue;   // furniture hides it
          const tag = tagOfFace(f, h.faceIndex); if (seenParts.has(tag)) break; seenParts.add(tag);
          out.caps.push({ who: k, tag, x: Math.round(pr.x), y: Math.round(pr.y), px: +px.toFixed(1) }); break;
        }
      }
      // 2. joints: the ray to a joint must meet the body on its way there (the joint sits inside a sleeve, a leg, a neck)
      for (const name of JOINTS) {
        const bo = f.bones[name]; if (!bo) continue;
        p.copy(bo.wp).applyMatrix4(f.rootMatrix); const pr = G.project(p); if (!pr.on || pr.behind) continue;
        const d = cp.distanceTo(p); dir.copy(p).sub(cp).normalize(); ray.set(cp, dir); ray.far = d + 0.05;
        const hits = ray.intersectObject(f.mesh, false);
        const covered = hits.some((h) => h.distance <= d + 0.012);
        if (covered) continue;
        if (ray.intersectObjects(occluders, false).some((x) => x.distance < d)) continue;   // behind furniture: not bare, just hidden
        out.joints.push({ who: k, joint: name, x: Math.round(pr.x), y: Math.round(pr.y), gap: +(hits.length ? hits[0].distance - d : 9).toFixed(3) });
      }
      // 3. cloth: the jacket's hem band (or the coat) must not cut through the trousers
      const hemTop = f.D.pelvis * (0.93 / 0.9), hem = figTris(f, /^torso$/, 'skin').filter((t) => t.bindY < hemTop), legs = figTris(f, TROUSER);
      // a hem triangle cutting a trouser triangle counts only where the camera can see it: the crossing must be on
      // screen and the hem must be the first thing a ray from the camera meets there
      const hb = bbox(hem); let n = 0, where = null; const torsoPart = f.parts.find((q) => q.tag === 'torso' && q.kind === 'skin');
      const seenHem = new Set();
      for (const lt of legs) { const lb = triBox(lt); if (!overlap(hb, lb)) continue;
        for (let hi = 0; hi < hem.length; hi++) { const ht = hem[hi]; if (seenHem.has(hi) || !triTri(ht[0], ht[1], ht[2], lt[0], lt[1], lt[2])) continue;
          seenHem.add(hi);
          p.set((ht[0][0] + ht[1][0] + ht[2][0]) / 3, (ht[0][1] + ht[1][1] + ht[2][1]) / 3, (ht[0][2] + ht[1][2] + ht[2][2]) / 3);
          const pr = G.project(p); if (!pr.on || pr.behind) break;
          const d = cp.distanceTo(p); dir.copy(p).sub(cp).normalize(); ray.set(cp, dir); ray.far = d + 0.02;
          const hits = ray.intersectObject(f.mesh, false); if (!hits.length) break;
          const h = hits[0], o = h.faceIndex * 3, isHem = o >= torsoPart.start && o < torsoPart.start + torsoPart.count;
          if (!isHem || h.distance < d - 0.012) break;   // the crossing is under the jacket, or behind some other part of the body
          if (ray.intersectObjects(occluders, false).some((x) => x.distance < d)) break;
          n++; if (!where) { where = pr; where.hemBind = [+f.bind[f.mesh.geometry.index.array[torsoPart.start] * 3].toFixed(3), +ht.bindY.toFixed(3)]; where.legTag = lt.tag; where.at = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; } break; } }
      if (n) out.cloth.push({ who: k, pairs: n, x: Math.round(where.x), y: Math.round(where.y), on: true, hemY: where.hemBind[1], legTag: where.legTag, at: where.at });
    }
    return out;
  }
  function clash() {
    const out = [];
    for (const k in figs) {
      if (!present(k)) continue;
      const f = figs[k]; prepFig(f);
      const arm = figTris(f, ARM), ab = bbox(arm), armBoxes = arm.map(triBox);
      for (const P of propMeshes) {
        if (!P.mesh.visible) continue;
        propTris(P);
        let n = 0, where = null, tag = null;
        for (let i = 0; i < P.tris.length; i++) {
          if (!overlap(ab, P.boxes[i])) continue;
          const pt = P.tris[i];
          for (let j = 0; j < arm.length; j++) { if (!overlap(armBoxes[j], P.boxes[i])) continue;
            if (triTri(arm[j][0], arm[j][1], arm[j][2], pt[0], pt[1], pt[2])) { n++; if (!where) { p.set(arm[j][0][0], arm[j][0][1], arm[j][0][2]); where = G.project(p); where.at = [+((pt[0][0] + pt[1][0] + pt[2][0]) / 3).toFixed(2), +((pt[0][1] + pt[1][1] + pt[2][1]) / 3).toFixed(2), +((pt[0][2] + pt[1][2] + pt[2][2]) / 3).toFixed(2)]; tag = arm[j].tag; } break; } }
          if (n > 40) break;
        }
        if (n) out.push({ who: k, prop: P.name, tag, pairs: n, x: where ? Math.round(where.x) : -1, y: where ? Math.round(where.y) : -1, on: !!(where && where.on), at: where ? where.at : null });
      }
    }
    return out;
  }
  window.__gate = { body, clash, triTri };
})();
