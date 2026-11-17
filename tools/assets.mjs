// Packs the real models in assets/ (rigged people, their clips, props) into one generated module, src/assets/pack.gen.js,
// that the game reads with no loader, no wasm and no fetch: plain typed arrays in one base64 string, and small WebP
// textures as data URIs. Run by tools/build.mjs whenever assets/ or this file is newer than the pack.
//   node tools/assets.mjs
// Sources and licences: CREDITS.md. Nothing is modelled here; meshes, weights and clips are copied as they are.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// ---- small matrix kit (column-major, like glTF) -----------------------------------------------------------------
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const xform = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const xdir = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
function quatOf(m) {   // rotation of a matrix with uniform scale
  const s = Math.hypot(m[0], m[1], m[2]) || 1, a = m[0] / s, b = m[4] / s, c = m[8] / s, d = m[1] / s, e = m[5] / s, f = m[9] / s, g = m[2] / s, h = m[6] / s, i = m[10] / s, t = a + e + i;
  let q;
  if (t > 0) { const k = Math.sqrt(t + 1) * 2; q = [(h - f) / k, (c - g) / k, (d - b) / k, k / 4]; }
  else if (a > e && a > i) { const k = Math.sqrt(1 + a - e - i) * 2; q = [k / 4, (b + d) / k, (c + g) / k, (h - f) / k]; }
  else if (e > i) { const k = Math.sqrt(1 + e - a - i) * 2; q = [(b + d) / k, k / 4, (f + h) / k, (c - g) / k]; }
  else { const k = Math.sqrt(1 + i - a - e) * 2; q = [(c + g) / k, (f + h) / k, k / 4, (d - b) / k]; }
  return norm(q);
}
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };

// ---- the binary blob ------------------------------------------------------------------------------------------
const chunks = []; let offset = 0;
function put(typed) { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
  const at = offset; chunks.push(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength)); offset += typed.byteLength; return [at, typed.length]; }
const textures = {};
async function tex(key, t, size) {
  if (textures[key]) return key;
  const buf = await sharp(Buffer.from(t.getImage())).resize(size, size).webp({ quality: 84 }).toBuffer();   // re-encoded: carries no metadata
  textures[key] = 'data:image/webp;base64,' + buf.toString('base64'); return key;
}

// ---- a rigged person ------------------------------------------------------------------------------------------
const FINGER_LEAF = /_04_leaf_|ball_leaf_/;
async function person(file, { texSize = 512, clips = null, split = null } = {}) {
  const doc = await io.read(join(root, 'assets', file)), R = doc.getRoot(), skin = R.listSkins()[0];
  const joints = skin.listJoints().filter((j) => !FINGER_LEAF.test(j.getName())), all = skin.listJoints();
  const world = new Map(all.map((j) => [j, j.getWorldMatrix()]));
  const idx = new Map(joints.map((j, i) => [j, i]));
  // rest pose in metres, no scale: positions and rotations taken from the world matrices
  const wq = joints.map((j) => quatOf(world.get(j))), wp = joints.map((j) => { const m = world.get(j); return [m[12], m[13], m[14]]; });
  const parentOf = (j) => { let p = j.getParentNode(); while (p && !idx.has(p)) p = p.getParentNode(); return p ? idx.get(p) : -1; };
  const bones = joints.map((j, i) => { const p = parentOf(j);
    if (p < 0) return { name: j.getName(), parent: -1, t: wp[i], q: wq[i] };
    const iq = qinv(wq[p]); return { name: j.getName(), parent: p, t: qrot(iq, [wp[i][0] - wp[p][0], wp[i][1] - wp[p][1], wp[i][2] - wp[p][2]]).map((x) => +x.toFixed(5)), q: qmul(iq, wq[i]).map((x) => +x.toFixed(6)) }; });
  // leaf joints dropped from the skeleton hand their weights to their parents
  const meshes = [];
  for (const node of R.listNodes()) {
    const mesh = node.getMesh(); if (!mesh || !node.getSkin()) continue;
    // each mesh carries its own skin (quantisation is folded into its inverse bind matrices), so read it per mesh
    const sk = node.getSkin(), all = sk.listJoints(), ibm = sk.getInverseBindMatrices(), skinM = all.map((j, i) => mul(j.getWorldMatrix(), ibm.getElement(i, new Array(16))));
    const remap = all.map((j) => { let k = j; while (!idx.has(k)) k = k.getParentNode(); return idx.get(k); });
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), I = prim.getIndices();
      const n = P.getCount(), pos = new Float32Array(n * 3), nor = new Int8Array(n * 4), uv = new Float32Array(n * 2), ji = new Uint8Array(n * 4), jw = new Uint8Array(n * 4);
      const v = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0], u2 = [0, 0];
      for (let i = 0; i < n; i++) {
        P.getElement(i, v); J.getElement(i, j4); W.getElement(i, w4); const nn = N.getElement(i, [0, 0, 0]);
        let sum = w4[0] + w4[1] + w4[2] + w4[3] || 1; const p = [0, 0, 0], q = [0, 0, 0];
        for (let k = 0; k < 4; k++) { const w = w4[k] / sum; if (!w) continue; const m = skinM[j4[k]], a = xform(m, v), b = xdir(m, nn); for (let c = 0; c < 3; c++) { p[c] += a[c] * w; q[c] += b[c] * w; } }
        pos.set(p, i * 3); const nq = norm(q); nor.set(nq.map((x) => Math.round(x * 127)), i * 4);
        if (U) { U.getElement(i, u2); uv.set(u2, i * 2); }
        // merge weights that now land on the same bone, keep the four largest, quantise to bytes that sum to 255
        const acc = new Map(); for (let k = 0; k < 4; k++) if (w4[k] > 0) { const b = remap[j4[k]]; acc.set(b, (acc.get(b) || 0) + w4[k] / sum); }
        const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); let left = 255;
        top.forEach(([b, w], k) => { const q8 = k === top.length - 1 ? left : Math.min(left, Math.round(w * 255)); left -= q8; ji[i * 4 + k] = b; jw[i * 4 + k] = q8; });
      }
      const ia = I.getArray(), mat = prim.getMaterial(), t = mat.getBaseColorTexture();
      const key = t ? await tex((t.getName() || mat.getName()).replace(/^T_|_BaseColor|\.png$/g, '').toLowerCase(), t, /eye(?!brow|lash)/i.test(t.getName()) ? 256 : texSize) : null;
      const at = { pos: put(pos), nor: put(nor), uv: put(uv), ji: put(ji), jw: put(jw) }, base = { material: mat.getName(), tex: key, tint: mat.getBaseColorFactor().slice(0, 3).map((x) => +x.toFixed(3)), count: n, wide: n > 65535, alpha: mat.getAlphaMode() === 'MASK' ? +mat.getAlphaCutoff().toFixed(2) : 0, ...at };
      // a one-piece outfit (shirt and trousers in one mesh) is cut in two by its triangles' bones, so each half can be painted its own colour
      let parts = split && split(node.getName()) ? splitByBones(ia, ji, jw, bones, pos, wp[joints.findIndex((j) => j.getName() === 'pelvis')][1] + split(node.getName())) : [['', Array.from(ia)]];
      // the shoes' tall collars ride up inside the trouser leg; where a shoe hangs from the shin it is under cloth anyway
      if (split && /^shoes/.test(node.getName())) parts = [['', dropOnBone(ia, ji, jw, bones, /^calf_/, 0.5)]];
      for (const [suffix, tri] of parts) { const index = n > 65535 ? new Uint32Array(tri) : new Uint16Array(tri); meshes.push({ name: node.getName() + suffix, ...base, index: put(index) }); }
    }
  }
  const out = { bones, meshes, joints: joints.map((j) => j.getName()) };
  if (clips) out.clips = clipsFrom(R, clips, out);
  return out;
}
// trousers: a triangle whose three corners hang mostly from the hips down (thigh, calf, foot; or the pelvis below the
// waist). Everything else is the top. Returns [['_top', indices], ['_legs', indices]].
const LEG = /^(thigh|calf|foot|ball)_/;
function splitByBones(ia, ji, jw, bones, pos, belt) {
  const legW = (v) => { let w = 0; for (let k = 0; k < 4; k++) { const b = bones[ji[v * 4 + k]]; if (b && LEG.test(b.name)) w += jw[v * 4 + k] / 255; } return w; };
  const top = [], legs = [];
  for (let i = 0; i < ia.length; i += 3) { const w = legW(ia[i]) + legW(ia[i + 1]) + legW(ia[i + 2]); const cy = (pos[ia[i] * 3 + 1] + pos[ia[i + 1] * 3 + 1] + pos[ia[i + 2] * 3 + 1]) / 3; (w > 1.2 || cy < belt ? legs : top).push(ia[i], ia[i + 1], ia[i + 2]); }
  return [['_top', top], ['_legs', legs]];
}
function dropOnBone(ia, ji, jw, bones, re, min) {
  const on = (v) => { let w = 0; for (let k = 0; k < 4; k++) { const b = bones[ji[v * 4 + k]]; if (b && re.test(b.name)) w += jw[v * 4 + k] / 255; } return w; };
  const keep = []; for (let i = 0; i < ia.length; i += 3) if (!(on(ia[i]) > min && on(ia[i + 1]) > min && on(ia[i + 2]) > min)) keep.push(ia[i], ia[i + 1], ia[i + 2]);
  console.log('    ' + (ia.length - keep.length) / 3 + ' of ' + ia.length / 3 + ' shoe triangles hang from the shin, dropped');
  return keep;
}
// clips: every bone's rotation at 30 frames a second as int16 quaternions; the pelvis position as floats (metres).
// Read from any file on the same rig (the person's own, or the library's clip file), matched by bone name.
function clipsFrom(R, names, P) {
  const nodes = new Map(R.listNodes().map((n) => [n.getName(), n])), joints = P.joints.map((n) => nodes.get(n));
  if (joints.some((j) => !j)) throw new Error('clip file is not on this rig');
  const idx = new Map(joints.map((j, i) => [j, i])), bones = P.bones;
  const pelvis = P.joints.indexOf('pelvis'), pj = joints[pelvis], pScale = Math.hypot(...pj.getParentNode().getWorldMatrix().slice(0, 3));
  const outc = {};
  for (const a of R.listAnimations()) {
    if (!names.includes(a.getName())) continue;
    let dur = 0; const rot = new Map(); let ptrack = null;
    for (const ch of a.listChannels()) { const s = ch.getSampler(), tn = ch.getTargetNode(), T = s.getInput().getArray(); dur = Math.max(dur, T[T.length - 1]);
      if (ch.getTargetPath() === 'rotation' && idx.has(tn)) rot.set(idx.get(tn), { T, V: s.getOutput().getArray() });
      if (ch.getTargetPath() === 'translation' && tn === pj) ptrack = { T, V: s.getOutput().getArray() }; }
    const frames = Math.max(2, Math.round(dur * 30) + 1), q = new Int16Array(frames * joints.length * 4), pp = new Float32Array(frames * 3);
    const at = (tr, t, es) => { const { T, V } = tr; let k = 0; while (k < T.length - 2 && T[k + 1] <= t) k++; const t0 = T[k], t1 = T[Math.min(k + 1, T.length - 1)], f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0, k1 = Math.min(k + 1, T.length - 1);
      const o = []; let dot = 0; if (es === 4) for (let c = 0; c < 4; c++) dot += V[k * 4 + c] * V[k1 * 4 + c];
      for (let c = 0; c < es; c++) o.push(V[k * es + c] * (1 - f) + V[k1 * es + c] * f * (es === 4 && dot < 0 ? -1 : 1)); return o; };
    for (let f = 0; f < frames; f++) { const t = dur * f / (frames - 1);
      // (a top bone's track is relative to the armature node, so that node's turn is put back in)
      for (let b = 0; b < joints.length; b++) { const tr = rot.get(b); let v = tr ? norm(at(tr, t, 4)) : bones[b].q;
        if (tr && bones[b].parent < 0) { const par = joints[b].getParentNode(); if (par && par.getWorldMatrix) v = qmul(quatOf(par.getWorldMatrix()), v); } for (let c = 0; c < 4; c++) q[(f * joints.length + b) * 4 + c] = Math.round(v[c] * 32767); }
      const p = ptrack ? at(ptrack, t, 3).map((x) => x * pScale) : bones[pelvis].t; pp.set(p, f * 3); }
    outc[a.getName()] = { dur: +dur.toFixed(4), frames, q: put(q), pelvis: put(pp) };
  }
  return outc;
}

// ---- a prop (static mesh): world-space triangles, one texture -------------------------------------------------
async function prop(file, { texSize = 256, scale = 1 } = {}) {
  const doc = await io.read(join(root, 'assets', file)), R = doc.getRoot(), parts = [];
  for (const node of R.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
      const n = P.getCount(), pos = new Float32Array(n * 3), nor = new Int8Array(n * 4), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { pos.set(xform(M, P.getElement(i, [0, 0, 0])).map((x) => x * scale), i * 3); nor.set(norm(xdir(M, N.getElement(i, [0, 0, 0]))).map((x) => Math.round(x * 127)), i * 4); if (U) uv.set(U.getElement(i, [0, 0]), i * 2); }
      const ia = I ? I.getArray() : Uint32Array.from({ length: n }, (_, i) => i), index = n > 65535 ? new Uint32Array(ia) : new Uint16Array(ia);
      const mat = prim.getMaterial(), t = mat && mat.getBaseColorTexture();
      const key = t ? await tex(file.replace(/\.glb$/, '') + '_' + parts.length, t, texSize) : null;
      parts.push({ name: node.getName(), tex: key, tint: mat ? mat.getBaseColorFactor().slice(0, 3).map((x) => +x.toFixed(3)) : [1, 1, 1], count: n, wide: n > 65535, pos: put(pos), nor: put(nor), uv: put(uv), index: put(index) });
    }
  }
  return { parts };
}

// ---- the book: one volume of a real encyclopedia set (CREDITS.md), cut out of the set. Two forms:
// bookShut   the volume whole, centred: x across the cover (spine to fore-edge), y through it, z along the spine
// bookOpen   the same volume cut through the middle of its page block and laid open from the spine, each half tipped up
//            a little: x across the spread (spine at 0), y up out of the pages, z along the spine. The cut faces become
//            the two open pages (a plain sheet each, part 'page'); everything else, the boards and the page edges, is the model.
async function book(file, pick = 0) {
  const doc = await io.read(join(root, 'assets', file)), R = doc.getRoot(), node = R.listNodes().find((n) => n.getMesh()), M = node.getWorldMatrix();
  const prims = node.getMesh().listPrimitives(), v = [0, 0, 0];
  // the volumes stand side by side along x: find them as runs of x in the cover's vertices
  // (each volume's boards are one connected piece of the cover mesh, welded by position)
  const cover = prims.find((p) => /cover/.test(p.getMaterial().getName())), CP = cover.getAttribute('POSITION'), CI = cover.getIndices().getArray(), cn = CP.getCount();
  const par = Int32Array.from({ length: cn }, (_, i) => i), f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let i = 0; i < CI.length; i += 3) { const a = f(CI[i]); par[f(CI[i + 1])] = a; par[f(CI[i + 2])] = a; }
  const weld = new Map(); for (let i = 0; i < cn; i++) { const k = CP.getElement(i, v).map((x) => Math.round(x * 2000)).join(); if (weld.has(k)) par[f(i)] = f(weld.get(k)); else weld.set(k, i); }
  const comps = new Map(); for (let i = 0; i < cn; i++) { const x = xform(M, CP.getElement(i, v))[0], r = f(i), c = comps.get(r) || [1e9, -1e9]; c[0] = Math.min(c[0], x); c[1] = Math.max(c[1], x); comps.set(r, c); }
  const [x0, x1] = [...comps.values()].sort((a, b) => a[0] - b[0])[pick], mid = (x0 + x1) / 2;
  let zmin = 1e9, zmax = -1e9, ymin = 1e9, ymax = -1e9;
  const take = [];
  for (const prim of prims) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices().getArray();
    const W = [], NN = [], UV = []; for (let i = 0; i < P.getCount(); i++) { W.push(xform(M, P.getElement(i, [0, 0, 0]))); NN.push(norm(xdir(M, N.getElement(i, [0, 0, 0])))); UV.push(U.getElement(i, [0, 0])); }
    const tris = []; for (let i = 0; i < I.length; i += 3) { const cx = (W[I[i]][0] + W[I[i + 1]][0] + W[I[i + 2]][0]) / 3; if (cx >= x0 - 0.001 && cx <= x1 + 0.001) tris.push([I[i], I[i + 1], I[i + 2]]); }
    for (const t of tris) for (const k of t) { const w = W[k]; zmin = Math.min(zmin, w[2]); zmax = Math.max(zmax, w[2]); ymin = Math.min(ymin, w[1]); ymax = Math.max(ymax, w[1]); }
    take.push({ prim, W, NN, UV, tris });
  }
  const yc = (ymin + ymax) / 2, zc = (zmin + zmax) / 2, depth = zmax - zmin;
  // the spine is the long edge where the page block sits furthest in from the boards
  const paper = take.find((t) => /paper/.test(t.prim.getMaterial().getName())); let pz0 = 1e9, pz1 = -1e9;
  for (const t of paper.tris) for (const k of t) { pz0 = Math.min(pz0, paper.W[k][2]); pz1 = Math.max(pz1, paper.W[k][2]); }
  const spineLow = pz0 - zmin > zmax - pz1, sp = spineLow ? zmin : zmax, sg = spineLow ? 1 : -1;   // sg: +1 if the fore-edge is toward +z
  const emit = async (parts, list, map, name) => {
    for (const t of list) {
      const n = t.tris.length * 3, pos = new Float32Array(n * 3), nor = new Int8Array(n * 4), uv = new Float32Array(n * 2), index = new Uint16Array(n);
      let o = 0; for (const tri of t.tris) for (const k of tri) { const [p, q] = map(t.W[k], t.NN[k]); pos.set(p, o * 3); nor.set(norm(q).map((x) => Math.round(x * 127)), o * 4); uv.set(t.UV[k], o * 2); index[o] = o; o++; }
      const mat = t.prim.getMaterial(), tx = mat.getBaseColorTexture(), key = tx ? await tex('book_' + (/cover/.test(mat.getName()) ? 'cover' : 'paper'), tx, 256) : null;
      parts.push({ name: name + '_' + (/cover/.test(mat.getName()) ? 'cover' : 'paper'), tex: key, tint: [1, 1, 1], count: n, wide: false, pos: put(pos), nor: put(nor), uv: put(uv), index: put(index) });
    }
  };
  // shut: x = across the cover from the spine, y = through it, z = along the spine (a turn, not a mirror)
  const shut = [];
  await emit(shut, take, (w, q) => [[sg * (w[2] - zc), w[0] - mid, -(w[1] - yc)], [sg * q[2], q[0], -q[1]]], 'shut');
  // open: each half laid out from the spine; its cut face up
  const open = [], TIP = 0.2;
  for (const side of [-1, 1]) {
    const half = take.map((t) => ({ ...t, tris: t.tris.filter((tri) => { const cx = (t.W[tri[0]][0] + t.W[tri[1]][0] + t.W[tri[2]][0]) / 3; return side < 0 ? cx < mid : cx >= mid; }) }));
    const c = Math.cos(side * TIP), s = Math.sin(side * TIP);
    const rot = ([x, y, z]) => [x * c - y * s, x * s + y * c, z];
    // side -1: x = -(distance from spine), y = (x - mid) <= 0; side +1: x = +distance, y = (mid - x) <= 0. Both are turns.
    await emit(open, half, (w, q) => { const a = sg * (w[2] - sp), yy = side < 0 ? Math.min(0, w[0] - mid) : Math.min(0, mid - w[0]);
      return [rot([side * a, yy, side < 0 ? (w[1] - yc) : -(w[1] - yc)]), rot([side * sg * q[2], side < 0 ? q[0] : -q[0], side < 0 ? q[1] : -q[1]])]; }, 'open' + (side < 0 ? 'L' : 'R'));
    // the open page: one sheet over the cut, a hair above it, spine to fore-edge
    const h = (ymax - ymin) / 2 - 0.006, w0 = 0.004, w1 = depth - 0.005, P = [[w0, 0.0012, -h], [w1, 0.0012, -h], [w1, 0.0012, h], [w0, 0.0012, h]].map(([x, y, z]) => rot([side * x, y, z]));
    const pos = new Float32Array(P.flat()), nor = new Int8Array(16), up = rot([0, 1, 0]).map((x) => Math.round(x * 127)); for (let i = 0; i < 4; i++) nor.set([...up, 0], i * 4);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), index = new Uint16Array(side < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    open.push({ name: 'page' + (side < 0 ? 'L' : 'R'), tex: null, tint: [1, 1, 1], count: 4, wide: false, pos: put(pos), nor: put(nor), uv: put(uv), index: put(index) });
  }
  return { open: { parts: open }, shut: { parts: shut }, size: [depth, x1 - x0, ymax - ymin] };
}

// every clip the game plays (all of them come with the model; see CREDITS.md)
const CLIPS = ['Idle_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Fixing_Kneeling', 'Walk_Carry_Loop', 'PickUp_Table', 'Interact', 'Crouch_Idle_Loop', 'Idle_Talking_Loop', 'Yes'];
const LIB_CLIPS = ['Walk_Formal_Loop'];
const pack = { people: {}, props: {}, clips: null, tex: textures };
// SH_BODIES=lib packs the stylised library bodies of rounds seven to ten instead of the realistic ones (for side by side)
// split(name): the belt's height over the hip joint for an outfit to be cut in two (her shirt is tucked in, so below the
// belt is trousers; his jacket hangs over his hips, so only the bones decide), or false
const LIB = process.env.SH_BODIES === 'lib', SUIT = (n) => /casualsuit/.test(n) && 0.13, COAT = (n) => /casualsuit/.test(n) && -9;
const jo = await person(LIB ? 'gardener-woman.glb' : 'jo-real.glb', { clips: CLIPS, split: LIB ? null : SUIT }); pack.clips = jo.clips; delete jo.clips; pack.people.jo = jo;
// and the upright everyday walk: on the realistic body it comes in its own file, hips scaled to her; otherwise from the
// library's clip file (same rig)
Object.assign(pack.clips, clipsFrom(LIB ? (await io.read(join(root, 'assets', 'ual-clips.glb'))).getRoot() : (await io.read(join(root, 'assets', 'jo-real.glb'))).getRoot(), LIB_CLIPS, jo));
delete jo.joints;
pack.people.tam = await person(LIB ? 'neighbour-man.glb' : 'tam-real.glb', { split: LIB ? null : COAT }); delete pack.people.tam.joints;
pack.bodies = LIB ? 'lib' : 'real';
for (const [key, file, o] of JSON.parse(process.env.SH_PROPS || 'null') || [['chair', 'chair.glb', {}], ['bucket', 'bucket.glb', {}]]) {
  try { pack.props[key] = await prop(file, o); } catch (e) { console.warn('prop skipped:', file, e.message); }
}
{ const bk = await book('book.glb', 0); pack.props.bookOpen = bk.open; pack.props.bookShut = bk.shut; console.log('  book: ' + bk.size.map((x) => x.toFixed(3)).join(' x ') + ' m'); }
const bin = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
mkdirSync(join(root, 'src/assets'), { recursive: true });
writeFileSync(join(root, 'src/assets/pack.gen.js'), '// GENERATED by tools/assets.mjs from assets/. Do not edit.\nexport const PACK = ' + JSON.stringify(pack) + ';\nexport const BIN = "' + bin.toString('base64') + '";\n');
const texBytes = Object.values(textures).reduce((a, s) => a + s.length, 0);
console.log(`src/assets/pack.gen.js  bin ${(bin.length / 1048576).toFixed(2)} MB, textures ${(texBytes / 1048576).toFixed(2)} MB (${Object.keys(textures).join(', ')})`);
for (const k in pack.people) console.log(`  ${k}: ${pack.people[k].bones.length} bones, ${pack.people[k].meshes.map((m) => m.name + '/' + m.tex + ':' + m.count).join(' ')}`);
console.log('  clips:', Object.entries(pack.clips).map(([n, c]) => `${n} ${c.dur}s`).join(', '));
