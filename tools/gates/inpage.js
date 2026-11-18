// Injected into the game page by the gates in tools/. Geometry checks on the posed figures, done against the
// meshes themselves (raycasts and triangle tests), never by eye and never through game state.
//   window.__gate.body()   -> { caps, joints, cloth }   limb continuity: no cap or open end seen, no bare joint,
//                                                        no jacket or coat triangle cutting through the trousers
//   window.__gate.clash()  -> [ ... ]                    hand or arm triangles inside a prop or piece of furniture
(() => {
  const G = window.__game, D = G.debug(), T = D.T;
  const V3 = T.Vector3, ray = new T.Raycaster();
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
  // The people are real skinned meshes now. Everything here is measured on the posed skin itself (three's own CPU
  // skinning, the same maths the GPU runs), never on the pose channels.
  const figs = { jo: D.jo.fig, tam: D.tam.fig };
  const ARMSET = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_/;
  const present = (k) => (k === 'jo' ? G.state.jo.present : G.state.tam.present) && figs[k].root.parent && figs[k].root.parent.visible;
  // per figure: every bone's rest length to its parent, and per mesh the triangles that belong to an arm or a hand
  const info = {};
  for (const k in figs) {
    const f = figs[k], lens = [];
    for (const n in f.bones) { const bo = f.bones[n], pa = bo.parent; if (!pa || !pa.isBone || !f.restP[pa.name]) continue; const L = f.restP[n].distanceTo(f.restP[pa.name]); if (L > 0.015 && n !== 'pelvis') lens.push({ bo, pa, L, name: n }); }
    const arms = [];
    for (const m of f.meshes) {
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, idx = m.geometry.index.array, names = m.skeleton.bones.map((x) => x.name);
      const isArm = (i) => { let w = 0; for (let c = 0; c < 4; c++) if (ARMSET.test(names[si.getComponent(i, c)])) w += sw.getComponent(i, c); return w > 0.6; };
      const fore = (i) => { let w = 0; for (let c = 0; c < 4; c++) if (!/^upperarm_/.test(names[si.getComponent(i, c)]) && ARMSET.test(names[si.getComponent(i, c)])) w += sw.getComponent(i, c); return w > 0.6; };
      const tris = []; for (let o = 0; o < idx.length; o += 3) if (isArm(idx[o]) && isArm(idx[o + 1]) && isArm(idx[o + 2]) && (fore(idx[o]) || fore(idx[o + 1]) || fore(idx[o + 2]))) tris.push(o);
      if (tris.length) arms.push({ m, tris });
    }
    info[k] = { lens, arms, solid: f.meshes.filter((m) => !/hair|eyes|brow/.test(m.userData.role)) };
    // the two eyes and a point between them, where they are now (the eye mesh's vertices split left and right at rest)
    const em = f.meshes.find((m) => m.userData.role === 'eyes');
    if (em) { const n = em.geometry.attributes.position.count, side = []; for (let i = 0; i < n; i++) side.push(em.geometry.attributes.position.getX(i) > 0 ? 0 : 1);
      info[k].eyes = () => { const C = [new V3(), new V3()], N = [0, 0], v = new V3(); for (let i = 0; i < n; i += 3) { em.getVertexPosition(i, v); v.applyMatrix4(em.matrixWorld); C[side[i]].add(v); N[side[i]]++; }
        C[0].multiplyScalar(1 / Math.max(1, N[0])); C[1].multiplyScalar(1 / Math.max(1, N[1])); return [C[0], C[1], C[0].clone().add(C[1]).multiplyScalar(0.5)]; }; }
  }
  // triangles of a figure hanging mostly from the named bones (head and neck, say), cached as index lists, posed on demand
  const partCache = new Map();
  function partTris(k, re) {
    const key = k + re; let parts = partCache.get(key);
    if (!parts) { parts = []; for (const m of figs[k].meshes) { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, idx = m.geometry.index.array, names = m.skeleton.bones.map((x) => x.name);
        const on = (i) => { let w = 0; for (let c = 0; c < 4; c++) if (re.test(names[si.getComponent(i, c)])) w += sw.getComponent(i, c); return w > 0.5; };
        const tris = []; for (let o = 0; o < idx.length; o += 3) if (on(idx[o]) || on(idx[o + 1]) || on(idx[o + 2])) tris.push(o); if (tris.length) parts.push({ m, tris }); }
      partCache.set(key, parts); }
    const out = [];
    for (const { m, tris } of parts) { if (!m.visible) continue; const idx = m.geometry.index.array, cache = new Map();
      const at = (i) => { let v = cache.get(i); if (!v) { m.getVertexPosition(i, p); p.applyMatrix4(m.matrixWorld); v = [p.x, p.y, p.z]; cache.set(i, v); } return v; };
      for (const o of tris) { const t = [at(idx[o]), at(idx[o + 1]), at(idx[o + 2])]; t.tag = m.userData.role; out.push(t); } }
    return out;
  }
  // does any triangle of A cross any of B? (bounding boxes first). Returns the tag of the first crossing, or null
  function crossAny(A, B) {
    const bb = bbox(B), boxesB = B.map(triBox);
    for (const t of A) { const tb = triBox(t); if (!overlap(tb, bb)) continue;
      for (let j = 0; j < B.length; j++) if (overlap(tb, boxesB[j]) && triTri(t[0], t[1], t[2], B[j][0], B[j][1], B[j][2])) return B[j].tag || t.tag || 'x'; }
    return null;
  }
  const prepFig = (f) => { f.root.updateMatrixWorld(true); for (const m of f.meshes) { m.computeBoundingSphere(); m.computeBoundingBox(); } };
  // world-space triangles of a figure's forearms and hands
  function armTris(k) {
    const out = [];
    for (const { m, tris } of info[k].arms) { const idx = m.geometry.index.array, cache = new Map();
      const at = (i) => { let v = cache.get(i); if (!v) { m.getVertexPosition(i, p); p.applyMatrix4(m.matrixWorld); v = [p.x, p.y, p.z]; cache.set(i, v); } return v; };
      for (const o of tris) { const t = [at(idx[o]), at(idx[o + 1]), at(idx[o + 2])]; t.tag = m.userData.role; out.push(t); } }
    return out;
  }
  const meshTris = (m) => { m.updateMatrixWorld(true); const pos = m.geometry.attributes.position.array, idx = m.geometry.index ? m.geometry.index.array : null, n = idx ? idx.length : pos.length / 3, out = [];
    for (let o = 0; o < n; o += 3) { const t = []; for (let c = 0; c < 3; c++) { const i = idx ? idx[o + c] : o + c; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m.matrixWorld); t.push([p.x, p.y, p.z]); } out.push(t); } return out; };
  const bbox = (tris) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const t of tris) for (const v of t) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; } return { lo, hi }; };
  const triBox = (t) => ({ lo: [Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]), Math.min(t[0][2], t[1][2], t[2][2])], hi: [Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1]), Math.max(t[0][2], t[1][2], t[2][2])] });
  const overlap = (A, B, m = 0) => !(A.hi[0] + m < B.lo[0] || B.hi[0] + m < A.lo[0] || A.hi[1] + m < B.lo[1] || B.hi[1] + m < A.lo[1] || A.hi[2] + m < B.lo[2] || B.hi[2] + m < A.lo[2]);

  // props: every mesh under the furniture groups, minus the things people hold. Triangles cached in world space
  // and refreshed when a mesh moves (the lid, the stay).
  const heldIds = new Set(); for (const h of D.held) h.traverse((o) => heldIds.add(o.id));   // things carried in a hand (the stake among them) are not furniture
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
  // what can stand between the camera and a body: the furniture, the pots, and the things people hold
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const fixedOcc = propMeshes.map((P) => P.mesh), loose = []; for (const h of [...D.held, ...(D.potMeshes || [])]) h.traverse((o) => { if (o.isMesh) loose.push(o); });
  let occluders = fixedOcc;

  // ---- the checks -------------------------------------------------------------------------------------------------
  const cam = D.camera, cp = cam.position;
  const S = () => G.state;
  // limbs. Three things, for each person in the picture:
  //   bones   no bone is more than 2 percent longer or shorter than in the rest pose (nothing stretches)
  //   joints  every visible hand belongs to an arm: the ray to the wrist, the elbow and the shoulder meets that person's
  //           own skin on the way (or the joint is off screen, or behind furniture). The same for knees, hips, neck.
  //   caps    no open end is seen: a ray toward a joint never meets the INSIDE of the body first (a cut sleeve, a neck hole)
  const CHAIN = ['hand_l', 'lowerarm_l', 'upperarm_l', 'hand_r', 'lowerarm_r', 'upperarm_r', 'calf_l', 'thigh_l', 'calf_r', 'thigh_r', 'foot_l', 'foot_r', 'neck_01', 'Head'];
  function body() {
    const out = { caps: [], joints: [], bones: [] };
    D.scene.updateMatrixWorld(true);   // nothing is drawn between samples, so held things (the hat, the tray) are put where they are now
    occluders = fixedOcc.concat(loose.filter(shown));
    for (const k in figs) {
      if (!present(k)) continue;
      const f = figs[k], I = info[k]; prepFig(f);
      for (const { bo, pa, L, name } of I.lens) { a.setFromMatrixPosition(bo.matrixWorld); b.setFromMatrixPosition(pa.matrixWorld); const d = a.distanceTo(b), r = d / L;
        if (Math.abs(r - 1) > 0.02) out.bones.push({ who: k, joint: name, x: 0, y: 0, gap: +r.toFixed(3) }); }
      const sides = I.solid.map((m) => m.material.side); I.solid.forEach((m) => { m.material.side = 2; });   // both faces, for these rays only
      for (const name of CHAIN) {
        const bo = f.bones[name]; p.setFromMatrixPosition(bo.matrixWorld); const pr = G.project(p); if (!pr.on || pr.behind) continue;
        const d = cp.distanceTo(p); dir.copy(p).sub(cp).normalize(); ray.set(cp, dir); ray.far = d + 0.12;
        const hits = ray.intersectObjects(I.solid, false);
        if (ray.intersectObjects(occluders, false).some((x) => x.distance < (hits.length ? hits[0].distance : d))) continue;   // behind furniture: hidden, not bare
        // (met within 3 cm past the joint: covered. Met a little further on, and from the inside: the camera is looking down
        // an open sleeve or collar at it, which the cap rule below judges. Anything else goes to the nearness test.)
        const inner = hits.length ? c.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld).dot(dir) > 0.15 : false;
        if (!hits.length || (hits[0].distance > d + 0.03 && !inner)) {
          // a joint can lie just outside the skin (a shoulder under a raised arm, the nape under a collar): it still belongs
          // to the body if skin is met within 6 cm to any side of it (10 cm for a shoulder: on this rig the joint sits
          // by the armpit, under a loose sleeve whose top is open). Further than that and the limb is not where its bones are.
          let near = false; const right = b.crossVectors(dir, c.set(0, 1, 0)).normalize(), upv = c.crossVectors(right, dir).normalize();
          for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], ...(/^upperarm/.test(name) ? [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]] : [])]) { a.copy(p).addScaledVector(right, sx * 0.04).addScaledVector(upv, sy * 0.04).sub(cp).normalize(); ray.set(cp, a); ray.far = d + 0.2; const hh = ray.intersectObjects(I.solid, false); if (hh.length && Math.abs(hh[0].distance - d) < 0.12) { near = true; break; } }
          if (near) continue;
          out.joints.push({ who: k, joint: name, x: Math.round(pr.x), y: Math.round(pr.y), gap: +(hits.length ? hits[0].distance - d : 9).toFixed(3) }); continue; }

        const h = hits[0]; c.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        // the inside of a surface met first. Skin: a cut limb end, always a fault. Cloth: a fault unless the game draws that
        // cloth on both sides (then it is the lining of a sleeve or a collar seen through its opening, as on a real jacket)
        if (c.dot(dir) > 0.15 && D.render.pxPerMetre(p) * 0.05 > 1.5 && (h.object.userData.role === 'skin' || sides[I.solid.indexOf(h.object)] !== 2)) out.caps.push({ who: k, tag: name + ':inside:' + h.object.userData.role, x: Math.round(pr.x), y: Math.round(pr.y), px: +(D.render.pxPerMetre(p) * 0.05).toFixed(1) });
      }
      I.solid.forEach((m, i) => { m.material.side = sides[i]; });
    }
    return out;
  }
  function crossings(tris, boxes, ab, who, tagOf, out) {
    for (const P of propMeshes) {
      if (!P.mesh.visible || (P.mesh.parent && !P.mesh.parent.visible)) continue;
      propTris(P);
      let n = 0, where = null, tag = null;
      for (let i = 0; i < P.tris.length; i++) {
        if (!overlap(ab, P.boxes[i])) continue;
        const pt = P.tris[i];
        for (let j = 0; j < tris.length; j++) { if (!overlap(boxes[j], P.boxes[i])) continue;
          if (triTri(tris[j][0], tris[j][1], tris[j][2], pt[0], pt[1], pt[2])) { n++; if (!where) { p.set(tris[j][0][0], tris[j][0][1], tris[j][0][2]); where = G.project(p); where.at = [+((pt[0][0] + pt[1][0] + pt[2][0]) / 3).toFixed(2), +((pt[0][1] + pt[1][1] + pt[2][1]) / 3).toFixed(2), +((pt[0][2] + pt[1][2] + pt[2][2]) / 3).toFixed(2)]; tag = tagOf(tris[j]); } break; } }
        if (n > 40) break;
      }
      if (n) out.push({ who, prop: P.name, tag, pairs: n, x: where ? Math.round(where.x) : -1, y: where ? Math.round(where.y) : -1, on: !!(where && where.on), at: where ? where.at : null });
    }
  }
  // clash: no forearm or hand inside furniture; the tray never through the rail or the shelf; the bucket never in the air
  function clash() {
    const out = [];
    D.scene.updateMatrixWorld(true);
    for (const k in figs) {
      if (!present(k)) continue;
      prepFig(figs[k]);
      const arm = armTris(k); crossings(arm, arm.map(triBox), bbox(arm), k, (t) => t.tag, out);
    }
    if (D.tray && D.tray.visible) { const t = meshTris(D.tray); const only = propMeshes; void only; const before = out.length; crossings(t, t.map(triBox), bbox(t), 'tray', () => 'tray', out);
      for (let i = out.length - 1; i >= before; i--) if (!/^hatch|^roof/.test(out[i].prop)) out.splice(i, 1); }   // the tray is set down on the shelf on purpose; the rail, the kerb and the deck it must clear
    const bk = D.bucket;
    if (bk && bk.visible && G.state.tam.present) {
      bk.updateMatrixWorld(true); const e = bk.matrixWorld.elements, base = e[13];
      p.set(e[12], e[13] + D.bucketGrip, e[14]); const hand = D.tam.handWorld('L', a), gap = hand.distanceTo(p);   // the neighbour carries it in the left hand
      if (base > 0.02 && gap > 0.07) { const pr = G.project(p); out.push({ who: 'bucket', prop: 'air', tag: 'bucket', pairs: 1, x: Math.round(pr.x), y: Math.round(pr.y), on: pr.on, at: [+e[12].toFixed(2), +base.toFixed(2), +e[14].toFixed(2)], gap: +gap.toFixed(3) }); }
      if (base < -0.01 && gap > 0.07) out.push({ who: 'bucket', prop: 'deck', tag: 'bucket', pairs: 1, x: 0, y: 0, on: true, at: [+e[12].toFixed(2), +base.toFixed(2), +e[14].toFixed(2)] });
    }
    return out;
  }
  // pose: the things a person watching would call broken, measured on the posed skeletons and the drawn props.
  //   stride  someone standing still with one foot far ahead of the other (a walk frame held: the statue)
  //   plank   someone standing tipped over from the ankles
  //   hat     her hat tipped like a plate while she stands
  //   inside  someone standing with a foot inside the shelf, a bed or the barrel
  //   post    the grab post drawn across the tray while the neighbour stands holding it
  //   tray    the tray anywhere but on the hands that are carrying it
  //   offer   the by-hand ending's last picture: the cup in her hand at her chest, his open hand under it (round twelve)
  //   cuphook the cup hooked on her belt while both her hands are on the tray (round twelve)
  const L = { shelf: [-2.5, 0.1, 3.57, 4.33], beds: [[-5.6, -2.6, -2.4, -1.4], [-1.9, 1.1, -2.4, -1.4], [1.8, 4.8, -2.4, -1.4]], barrel: [4.7, 2.5, 0.45] };
  const POST = [0.25, 0.4, 0.55, 0.7, 0.85, 0.95].map((y) => new V3(-2.7, y, 4.9));
  const mem = { jo: { x: 0, z: 0, t: -9, still: 0 }, tam: { x: 0, z: 0, t: -9, still: 0 } };
  const fp = { l: new V3(), r: new V3(), h: new V3(), pv: new V3() }, up = new V3(), q = new V3(), M4 = new T.Matrix4();
  function pose() {
    const out = [], s = G.state; D.scene.updateMatrixWorld(true);
    const add = (who, tag, extra) => { const pr = G.project(fp.pv); out.push({ who, tag, x: Math.round(pr.x), y: Math.round(pr.y), ...extra }); };
    for (const k in figs) {
      if (!present(k)) { mem[k].still = 0; continue; }
      const f = figs[k], S = k === 'jo' ? s.jo : s.tam, m = mem[k], dt = s.time - m.t;
      const moved = Math.hypot(S.pos.x - m.x, S.pos.z - m.z); m.still = dt > 0 && dt < 1.5 && moved < 0.01 ? m.still + dt : 0; m.x = S.pos.x; m.z = S.pos.z; m.t = s.time;
      fp.l.setFromMatrixPosition(f.bones.foot_l.matrixWorld); fp.r.setFromMatrixPosition(f.bones.foot_r.matrixWorld); fp.h.setFromMatrixPosition(f.bones.Head.matrixWorld); fp.pv.setFromMatrixPosition(f.bones.pelvis.matrixWorld);
      const rootY = f.root.position.y, upright = fp.pv.y - rootY > f.D.pelvis * 0.9, onDeck = Math.abs(rootY) < 0.02;
      const stairs = k === 'jo' ? (S.action === 'climb' || S.action === 'descend') : (S.stage === 'climbing' || S.stage === 'leaving');
      const kneeling = k === 'jo' && ((S.action === 'scoop' && S.target === 'valve') || S.dip > 0), going = k === 'jo' && (S.action === 'walk' || S.action === 'carry');
      if (m.still < (going ? 1.2 : 0.7) || stairs || !upright || kneeling) { m.stride = 0; continue; }      // moving, on the stairs, sitting, kneeling, crouching: other rules
      // feet: in the figure's own frame, how far one is ahead of the other
      f.toFigure(fp.l, a); f.toFigure(fp.r, b); const split = Math.abs(a.z - b.z);
      m.stride = split > 0.24 ? (m.stride || 0) + dt : 0;      // held, not passed through on the way up from a knee
      if (m.stride > 0.35) add(k, 'stride', { gap: +split.toFixed(2) });
      // the whole body tipped: ankles to head, off the vertical
      q.copy(fp.l).add(fp.r).multiplyScalar(0.5); const lean = Math.atan2(Math.hypot(fp.h.x - q.x, fp.h.z - q.z), fp.h.y - q.y);
      if (lean > 0.3) add(k, 'plank', { gap: +lean.toFixed(2) });
      if (onDeck) for (const ft of [fp.l, fp.r]) {
        const inR = (r) => ft.x > r[0] + 0.03 && ft.x < r[1] - 0.03 && ft.z > r[2] + 0.03 && ft.z < r[3] - 0.03;
        if (inR(L.shelf) || L.beds.some(inR) || Math.hypot(ft.x - L.barrel[0], ft.z - L.barrel[1]) < L.barrel[2] - 0.03) { add(k, 'inside', { at: [+ft.x.toFixed(2), +ft.z.toFixed(2)] }); break; }
      }
    }
    // her hat, while she stands: its own up against the world's
    const hat = D.held[1];
    if (present('jo') && hat && hat.visible && !s.jo.hatOff && mem.jo.still > 0.3 && s.jo.action !== 'sit' && !(s.jo.dip > 0) && !(s.jo.action === 'scoop' && s.jo.target === 'valve')) {
      const e = hat.matrixWorld.elements; up.set(e[4], e[5], e[6]).normalize(); const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      if (tilt > 0.62) { fp.pv.setFromMatrixPosition(hat.matrixWorld); add('jo', 'hat', { gap: +tilt.toFixed(2) }); }
    }
    // hatbrim: her hat never passes through the neighbour: his face, neck, hair or cap (round eleven: in the by-hand
    // ending her brim cut through his chin and neck)
    // hatarm: her own arm, hand and the cup never pass through her hat brim (round eleven: at the barrel the cup went up
    // through the brim and hung at head height)
    if (present('jo') && hat && hat.visible) {
      const ht = []; hat.traverse((o) => { if (o.isMesh) for (const t of meshTris(o)) { t.tag = 'hat'; ht.push(t); } });
      if (present('tam')) { prepFig(figs.tam); const tt = partTris('tam', /^(Head|neck_01|spine_03|clavicle_)/); const cap = D.held[2]; if (cap && cap.visible) cap.traverse((o) => { if (o.isMesh) for (const t of meshTris(o)) { t.tag = 'cap'; tt.push(t); } });
        const hit = crossAny(ht, tt); if (hit) { fp.pv.setFromMatrixPosition(hat.matrixWorld); add('jo', 'hatbrim', { holder: hit }); } }
      prepFig(figs.jo); const at = armTris('jo'); D.jo.cup.traverse((o) => { if (o.isMesh && D.jo.cup.visible) for (const t of meshTris(o)) { t.tag = 'cup'; at.push(t); } });
      const hit = !s.jo.hatOff && crossAny(ht, at); if (hit) { fp.pv.setFromMatrixPosition(hat.matrixWorld); add('jo', 'hatarm', { holder: hit, action: s.jo.action }); }
      // and the cup is never held up at her head: while she fills it at the barrel it stays below her chest (round thirteen:
      // below the chin was not enough: up at her collarbone, seen from above, it still read as hovering at head height),
      // and from the camera neither the cup nor her cup hand is ever behind her own brim
      if (s.jo.action === 'scoop' && s.jo.target !== 'valve') { const cw = new V3().setFromMatrixPosition(D.jo.cup.matrixWorld), cy = cw.y, chest = new V3().setFromMatrixPosition(figs.jo.bones.spine_03.matrixWorld).y + 0.05;
        if (cy > chest) { fp.pv.copy(cw); add('jo', 'cuphigh', { gap: +(cy - chest).toFixed(2) }); }
        const cp0 = D.camera.position, hb = []; hat.traverse((o) => { if (o.isMesh) hb.push(o); });
        for (const [nm, pt] of [['cup', cw], ['hand', new V3().setFromMatrixPosition(figs.jo.bones.hand_r.matrixWorld)]]) { const rc = new T.Raycaster(cp0, pt.clone().sub(cp0).normalize(), 0, cp0.distanceTo(pt));
          if (rc.intersectObjects(hb, false).length) { fp.pv.copy(pt); add('jo', 'cuphigh', { holder: nm + ' behind her brim' }); } } }
    }
    // shirt: her shirt is tucked in. Below the belt, where the camera looks at her thighs and the fork of her trousers,
    // the first of her it meets is trousers (or an arm passing in front), never the shirt (round eleven: the owner saw the
    // bottom of her shirt showing through her trousers). Twenty-one points down both thighs (from a third of the way to the knee: at the hip crease a tucked shirt may blouse over the belt) and the fork, looked at four times a second, two looks running.
    if (present('jo') && s.fade > 0.5 && s.time - (mem.shLast ?? -9) >= 0.25) {
      mem.shLast = s.time;
      const f = figs.jo, B = f.bones, tl = new V3().setFromMatrixPosition(B.thigh_l.matrixWorld), tr = new V3().setFromMatrixPosition(B.thigh_r.matrixWorld), cl = new V3().setFromMatrixPosition(B.calf_l.matrixWorld), cr = new V3().setFromMatrixPosition(B.calf_r.matrixWorld);
      const fork = tl.clone().add(tr).multiplyScalar(0.5).lerp(cl.clone().add(cr).multiplyScalar(0.5), 0.12);
      let bad = 0, n = 0, which = [];
      const side = new V3().subVectors(fork, cp).cross(new V3(0, 1, 0)).normalize(), pts = [];
      for (const base of [tl.clone().lerp(cl, 0.3), tr.clone().lerp(cr, 0.3), tl.clone().lerp(cl, 0.45), tr.clone().lerp(cr, 0.45), tl.clone().lerp(cl, 0.65), tr.clone().lerp(cr, 0.65), fork]) for (const o of [-0.05, 0, 0.05]) pts.push(base.clone().addScaledVector(side, o));
      for (const pt of pts) {
        const pr = G.project(pt); if (pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight || D.render.pxPerMetre(pt) * 0.05 <= 1.5) continue;   // (as for caps: smaller than that it cannot be seen)
        dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L + 0.25;
        const h = ray.intersectObjects(f.meshes.filter((m) => m.visible), false)[0]; if (!h) continue; n++;
        if (h.object.userData.role !== 'torso' || L - h.distance > 0.12) continue;   // (shirt cloth AT the leg, not her chest leaning out over it)
        const m = h.object, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, names = m.skeleton.bones.map((x) => x.name);
        let arm = 0; for (const vi of [h.face.a, h.face.b, h.face.c]) for (let c4 = 0; c4 < 4; c4++) if (ARMSET.test(names[si.getComponent(vi, c4)])) arm += sw.getComponent(vi, c4);
        if (arm < 1.5) { bad++; which.push(pts.indexOf(pt)); } }
      mem.sh = bad ? (mem.sh || 0) + 1 : 0;
      if (mem.sh >= 2) { fp.pv.copy(fork); add('jo', 'shirt', { gap: bad + '/' + n + ' at ' + which.join(',') }); mem.sh = 0; }
    }
    // the tray: on the hands that carry it, and never behind the grab post while the neighbour stands with it
    const tray = D.tray;
    if (tray && tray.visible) {
      const e = tray.matrixWorld.elements; fp.pv.set(e[12], e[13], e[14]);
      if (s.jo.carrying && present('jo')) {
        a.setFromMatrixPosition(figs.jo.bones.hand_l.matrixWorld).add(b.setFromMatrixPosition(figs.jo.bones.hand_r.matrixWorld)).multiplyScalar(0.5);
        const gap = a.distanceTo(fp.pv); if (gap > 0.42) add('tray', 'tray', { gap: +gap.toFixed(2), holder: 'jo' });
      } else if (present('tam') && s.tam.hasTray) {
        const far = Math.max(...['l', 'r'].map((h) => a.setFromMatrixPosition(figs.tam.bones['hand_' + h].matrixWorld).distanceTo(fp.pv)));
        if (far > 0.62) add('tray', 'tray', { gap: +far.toFixed(2), holder: 'tam' });
        if (mem.tam.still > 0.7) {      // the post across it, as the camera sees it
          const c = [[-0.43, 0.04, -0.28], [0.43, 0.04, -0.28], [0.43, 0.04, 0.28], [-0.43, 0.04, 0.28]].map((v) => G.project(p.set(v[0], v[1], v[2]).applyMatrix4(tray.matrixWorld)));
          const inside = (pt) => { let sign = 0; for (let i = 0; i < 4; i++) { const u = c[i], v = c[(i + 1) % 4], cr = (v.x - u.x) * (pt.y - u.y) - (v.y - u.y) * (pt.x - u.x); if (Math.abs(cr) < 1e-6) continue; if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); } return true; };
          const camD = (v) => v.distanceTo(D.camera.position);
          if (c.every((v) => v.on || !v.behind) && POST.some((pt) => inside(G.project(pt)) && camD(pt) < camD(fp.pv))) add('tray', 'post', { holder: 'tam' });
        }
      }
    }
    // across: while the neighbour carries the tray (on the stairs, out on the roof, standing), nothing fixed is drawn
    // across it. Seven points along its middle: some hidden and some not is a post, a rail or an edge cutting it.
    if (tray && tray.visible && present('tam') && s.tam.hasTray && s.fade > 0.9) {
      const self = []; tray.traverse((o) => { if (o.isMesh) self.push(o); });
      let hid = 0, n = 0, by = null;
      for (let i = 0; i < 7; i++) { p.set(-0.4 + i * 0.8 / 6, 0.05, 0).applyMatrix4(tray.matrixWorld); const pr = G.project(p); if (!pr.on || pr.behind) continue; n++;
        if (!inSight(p, self, fixedOcc)) { hid++; by = inSight.last; } }
      if (n >= 5 && hid > 0 && hid < n) { fp.pv.setFromMatrixPosition(tray.matrixWorld); add('tray', 'across', { holder: by, gap: hid + '/' + n }); }
    }
    // crouch: climbing the stairs, nobody walks crouched. Both knees far ahead of their own feet at once is a squat;
    // measured as the smaller of the two (knee ahead of foot, figure space), averaged over the last second of the climb.
    // Round ten: the neighbour's knees bent in and crossed as he carried the tray up the last flight.
    for (const k in figs) {
      const S = k === 'jo' ? s.jo : s.tam, m = mem[k], up = k === 'jo' ? S.action === 'climb' : S.stage === 'climbing';
      if (!present(k) || !up) { m.crouch = []; continue; }
      const f = figs[k], kz = (sd) => f.toFigure(c.setFromMatrixPosition(f.bones['calf_' + sd].matrixWorld), q).z - f.toFigure(c.setFromMatrixPosition(f.bones['foot_' + sd].matrixWorld), q).z;
      m.crouch = (m.crouch || []).filter((x) => s.time - x.t < 1.0); m.crouch.push({ t: s.time, v: Math.min(kz('l'), kz('r')) });
      const mean = m.crouch.reduce((u, x) => u + x.v, 0) / m.crouch.length;
      if (m.crouch.length >= 6 && mean > 0.14) { fp.pv.setFromMatrixPosition(f.bones.pelvis.matrixWorld); add(k, 'crouch', { gap: +mean.toFixed(2) }); }
    }
    // trayface: carrying the tray, the neighbour's face is never behind its pots or their stakes (round ten: the stakes
    // crossed his face and cap on the stairs). Both eyes and the cap's peak, against the tray and the pots on it.
    if (tray && tray.visible && present('tam') && s.tam.hasTray && s.fade > 0.2) {
      const occ = []; tray.traverse((o) => { if (o.isMesh) occ.push(o); }); for (let i = 6; i < 12; i++) if (D.potMeshes && D.potMeshes[i]) D.potMeshes[i].traverse((o) => { if (o.isMesh && shown(o)) occ.push(o); });
      const e = info.tam.eyes; let hid = 0, by = null;
      for (const pt of e(c)) { const pr = G.project(pt); if (!pr.on || pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight) continue; if (!inSight(pt, null, occ)) { hid++; by = inSight.last; } }
      // (held for 0.4 s: a stake passing the eye for one frame as he turns is not a face behind the tray)
      const tdt = Math.min(0.5, s.time - (mem.faceT ?? s.time)); mem.faceT = s.time; mem.face = hid ? (mem.face || 0) + tdt : 0;
      if (hid && mem.face >= 0.4) { fp.pv.copy(e(c)[0]); add('tam', 'trayface', { holder: by, gap: hid + '/3' }); }
    } else { mem.face = 0; mem.faceT = null; }
    // tap: kneeling at Marlow's tap, her face is clear of the brass (head at least 20 cm from the standpipe's axis) and
    // her hat brim does not pass through the tap or its cross handle (round ten: face in the pipe, brim through the handle)
    if (present('jo') && s.jo.action === 'scoop' && s.jo.target === 'valve') {
      const tp = window.__tapProp || (window.__tapProp = propMeshes.find((P) => { P.mesh.geometry.computeBoundingBox(); const bb = P.mesh.geometry.boundingBox.clone().applyMatrix4(P.mesh.matrixWorld); return bb.containsPoint(new V3(0.6, 0.64, -1.34)) && bb.max.y < 1.2; }));
      const hd = info.jo.eyes()[2], axis = Math.hypot(hd.x - 0.6, hd.z + 1.34);   // (between the eyes: the face, not the back of the skull)
      if (axis < 0.2 && hd.y < 1.2) { fp.pv.copy(hd); add('jo', 'tapface', { gap: +axis.toFixed(2) }); }
      const hat = D.held[1];
      if (tp && hat && hat.visible) { propTris(tp); let hit = false;
        hat.traverse((o) => { if (hit || !o.isMesh) return; const ht = meshTris(o), hb = bbox(ht);
          for (let i = 0; i < tp.tris.length && !hit; i++) { if (!overlap(tp.boxes[i], hb)) continue; for (const t of ht) if (overlap(tp.boxes[i], triBox(t)) && triTri(t[0], t[1], t[2], tp.tris[i][0], tp.tris[i][1], tp.tris[i][2])) { hit = true; break; } } });
        if (hit) { fp.pv.setFromMatrixPosition(hat.matrixWorld); add('jo', 'taphat', {}); } }
    }
    // carry: while she carries the full tray off and all through the dip to dark (every frame of the fade, not only the
    // lit ones), nothing fixed is drawn across the tray or its pots. Round ten: the shelf's rail post stood inside the
    // right column of pots as the picture faded. Eighteen points: the six pot columns at three heights.
    if (tray && tray.visible && present('jo') && s.jo.carrying) {
      let hid = 0, by = null;
      for (const sx of [-0.28, 0, 0.28]) for (const sz of [-0.14, 0.14]) for (const y of [0.04, 0.16, 0.28]) {
        p.set(sx, y, sz).applyMatrix4(tray.matrixWorld); const pr = G.project(p); if (!pr.on || pr.behind) continue;
        if (!inSight(p, null, fixedOcc)) { hid++; by = inSight.last; } }
      if (hid) { fp.pv.setFromMatrixPosition(tray.matrixWorld); add('tray', 'carry', { holder: by, gap: hid + '/18', fade: +s.fade.toFixed(2) }); }
    }
    // trayhome: the neighbour goes back down the stairs and in at the door of 4B with empty hands. With the tray the
    // reviewer saw it push into the door frame and ride low on the treads; nothing else he could hold fits that stair.
    if (tray && tray.visible && present('tam') && ['back', 'leaving', 'home'].includes(s.tam.stage) && s.fade > 0.2) { fp.pv.setFromMatrixPosition(tray.matrixWorld); add('tray', 'trayhome', { holder: 'tam' }); }
    // potcount: while the tray full of new pots is held up in the picture, the camera sees at least four of its six
    // pots (the middle of each, not hidden by the others, the people or the roof). Seen end on at eye height the rows
    // stand behind one another, two pots show of six, and the pots seem to leave the tray with nobody touching them.
    if (tray && tray.visible && s.fade > 0.9 && D.potMeshes && !s.pots[6].present && ((present('tam') && s.tam.hasTray && ((s.tam.stage === 'top' && s.tam.stageT > 2.5) || s.tam.stage === 'handoff')) || s.jo.carrying)) {
      const worn = [D.held[1], D.held[2]], occ = fixedOcc.concat(loose.filter((o) => shown(o) && !worn.includes(o))); let seen = 0, on = 0;   // (a person or a hat passing in front is not a pot leaving)
      // each pot: rays to nine points of its own box (its rim, its middle, its plant). Any ray whose first hit is that
      // pot is the pot seen.
      const B3 = new T.Box3(), ctr = new V3(), hs = new V3();
      for (let k = 6; k < 12; k++) { const m = D.potMeshes[k]; if (!m || !shown(m)) continue;
        B3.setFromObject(m); B3.getCenter(ctr); B3.getSize(hs).multiplyScalar(0.35);
        const pr = G.project(ctr); if (!pr.on || pr.behind) continue; on++;
        let hit = false;
        for (const [ux, uy, uz] of [[0, 0, 0], [1, 0.6, 0], [-1, 0.6, 0], [0, 0.6, 1], [0, 0.6, -1], [0, 1, 0], [0.7, -0.4, 0.7], [-0.7, -0.4, 0.7], [0, 0.3, 0]]) {
          const pt = ctr.clone().add(new V3(ux * hs.x, uy * hs.y, uz * hs.z)); dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L + 0.5;
          const h = ray.intersectObjects(occ, false).find((x) => shown(x.object)); if (h && h.object === m) { hit = true; break; } }
        if (hit) seen++; }
      // what counts is a DROP: two pots fewer than were seen a moment ago, held for a quarter second, while nobody's
      // hands go near them. (At eye height a row may always stand behind another; that is not pots leaving.)
      const pdt = Math.min(0.5, s.time - (mem.potT ?? s.time)); mem.potT = s.time;
      mem.potHist = (mem.potHist || []).filter((x) => s.time - x.t < 4); if (on >= 5) mem.potHist.push({ t: s.time, n: seen });
      const was = Math.max(0, ...mem.potHist.map((x) => x.n));
      mem.pots = on >= 5 && was - seen >= 2 ? (mem.pots || 0) + pdt : 0;
      if (mem.pots > 0.25) { fp.pv.setFromMatrixPosition(tray.matrixWorld); add('tray', 'potcount', { gap: seen + '/6 after ' + was + '/6' }); }
    } else { mem.pots = 0; mem.potT = null; mem.potHist = []; }
    // apart: the two people never stand inside each other. Chest to chest at least 38 cm, hips at least 30.
    if (present('jo') && present('tam') && !(s.tam.y < -0.3)) {
      const cj = a.setFromMatrixPosition(figs.jo.bones.spine_03.matrixWorld), ct = b.setFromMatrixPosition(figs.tam.bones.spine_03.matrixWorld);
      const dc = Math.hypot(cj.x - ct.x, cj.z - ct.z);
      const pj = c.setFromMatrixPosition(figs.jo.bones.pelvis.matrixWorld), pt = q.setFromMatrixPosition(figs.tam.bones.pelvis.matrixWorld), dp = Math.hypot(pj.x - pt.x, pj.z - pt.z);
      if (dc < 0.38 || dp < 0.3) { fp.pv.copy(cj); add('jo', 'apart', { gap: +Math.min(dc, dp).toFixed(2) }); }
    }
    // handclear (round fourteen): the night after, by hand, from the moment he comes up with the bucket until she kneels
    // to it: in the picture neither of her hands (wrist or middle fingertip) comes within 7 cm of his body. Measured in
    // the picture, not the room: a hand a metre off him in depth, drawn over his back, still reads as her grabbing him
    // (the 7.6 review: while he bent to set the bucket down her left hand landed on his side on desk, his hip on phone).
    if (s.ending === 'hand' && s.beat === 'epilogue' && present('jo') && present('tam') && s.tam.bucket && (s.tam.stage === 'out' || s.tam.stage === 'top') && !(s.jo.dip > 0) && !(s.jo.offer > 0) && s.jo.action !== 'pour' && s.fade > 0.5) {
      const vv = new V3(), W2 = innerWidth, H2 = innerHeight; cam.updateMatrixWorld(); const camR = new V3().setFromMatrixColumn(cam.matrixWorld, 0);
      const px = (w) => { const q2 = w.clone().project(cam); return [(q2.x + 1) / 2 * W2, (1 - q2.y) / 2 * H2, q2.z]; };
      if (!mem.tamPts) { mem.tamPts = []; for (const m of figs.tam.meshes) { if (/hair|eyes|brow/.test(m.userData.role)) continue; const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i += 5) mem.tamPts.push([m, i]); } }
      const tp = mem.tamPts.map(([m, i]) => { m.getVertexPosition(i, vv); vv.applyMatrix4(m.matrixWorld); return px(vv); });
      let worst = 1e9, at = null;
      for (const bn of ['hand_l', 'hand_r', 'middle_03_l', 'middle_03_r']) { const bo = figs.jo.bones[bn]; if (!bo) continue; const w = new V3().setFromMatrixPosition(bo.matrixWorld), a2 = px(w), lim = Math.hypot(...px(w.clone().addScaledVector(camR, 0.07)).slice(0, 2).map((x, k) => x - a2[k]));
        for (const t of tp) { const d = Math.hypot(t[0] - a2[0], t[1] - a2[1]) / lim; if (d < worst) { worst = d; at = w; } } }
      const cdt = Math.min(0.5, s.time - (mem.hcT ?? s.time)); mem.hcT = s.time; mem.hc = worst < 1 ? (mem.hc || 0) + cdt : 0;
      if (mem.hc >= 0.2 && at) { fp.pv.copy(at); add('jo', 'handclear', { gap: +worst.toFixed(2) }); mem.hc = 0; }
    } else { mem.hc = 0; mem.hcT = null; }
    // offer (round twelve): the by-hand ending's last picture. Once she has held the cup out for 2.5 s, and on through the
    // last line and under the card: the cup is in HER right hand (its foot within 26 cm of her wrist bone: 22 in her grip), at her chest (its foot between her waist and her chin),
    // out between the two of them; his left hand is open under it (palm 2 to 13 cm below its foot, within 9 cm across);
    // she stands plainly (both knees straighter than 160 degrees) with her free left hand down at her side (no higher than 10 cm over her hip joints, not behind her).
    // Round eleven gave the cup to him: he held it at his belly and she stood empty-handed in a half squat.
    mem.offer = s.jo.offer > 0.99 ? (mem.offer || 0) + (s.time - (mem.t2 || s.time)) : 0; mem.t2 = s.time;
    if (present('tam') && present('jo') && mem.offer > 2.5) {
      const cup = D.jo.cup, B = figs.jo.bones, W = (bo) => new V3().setFromMatrixPosition(bo.matrixWorld), foot = W(cup); fp.pv.copy(foot);
      const hr = W(B.hand_r), hl = W(B.hand_l), pel = W(B.pelvis), chin = W(B.neck_01), th = W(figs.tam.bones.hand_l), cj = W(B.spine_03), ct = W(figs.tam.bones.spine_03);
      const knee = (s2) => { const a2 = W(B['thigh_' + s2]), b2 = W(B['calf_' + s2]), c2 = W(B['foot_' + s2]); return a2.sub(b2).angleTo(c2.sub(b2)) * 180 / Math.PI; };
      const why = [];
      if (!cup.visible || foot.distanceTo(hr) > 0.26) why.push('not in her hand ' + foot.distanceTo(hr).toFixed(2));
      if (foot.y < pel.y + 0.15 || foot.y > chin.y) why.push('not at her chest ' + (foot.y - pel.y).toFixed(2));
      const along = (() => { const dx = ct.x - cj.x, dz = ct.z - cj.z, L2 = dx * dx + dz * dz; return ((foot.x - cj.x) * dx + (foot.z - cj.z) * dz) / L2; })();
      if (along < 0.25 || along > 0.8) why.push('not between them ' + along.toFixed(2));
      const below = foot.y - th.y, across = Math.hypot(th.x - foot.x, th.z - foot.z);
      if (below < 0.02 || below > 0.13 || across > 0.09) why.push('his hand not under it ' + below.toFixed(2) + '/' + across.toFixed(2));
      const kl = knee('l'), kr = knee('r'); if (Math.min(kl, kr) < 160) why.push('knees ' + kl.toFixed(0) + '/' + kr.toFixed(0));
      const hf = figs.jo.toFigure(hl.clone(), new V3()), pf = figs.jo.toFigure(pel.clone(), new V3()); if (hf.y > pf.y + 0.1 || hf.z < pf.z - 0.08) why.push('free hand up or behind her ' + (hf.y - pf.y).toFixed(2) + '/' + (hf.z - pf.z).toFixed(2));
      if (why.length) add('cup', 'offer', { holder: why.join('; ') });
    }
    // cuphook (round twelve): while both her hands are on the tray the cup is hooked on her belt, never in the air beside
    // her. The top of its handle meets her clothes (within 3 cm of the cloth) at her waistband (6 to 24 cm over her
    // pelvis), and the cup's middle is outside her and against her: its axis no more than 11 cm and no less than 4.5 cm from her cloth (the cup is 6 cm across the middle).
    // Round eleven hung it 21 cm out from her pelvis with nothing holding it.
    if (present('jo') && s.jo.cupHeld === false && D.jo.cup.visible && s.fade > 0.5) {
      const cup = D.jo.cup; cup.updateMatrixWorld(true); const hook = new V3(0, 0.12, -0.113).applyMatrix4(cup.matrixWorld), mid = new V3(0, 0.065, 0).applyMatrix4(cup.matrixWorld);
      const pel = new V3().setFromMatrixPosition(figs.jo.bones.pelvis.matrixWorld);
      let dh = 9, dm = 9; const v = new V3();
      for (const m of figs.jo.meshes) { if (!/torso|legs/.test(m.userData.role)) continue; m.updateMatrixWorld(true); const n = m.geometry.attributes.position.count;
        for (let i = 0; i < n; i += 2) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); const a2 = v.distanceTo(hook), b2 = v.distanceTo(mid); if (a2 < dh) dh = a2; if (b2 < dm) dm = b2; } }
      const why = [];
      if (dh > 0.03) why.push('handle off her ' + dh.toFixed(3));
      if (hook.y - pel.y < 0.06 || hook.y - pel.y > 0.24) why.push('not at the belt ' + (hook.y - pel.y).toFixed(2));
      if (dm > 0.11 || dm < 0.045) why.push('cup body ' + dm.toFixed(3));
      if (why.length) { fp.pv.copy(mid); add('cup', 'cuphook', { holder: why.join('; '), action: s.jo.action }); }
    }
    void M4; return out;
  }
  // scene: faults a blind reviewer saw that are about what is drawn over time, not one pose.
  //   stream  the water leaves the cup's lip (within 3 cm), the cup is drawn and in her hand, and nothing on the roof
  //           hides the cup from the camera (a cup hidden behind a plant, or the same colour as the pots, read as
  //           water pouring out of the air)
  //   vanish  nothing that was on screen and in sight (a person, the bucket, the tray, the book, the cup) stops being
  //           drawn while the picture is up: it leaves the frame, goes behind something, or the picture fades
  //   frozen  nobody standing in a conversation holds one pose: over any 4 s their head turns 3 degrees or more, or
  //           their chest or a hand moves 1.5 cm
  //   book    the open book is the real model, and both her hands are on it while she reads (the left may go to the leaf)
  //   bucket  the night after, by hand: once the bucket is set down, at least a third of it is in sight in every shot
  //   gaze    reading, she never looks into the camera (round nine: she stared into the lens over the book)
  //   source  with an empty cup, the water she needs is on screen (round nine: the tap was off a phone's edge)
  const ink = { jo: [], tam: [] }, seen = new Map(), hd = new V3(), ch = new V3(), hl = new V3(), hr = new V3(), q4 = new T.Quaternion();
  const sightOcc = () => fixedOcc.concat(loose.filter(shown), window.__gatePole ? [window.__gatePole] : []);
  function inSight(pt, self, occ) {
    const pr = G.project(pt); if (!pr || pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight) return false;
    dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.far = L - 0.03; ray.near = 0;
    const vis = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    const hit = ray.intersectObjects(occ, false).find((h) => (!self || !self.includes(h.object)) && vis(h.object) && !(h.object.material && (h.object.material.opacity < 0.5 || h.object.material.colorWrite === false))); inSight.last = hit ? (hit.object.name || hit.object.parent && hit.object.parent.name || hit.object.type) + (hit.object.userData.role ? ':' + hit.object.userData.role : '') : null; return !hit;
  }
  const meshesOf = (o) => { const m = []; o.traverse((x) => { if (x.isMesh) m.push(x); }); return m; };
  function scene() {
    const out = [], s = G.state; D.scene.updateMatrixWorld(true); const occ = sightOcc();
    const add = (who, tag, at, extra) => { const pr = G.project(at); out.push({ who, tag, x: Math.round(pr.x), y: Math.round(pr.y), ...extra }); };
    // ---- ring: no chalk ring drawn over the tray while it is in the picture (round ten: a faint circle sat on the
    // neighbour's tray during the hand-over; the ring is drawn in screen space and the tray moved under it)
    if (D.tray && D.tray.visible) {
      const tc = G.project(new V3().setFromMatrixPosition(D.tray.matrixWorld));
      for (const c of document.querySelectorAll('#sh-ui svg.fx circle.ring')) { if (+c.getAttribute('opacity') <= 0.05) continue;
        const d = Math.hypot(+c.getAttribute('cx') - tc.x, +c.getAttribute('cy') - tc.y); if (d < 140) { add('tray', 'ring', new V3().setFromMatrixPosition(D.tray.matrixWorld), { gap: Math.round(d) }); break; } }
    }
    // ---- hatface: her hat brim is never drawn across the neighbour's face or neck (round eleven: in the by-hand ending
    // she stood in front of him as he came up, and from the camera her brim cut through his chin and neck). Four points:
    // his two eyes, between them, and his chin and throat. Any one behind her hat (or her head) for 0.3 s is a fault.
    if (present('jo') && present('tam') && s.fade > 0.9 && D.held[1] && D.held[1].visible && info.tam.eyes) {
      const hatM = meshesOf(D.held[1]), joHead = figs.jo.meshes.filter((m) => /hair|skin|brow|eyes/.test(m.userData.role));
      const [e1, e2, em] = info.tam.eyes(), nk = new V3().setFromMatrixPosition(figs.tam.bones.neck_01.matrixWorld), chin = em.clone().lerp(nk, 0.6);
      // (round thirteen: the whole face and neck, not four points: the brim cut his jaw and throat between them. Mouth,
      // both sides of the jaw, the chin and the throat; one in four of these behind her hat is a fault)
      const ac = e1.clone().sub(e2), mouth = em.clone().lerp(nk, 0.35), jaw = em.clone().lerp(nk, 0.5), throat = em.clone().lerp(nk, 0.9);
      const pts = [e1, e2, em, chin, mouth, jaw.clone().addScaledVector(ac, 0.7), jaw.clone().addScaledVector(ac, -0.7), throat, throat.clone().addScaledVector(ac, 0.6), throat.clone().addScaledVector(ac, -0.6)];
      let hid = 0;
      for (const pt of pts) { const pr = G.project(pt); if (pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight) continue;
        dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L - 0.02;
        const h = ray.intersectObjects(hatM.concat(joHead), false)[0]; if (h) hid++; }
      const hdt = Math.min(0.5, s.time - (mem.hfT ?? s.time)); mem.hfT = s.time; mem.hf = hid ? (mem.hf || 0) + hdt : 0;
      if (mem.hf >= 0.3) { add('jo', 'hatface', em, { gap: hid + '/' + pts.length }); mem.hf = 0; }
    } else { mem.hf = 0; mem.hfT = null; }
    // ---- stream
    if (D.water && typeof D.water.flowing() !== 'boolean') add('cup', 'loose', new V3(), { holder: 'water visibility not a boolean: three.js draws it' });
    if (D.water && D.water.flowing()) {
      const st = D.water.start(new V3()), lip = D.jo.lip(new V3()), cupAt = new V3().setFromMatrixPosition(D.jo.cup.matrixWorld), hand = new V3().setFromMatrixPosition(figs.jo.bones.hand_r.matrixWorld);
      const gap = st.distanceTo(lip);
      const u = s.jo.actionDur ? s.jo.actionT / s.jo.actionDur : 0, pouring = s.jo.action === 'pour' && u > 0.16 && u < 0.83;
      if (pouring && (!D.jo.cup.visible || gap > 0.03 || cupAt.distanceTo(hand) > 0.32)) add('cup', 'stream', st, { gap: +gap.toFixed(3) });
      if (!pouring && !D.jo.cup.visible) add('cup', 'stream', st, { holder: 'no cup' });
      // loose: a rope of water drawn while the cup is not pouring is water in the air with nothing pouring it (round nine)
      if (!(s.jo.action === 'pour' && u > 0.15 && u < 0.845)) add('cup', 'loose', st, { holder: s.jo.action + ' ' + u.toFixed(2) });
      // five points on the cup (base, middle, lip, and either side of the middle across the view): two must be in sight,
      // so a thin feed-line hoop across it is not a hidden cup, and a plant in front of it is
      const mid = cupAt.clone().lerp(lip, 0.5), side = new V3().subVectors(mid, cp).cross(new V3(0, 1, 0)).normalize().multiplyScalar(0.045), self = meshesOf(D.jo.cup);
      let vis = 0, by = null; for (const pt of [cupAt.clone().lerp(lip, 0.15), mid, cupAt.clone().lerp(lip, 0.9), mid.clone().add(side), mid.clone().sub(side)]) { if (inSight(pt, self, occ)) vis++; else by = inSight.last; }
      const pm = G.project(mid), onScreen = !pm.behind && pm.x > 0 && pm.y > 0 && pm.x < innerWidth && pm.y < innerHeight;
      if (vis < 2 && onScreen) add('cup', 'hidden', mid, { prop: by });   // (a pour the camera is not on is not water from the air)
    }
    // ---- vanish
    const things = { jo: [figs.jo.root, () => present('jo'), figs.jo.bones.Head], tam: [figs.tam.root, () => present('tam'), figs.tam.bones.Head],
      bucket: [D.bucket], tray: [D.tray], book: [D.book], cup: [D.jo.cup] };
    for (const k in things) {
      const [o, on, bone] = things[k], drawn = on ? on() && o.visible : o.visible && (!o.parent || o.parent.visible !== false);
      const pt = new V3().setFromMatrixPosition((bone || o).matrixWorld); if (!bone && k === 'bucket') pt.y += 0.25;
      const was = seen.get(k);
      if (was && was.drawn && was.sight && !drawn && s.fade > 0.9 && was.fade > 0.9) out.push({ who: k, tag: 'vanish', x: was.x, y: was.y });
      const pr = G.project(pt); seen.set(k, { drawn, sight: drawn && inSight(pt, null, occ), fade: s.fade, x: Math.round(pr.x), y: Math.round(pr.y) });
    }
    // ---- frozen
    const talking = s.tam.present && (s.tam.stage === 'top' || s.tam.stage === 'handoff') && s.jo.present && s.jo.action === 'idle';
    for (const k of ['jo', 'tam']) {
      const w = ink[k]; if (!talking) { w.length = 0; continue; }
      const f = figs[k]; f.bones.Head.matrixWorld.decompose(a, q4, b); hd.set(0, 0, 1).applyQuaternion(q4);
      ch.setFromMatrixPosition(f.bones.spine_03.matrixWorld); hl.setFromMatrixPosition(f.bones.hand_l.matrixWorld); hr.setFromMatrixPosition(f.bones.hand_r.matrixWorld);
      w.push({ t: s.time, h: hd.clone(), c: ch.clone(), l: hl.clone(), r: hr.clone() }); while (w.length && s.time - w[0].t > 4.05) w.shift();
      if (w.length > 6 && s.time - w[0].t > 3.9) {
        let ang = 0, mv = 0; for (const x of w) { ang = Math.max(ang, Math.acos(Math.min(1, x.h.dot(w[0].h)))); mv = Math.max(mv, x.c.distanceTo(w[0].c), x.l.distanceTo(w[0].l), x.r.distanceTo(w[0].r)); }
        if (ang < 0.052 && mv < 0.015) { add(k, 'frozen', ch, { gap: +(ang * 57.3).toFixed(1) }); w.length = 0; }
      }
    }
    // ---- book
    if (D.book && D.book.visible && s.jo.action === 'sit') {
      const bc = new V3(0, 0, 0).applyMatrix4(D.book.matrixWorld);
      if (!D.book.userData.real) add('book', 'book', bc, { holder: 'not the real model' });
      if (s.beatTime > 0 && s.jo.book) { const L = new V3().setFromMatrixPosition(figs.jo.bones.hand_l.matrixWorld).distanceTo(bc), R = new V3().setFromMatrixPosition(figs.jo.bones.hand_r.matrixWorld).distanceTo(bc);
        mem.bookT = (mem.bookT || 0) + 0.1; if (mem.bookT > 2.5 && (R > 0.22 || (L > 0.22 && !(s.jo.leaf > 0.02)))) add('book', 'book', bc, { holder: 'hands off it', gap: +Math.max(L, R).toFixed(2) }); }
    } else mem.bookT = 0;
    // ---- readsit: from the moment she starts to sit (round ten): her face, shoulders, elbows and hands are not hidden by
    // a pot, a plant or the feed-line hoop (more than one of the six arm points hidden, or the face, is a fault); no
    // elbow or hand is inside a pot; and the open book is only out once she is down on the seat.
    if (s.camera.shot !== mem.sitShot) { mem.sitShot = s.camera.shot; mem.sitShotAt = s.time; }
    if (present('jo') && s.jo.action === 'sit' && s.jo.seat === 'chair' && s.fade > 0.5 && (s.camera.shot !== 'readClose' || s.time - mem.sitShotAt > 1.3)) {   // (not while the camera is still on its way in)
      const f = figs.jo, hq = new T.Quaternion(), self = (f.meshes || []).concat(D.book ? meshesOf(D.book) : [], D.held[7] ? meshesOf(D.held[7]) : [], D.held[1] ? meshesOf(D.held[1]) : []);
      f.bones.Head.matrixWorld.decompose(a, hq, b); const face = new V3().setFromMatrixPosition(f.bones.Head.matrixWorld).add(new V3(0, 0.06, 0.1).applyQuaternion(hq));
      let hid = 0, by = null; const arm = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'].map((n) => new V3().setFromMatrixPosition(f.bones[n].matrixWorld));
      for (const pt of arm) if (!inSight(pt, self, occ)) { hid++; by = inSight.last; }
      const faceOk = inSight(face, self, occ), faceBy = inSight.last;
      if (!faceOk || hid > 1) add('jo', 'readsit', face, { prop: faceOk ? by : faceBy, gap: (faceOk ? 'face seen, ' : 'face hidden, ') + hid + '/6 arm' });
      if (D.potMeshes) { const B3 = new T.Box3(); for (const m of D.potMeshes) { if (!m || !shown(m)) continue; B3.setFromObject(m).expandByScalar(0.01);
        const inPot = arm.slice(2).find((pt) => B3.containsPoint(pt)); if (inPot) { add('jo', 'readpot', inPot, {}); break; } } }
      const pv = new V3().setFromMatrixPosition(f.bones.pelvis.matrixWorld);
      // (round seventeen: the book is one volume she carries shut in her hand and opens once she is down; only an open one
      // counts here: its cover, the half that swings, turned less than 60 degrees from flat)
      const cover = D.book && D.book.children.find((c) => /R(_|$)/.test(c.userData.part || '')), opened = !cover || Math.abs(cover.rotation.z) < 1.05;
      if (D.book && D.book.visible && opened && ((s.jo.sitK ?? 1) < 0.999 || pv.y > 0.58)) add('book', 'readearly', pv, { gap: +pv.y.toFixed(2) });
    }
    // ---- reading: once the camera has come in on her, nothing stands in front of her face or the open book
    if (D.book && D.book.visible && s.jo.action === 'sit' && s.jo.book && s.camera.shot === 'readClose') {
      if (mem.rshot !== s.camera.shot) { mem.rshot = s.camera.shot; mem.rAt = s.time; }
      if (s.time - mem.rAt > 2.5) {
        const self = meshesOf(D.book).concat(figs.jo.meshes || []), f = figs.jo, hq = new T.Quaternion();
        f.bones.Head.matrixWorld.decompose(a, hq, b); const face = new V3().setFromMatrixPosition(f.bones.Head.matrixWorld).add(new V3(0, 0.06, 0.1).applyQuaternion(hq));
        const faceSeen = inSight(face, self, occ), faceBy = inSight.last;
        let bk = 0, bkBy = null; for (const v of [[0, 0, 0], [-0.12, 0.01, -0.08], [0.12, 0.01, -0.08], [-0.12, 0.01, 0.08], [0.12, 0.01, 0.08]]) { if (inSight(p.set(v[0], v[1], v[2]).applyMatrix4(D.book.matrixWorld), self, occ)) bk++; else bkBy = inSight.last; }
        if (!faceSeen) add('jo', 'readface', face, { prop: faceBy });
        if (bk < 4) add('book', 'readbook', new V3().setFromMatrixPosition(D.book.matrixWorld), { prop: bkBy, gap: bk + '/5' });
      }
    } else mem.rshot = null;
    // ---- readlegs: reading, once the camera has settled on her, both her lower legs are seen whole: the shin from knee to
    // ankle and the shoe, each leg's four points mostly in sight (three of four), not hidden by the open lid, a pot, the
    // shelf or her other leg (round eleven: the lid hid her left shin, and the one leg left read as a stump). And when the
    // card comes up over this picture at the end, neither shin is under its words (checked by the gate on the last frame).
    if (s.ending === 'sensor' && present('jo') && s.jo.action === 'sit' && s.jo.book && s.camera.shot === 'readClose' && s.fade > 0.9) {
      if (mem.lshot !== 'readClose') { mem.lshot = 'readClose'; mem.lAt = s.time; }
      if (s.time - mem.lAt > 2.5 || s.beat === 'end') {
        const f = figs.jo, legM = f.meshes.filter((m) => /legs|feet/.test(m.userData.role)), all = occ.concat(f.meshes, D.book ? meshesOf(D.book) : []);
        const rects = s.beat === 'end' ? [...document.querySelectorAll('#sh-ui .card.end.on .ledger, #sh-ui .card.end.on .lettering, #sh-ui .card.end.on button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0) : [];
        // (round thirteen: each point must be met by ITS OWN leg, not the other one passing in front of it, and the shoe
        // must be seen too: the lid hid her left foot on a phone and the shin above it read as a stump, at three of four)
        const segs = {}; for (const sd of ['l', 'r']) segs[sd] = [new V3().setFromMatrixPosition(f.bones['calf_' + sd].matrixWorld), new V3().setFromMatrixPosition(f.bones['foot_' + sd].matrixWorld), new V3().setFromMatrixPosition(f.bones['ball_' + sd].matrixWorld)];
        const segD = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); };
        const legD = (p, sd) => Math.min(segD(p, segs[sd][0], segs[sd][1]), segD(p, segs[sd][1], segs[sd][2]));
        for (const sd of ['l', 'r']) {
          const k0 = new V3().setFromMatrixPosition(f.bones['calf_' + sd].matrixWorld), a0 = new V3().setFromMatrixPosition(f.bones['foot_' + sd].matrixWorld), b0 = new V3().setFromMatrixPosition(f.bones['ball_' + sd].matrixWorld), other = sd === 'l' ? 'r' : 'l';
          let ok = 0, by = null, under = 0;
          for (const [i, pt] of [k0.clone().lerp(a0, 0.3), k0.clone().lerp(a0, 0.6), k0.clone().lerp(a0, 0.9), a0.clone().lerp(b0, 0.5).add(new V3(0, 0.035, 0))].entries()) {
            const pr = G.project(pt); if (pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight) { by = 'off the picture'; continue; }
            if (rects.some((r) => pr.x > r.left && pr.x < r.right && pr.y > r.top && pr.y < r.bottom)) under++;
            dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L + 0.2;
            const h = ray.intersectObjects(all, false).find((x) => shown(x.object));
            if (h && legM.includes(h.object) && Math.abs(h.distance - L) < 0.16 && legD(h.point, sd) < legD(h.point, other)) ok++; else by = ['shin top', 'shin', 'ankle', 'shoe'][i] + ' ' + (h ? (h.object.name || h.object.parent && h.object.parent.name || 'mesh') + (h.object.userData.role ? ':' + h.object.userData.role : '') + (legM.includes(h.object) ? (legD(h.point, sd) < legD(h.point, other) ? ' (own leg, ' + Math.abs(h.distance - L).toFixed(2) + ' m in front)' : ' (her other leg)') : '') : 'nothing'); }
          if (ok < 4) add('jo', 'readlegs', k0, { prop: by, gap: sd + ' ' + ok + '/4' });
          if (under > 1) add('jo', 'readlegs', k0, { prop: 'the end card', gap: sd + ' ' + under + '/4 under the words' });
        }
      }
    } else mem.lshot = null;
    // ---- source: in a watering night, while her cup is empty (or she is on her way for water), the water she needs
    // (the barrel, or the tap by the beds once the barrel is dry) is on screen. Off it for more than 2 s is a player
    // hunting with the edge arrow (round nine, on a phone)
    {
      const j = s.jo, water = ['n1_water', 'n2_water', 'n2_more', 'n3_water'].includes(s.beat);
      const src = j.target === 'barrel' || j.target === 'valve' ? j.target : j.cup <= 0 ? (s.valve.found && s.barrel.scoops <= 0 ? 'valve' : 'barrel') : null;
      const need = water && j.present && src && s.pots.some((q) => q.present && !q.watered) && s.fade > 0.9 && !(j.action === 'pour' || j.action === 'pourEmpty' || j.action === 'scoop');
      const sdt = Math.min(0.5, s.time - (mem.srcT ?? s.time)); mem.srcT = s.time;
      if (need) { const at = src === 'valve' ? new V3(0.6, 0.4, -1.35) : new V3(4.7, 0.9, 2.5), pr = G.project(at), onS = !pr.behind && pr.x > 8 && pr.y > 8 && pr.x < innerWidth - 8 && pr.y < innerHeight - 8;
        mem.srcOff = onS ? 0 : (mem.srcOff || 0) + sdt; if (mem.srcOff > 2.0) { add('jo', 'source', at, { prop: src, gap: +mem.srcOff.toFixed(1) }); mem.srcOff = 0; } }
      else mem.srcOff = 0;
    }
    // ---- tapclear (round fifteen): while the camera is on the brass tap and she is not going to it (the swing when the
    // barrel runs dry, and the hold on the tap), nothing of her, her hat or the cup is drawn over the tap: three points on it (the
    // spout, the body, the handle), any one hidden by her for 0.2 s is a fault; and from 1.2 s into the shot the tap is in
    // the picture. The 8.1 review: on a wide screen the camera settled at her back and the chalk ring sat on her shoulder.
    {
      const tapShot = /^valve/.test(s.camera.shot), tp = new V3(0.6, 0.4, -1.35), far = present('jo') && s.jo.target !== 'valve' && Math.hypot(s.jo.pos.x - tp.x, s.jo.pos.z - tp.z) > 1.2;
      if (tapShot && mem.tcShot !== true) { mem.tcShot = true; mem.tcAt = s.time; } if (!tapShot) mem.tcShot = false;
      const tdt = Math.min(0.5, s.time - (mem.tcT ?? s.time)); mem.tcT = s.time;
      if (tapShot && far && s.fade > 0.9) {
        const herM = figs.jo.meshes.concat(D.held[1] ? meshesOf(D.held[1]) : [], D.jo.cup ? meshesOf(D.jo.cup) : []).filter(shown);
        let hid = 0, off = 0;
        for (const pt of [new V3(0.6, 0.47, -1.24), new V3(0.6, 0.36, -1.33), new V3(0.6, 0.55, -1.33)]) {
          const pr = G.project(pt); if (pr.behind || pr.x < 0 || pr.y < 0 || pr.x > innerWidth || pr.y > innerHeight) { off++; continue; }
          dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L - 0.02;
          if (ray.intersectObjects(herM, false).length) hid++; }
        mem.tc = hid ? (mem.tc || 0) + tdt : 0;
        if (mem.tc >= 0.2) { add('jo', 'tapclear', tp, { gap: hid + '/3 behind her', prop: s.camera.shot }); mem.tc = 0; }
        if (off === 3 && s.time - mem.tcAt > 1.2) add('jo', 'tapclear', tp, { gap: 'off the picture', prop: s.camera.shot });
      } else mem.tc = 0;
    }
    // ---- gaze: reading, she never looks into the lens. Her line of sight (the head's forward, tipped 8 degrees down
    // for the eyes) stays at least 25 degrees away from the line to the camera, in every frame, the glance up included
    if (s.ending === 'sensor' && s.jo.present && s.jo.action === 'sit' && s.jo.book) {
      const M = figs.jo.boneMatrix('head', new T.Matrix4()), hp = new V3().setFromMatrixPosition(M), e = M.elements;
      const fwd = new V3(e[8], e[9], e[10]).normalize(), upv = new V3(e[4], e[5], e[6]).normalize(), look = fwd.clone().addScaledVector(upv, -0.14).normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, look.dot(dir.copy(cp).sub(hp).normalize())))) * 57.3;
      if (ang < 25) add('jo', 'gaze', hp, { gap: +ang.toFixed(1) });
    }
    // ---- readeyes (round fourteen): reading, her eyes are on the page. Measured on the skinned eye mesh: from each
    // eyeball's middle to its pupil (the front 8 percent of the ball at rest) is a line of sight; it meets the middle of the
    // open spread within 12 degrees, and inside the head it turns no more than 16 degrees to either side (her head faces
    // the book; the eyes only drop to it). Every frame she reads with the camera settled on her, and under the end card.
    // The 7.6 review: her eyes turned sideways, off the page, and she looked wary instead of absorbed.
    // (round seventeen: from the moment the book is open, src/core/reading.js READ.book.open; before it she is still
    // lifting it and turning the cover, and the middle of the half-open book is not where a reader looks)
    if (s.ending === 'sensor' && present('jo') && s.jo.action === 'sit' && s.jo.book && (s.jo.readT == null || s.jo.readT >= 6.2) && !(s.jo.lookUp > 0.01) && !(s.jo.leaf > 0.02) && D.book && D.book.visible && s.camera.shot === 'readClose' && s.time - (mem.lAt ?? s.time) > 1.3) {
      const em = figs.jo.meshes.find((m) => m.userData.role === 'eyes');
      if (em) { const P = em.geometry.attributes.position, n = P.count, vv = new V3();
        if (!mem.eyeIds) { let mx = 0; for (let i = 0; i < n; i++) mx += P.getX(i) / n; mem.eyeIds = [0, 1].map((sd) => { const ids = []; for (let i = 0; i < n; i++) if ((P.getX(i) > mx ? 0 : 1) === sd) ids.push(i); let z1 = -9, z0 = 9; for (const i of ids) { z1 = Math.max(z1, P.getZ(i)); z0 = Math.min(z0, P.getZ(i)); } return { ids, front: ids.filter((i) => P.getZ(i) > z1 - (z1 - z0) * 0.08) }; }); }
        const pg = new T.Box3().setFromObject(D.book).getCenter(new V3());   // (the middle of the open book: the spread)
        const Mh = figs.jo.boneMatrix('head', new T.Matrix4()), qh = new T.Quaternion().setFromRotationMatrix(Mh).invert();
        const why = [];
        for (const e of mem.eyeIds) { const c = new V3(), pu = new V3(); for (const i of e.ids) { em.getVertexPosition(i, vv); c.add(vv.applyMatrix4(em.matrixWorld)); } c.multiplyScalar(1 / e.ids.length);
          for (const i of e.front) { em.getVertexPosition(i, vv); pu.add(vv.applyMatrix4(em.matrixWorld)); } pu.multiplyScalar(1 / e.front.length);
          const d = pu.sub(c).normalize(), off = Math.acos(Math.max(-1, Math.min(1, d.dot(pg.clone().sub(c).normalize())))) * 57.3, dh = d.clone().applyQuaternion(qh), side = Math.abs(Math.atan2(dh.x, dh.z)) * 57.3;
          if (off > 12) why.push('off the page ' + off.toFixed(0)); if (side > 16) why.push('sideways in the head ' + side.toFixed(0)); }
        const edt = Math.min(0.5, s.time - (mem.reT ?? s.time)); mem.reT = s.time; mem.re = why.length ? (mem.re || 0) + edt : 0;
        if (mem.re >= 0.3) { add('jo', 'readeyes', pg, { holder: why.join('; ') }); mem.re = 0; }
      }
    } else { mem.re = 0; mem.reT = null; }
    // ---- readquiet (round fourteen): once the camera has settled on her reading, nothing painted without a line (the
    // fine pipework: the feed line's hoops, the mist line) is drawn in the picture 0.8 m or more nearer the camera than she is. Seen
    // close, an unlined tube is a pale see-through smear (the 7.6 review: a grey band curved down the phone's picture in
    // front of the near pot). Up to two sample points may show; three or more for 0.3 s is a fault.
    if (s.ending === 'sensor' && present('jo') && s.jo.action === 'sit' && s.jo.book && s.camera.shot === 'readClose' && s.time - (mem.lAt ?? s.time) > 1.3) {
      if (!mem.quiet) { mem.quiet = []; for (const P of propMeshes) { const m = P.mesh; if (!(m.material && m.material.userData && m.material.userData.noInk) || m.material.transparent) continue; const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) mem.quiet.push([m, i]); } }
      const hd = new V3().setFromMatrixPosition(figs.jo.bones.Head.matrixWorld), dj = hd.distanceTo(cp), vv = new V3(); let seenQ = 0, at = null, nm = '';
      for (const [m, i] of mem.quiet) { if (!shown(m)) continue; vv.fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(m.matrixWorld); if (vv.distanceTo(cp) > dj - 0.8) continue;   // (a metre or so in front of her, near the lens: there an unlined tube is a pale smear; level with her it is a dark line)
        if (inSight(vv, [m], occ)) { seenQ++; at = vv.clone(); nm = m.name || (m.parent && m.parent.name) || 'quiet'; } }
      const qdt = Math.min(0.5, s.time - (mem.qT ?? s.time)); mem.qT = s.time; mem.q = seenQ >= 3 ? (mem.q || 0) + qdt : 0;
      if (mem.q >= 0.3 && at) { add('jo', 'readquiet', at, { prop: nm, gap: seenQ }); mem.q = 0; }
    } else { mem.q = 0; mem.qT = null; }
    // ---- bucket
    if (D.bucket && D.bucket.visible && s.ending === 'hand' && s.beat === 'epilogue' && !(s.tam.stage === 'climbing' || s.tam.stage === 'out')) {
      const e = D.bucket.matrixWorld.elements, o = new V3(e[12], e[13], e[14]); let ok = 0, n = 0;
      if (s.tam.stage === 'top' && s.tam.stageT > 1.6) { for (let i = 0; i < 8; i++) for (const y of [0.12, 0.32]) { n++; if (inSight(p.set(o.x + Math.cos(i * 0.785) * 0.13, y, o.z + Math.sin(i * 0.785) * 0.13), meshesOf(D.bucket), occ)) ok++; }
        // (in the wide shots it is always in sight; in a close-up on her pour it may be out of the picture or behind the
        // shelf, but if its body is seen, so is where it stands)
        if (mem.shot !== s.camera.shot) { mem.shot = s.camera.shot; mem.shotAt = s.time; }   // (a camera still on its way past the plants may lose it a moment)
        const wide = (s.camera.shot === 'bucket' || s.camera.shot === 'handClose' || s.camera.shot === 'meetHigh') && s.time - mem.shotAt > 2.2;
        if (wide && ok / n < 0.34) add('bucket', 'bucket', o, { gap: +(ok / n).toFixed(2) });
        if (ok / n >= 0.34 && s.time - mem.shotAt > 2.2) {
        // and where it stands: the ring where it meets the boards is in sight (3 of 8), and the boards are right under it
        let foot = 0; for (let i = 0; i < 8; i++) if (inSight(p.set(o.x + Math.cos(i * 0.785) * 0.17, o.y + 0.025, o.z + Math.sin(i * 0.785) * 0.17), meshesOf(D.bucket), occ)) foot++;
        if (foot < 3) add('bucket', 'footing', o, { gap: foot + '/8', prop: inSight.last });
        }
        ray.set(p.set(o.x, o.y + 0.3, o.z), dir.set(0, -1, 0)); ray.near = 0; ray.far = 2; const under = ray.intersectObjects(fixedOcc, false)[0];
        if (!under || Math.abs(under.point.y - o.y) > 0.02) add('bucket', 'float', o, { gap: under ? +(o.y - under.point.y).toFixed(3) : 'no deck' }); }
    }
    return out;
  }
  window.__gate = { body, clash, pose, scene, triTri, armTris, partTris, meshTris, crossAny, prepFig };
})();
