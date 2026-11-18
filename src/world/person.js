// OWNER: B (world). A real person: a rigged, skinned model from the asset library (see CREDITS.md), posed by real
// animation clips, with a thin layer on top for the things this game needs exactly: a hand on a cup, two hands on a
// tray, feet on real treads. Nothing here is modelled in code. Bones are only ever ROTATED (and the pelvis moved),
// so no limb can stretch: tools/limbs.mjs holds every bone length to 2 percent.
//   createPerson(key, { height, parts }) -> fig
//   fig.rest() -> pose channels;  fig.solve(p) poses the skeleton;  fig.time[clip] = seconds (set before solve)
import * as THREE from 'three';
import { PACK, BIN } from '../assets/pack.gen.js';
import { gouache } from '../render/materials.js';
import { PAL } from '../core/palette.js';

// ---- the pack ---------------------------------------------------------------------------------------------------
let buf = null;
function bin() { if (!buf) { const s = atob(BIN), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); buf = u.buffer; } return buf; }
export const arr = (Type, [at, len]) => new Type(bin(), at, len);
const texCache = new Map(); let pending = 0;
export function texture(key) {
  if (texCache.has(key)) return texCache.get(key);
  const img = new Image(), t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  pending++; img.onload = () => { t.needsUpdate = true; pending--; }; img.onerror = () => { pending--; };
  img.src = PACK.tex[key]; texCache.set(key, t); return t;
}
export const assetsPending = () => pending;
const col = (k) => new THREE.Color(PAL[k] || k);

// A gouache material over a real texture. mode 'ramp': the texture's value picks between two palette colours, so the
// cloth keeps its folds and seams but is painted in the game's own colours. mode 'tint': texture times a colour.
export function painted(texKey, o = {}) {
  const m = gouache('#ffffff', { unique: 1, side: o.side });
  if (texKey) m.map = texture(texKey);
  if (o.alphaTest) m.alphaTest = o.alphaTest;   // hair, brows and lashes: cards cut out by their texture (the ink channel is cut with them)
  if (o.tint) m.color.copy(o.tint.isColor ? o.tint : col(o.tint));
  if (o.ramp) {
    const U = { uDark: { value: o.ramp.dark.isColor ? o.ramp.dark : col(o.ramp.dark) }, uLight: { value: o.ramp.light.isColor ? o.ramp.light : col(o.ramp.light) }, uLo: { value: o.ramp.lo ?? 0.02 }, uHi: { value: o.ramp.hi ?? 0.5 } };
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    const hf = o.handFlat ? o.handFlat.toFixed(3) : null;   // (skin: how far the hands' own texture is evened out, by the vertex attribute aHand)
    // a belt (round sixteen): an outfit cut in two at the waist is painted by the height of each point on the body at rest,
    // not by which half its triangle fell in: shirt colour above, a thin ink band, trouser colour below. The cut followed
    // the triangles, so the two colours met in a ragged, fuzzy band. Both halves carry the same belt. tools/guide.mjs belt
    const bt = o.belt || null;
    if (bt) { const r = (x) => (x.isColor ? x : col(x)); Object.assign(U, { uBeltY: { value: bt.y }, uBeltW: { value: bt.w }, uBeltInk: { value: r(bt.ink) },
      uTD: { value: r(bt.top.dark) }, uTL: { value: r(bt.top.light) }, uTlo: { value: bt.top.lo }, uThi: { value: bt.top.hi },
      uLD: { value: r(bt.legs.dark) }, uLL: { value: r(bt.legs.light) }, uLlo: { value: bt.legs.lo }, uLhi: { value: bt.legs.hi } }); }
    m.onBeforeCompile = function (shader, r) {
      Object.assign(shader.uniforms, U);
      if (hf) shader.vertexShader = 'attribute float aHand; varying float vHand;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHand = aHand;');
      if (bt) { shader.vertexShader = 'varying float vRestY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRestY = position.y;');
        shader.fragmentShader = 'varying float vRestY; uniform float uBeltY; uniform float uBeltW; uniform vec3 uBeltInk; uniform vec3 uTD; uniform vec3 uTL; uniform float uTlo; uniform float uThi; uniform vec3 uLD; uniform vec3 uLL; uniform float uLlo; uniform float uLhi;\n' + shader.fragmentShader.replace('#include <map_fragment>',
          '#ifdef USE_MAP\n{ vec4 tx = texture2D( map, vMapUv ); float l = dot(tx.rgb, vec3(.3, .59, .11)); float d = vRestY - uBeltY, aa = max(fwidth(vRestY), 1e-5);' +
          ' vec3 cT = mix(uTD, uTL, smoothstep(uTlo, uThi, l)), cL = mix(uLD, uLL, smoothstep(uLlo, uLhi, l));' +
          ' vec3 c = mix(cL, uBeltInk, smoothstep(-uBeltW - aa, -uBeltW + aa, d)); c = mix(c, cT, smoothstep(uBeltW - aa, uBeltW + aa, d)); diffuseColor.rgb *= c; }\n#endif');
      }
      shader.fragmentShader = (hf ? 'varying float vHand;\n' : '') + 'uniform vec3 uDark; uniform vec3 uLight; uniform float uLo; uniform float uHi;\n' + shader.fragmentShader.replace('#include <map_fragment>',
        '#ifdef USE_MAP\n{ vec4 tx = texture2D( map, vMapUv ); float l = dot(tx.rgb, vec3(.3, .59, .11));' + (hf ? ` l = mix(l, max(l, mix(uLo, uHi, .62)), vHand * ${hf});` : '') + ' diffuseColor.rgb *= mix(uDark, uLight, smoothstep(uLo, uHi, l)); }\n#endif');
      if (prev) prev.call(this, shader, r);
      // and the line pass sees the hands as nearly flat to the camera: a hand drawn small keeps its outline, not an ink line on every knuckle and finger
      if (hf) shader.fragmentShader = shader.fragmentShader.replace(/vec3\(0\., 0\., 1\.\), (\d\.\d+)\)/, 'vec3(0., 0., 1.), mix($1, .985, vHand))').replace('* .5 + .5, .97);', '* .5 + .5, mix(.97, .95, step(.5, vHand)));');   // (.95: a hand. The edge pass draws a hand's lines lighter: post.js)
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|ramp' + (hf ? '|hf' + hf : '') + (bt ? '|belt' : ''); };
  }
  m.needsUpdate = true; return m;
}

// Cloth as a painter simplifies it (round fifteen): the normals averaged with their neighbours a few times over, so the
// three-tone light falls on the shirt in a few broad planes instead of every rib and muscle of the body under it. Seams
// are welded by position first (the UV seams split vertices), so a seam never shows as a line of light.
function smoothNormals(pos, nor, index, n, iters) {
  const key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.round(pos[i * 3] * 2000) + ',' + Math.round(pos[i * 3 + 1] * 2000) + ',' + Math.round(pos[i * 3 + 2] * 2000); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[weld[index[t + a]]].add(weld[index[t + b]]);
  let cur = Float32Array.from(nor); const nxt = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { if (weld[i] !== i) continue; let x = cur[i * 3], y = cur[i * 3 + 1], z = cur[i * 3 + 2];
      for (const j of nb[i]) { x += cur[j * 3]; y += cur[j * 3 + 1]; z += cur[j * 3 + 2]; }
      const L = Math.hypot(x, y, z) || 1; nxt[i * 3] = x / L; nxt[i * 3 + 1] = y / L; nxt[i * 3 + 2] = z / L; }
    for (let i = 0; i < n; i++) if (weld[i] === i) { cur[i * 3] = nxt[i * 3]; cur[i * 3 + 1] = nxt[i * 3 + 1]; cur[i * 3 + 2] = nxt[i * 3 + 2]; }
  }
  for (let i = 0; i < n; i++) { const w = weld[i]; nor[i * 3] = cur[w * 3]; nor[i * 3 + 1] = cur[w * 3 + 1]; nor[i * 3 + 2] = cur[w * 3 + 2]; }
}

// ---- clips ------------------------------------------------------------------------------------------------------
const CLIPS = {};
for (const name in PACK.clips) { const c = PACK.clips[name]; CLIPS[name] = { dur: c.dur, frames: c.frames, q: null, pelvis: null, src: c }; }
const clip = (name) => { const c = CLIPS[name]; if (!c.q) { c.q = arr(Int16Array, c.src.q); c.pelvis = arr(Float32Array, c.src.pelvis); } return c; };
export const clipDur = (name) => CLIPS[name].dur;
export const REAL = PACK.bodies === 'real';   // the realistic (MakeHuman) bodies, not the stylised library ones

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const quat = (rx, ry, rz, out = new THREE.Quaternion()) => out.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const qLevel = quat(-Math.PI / 2, 0, 0);
const CLIP_KEYS = [['cIdle', 'Idle_Loop'], ['cWalk', 'Walk_Formal_Loop'], ['cSit', 'Sitting_Idle_Loop'], ['cSitIn', 'Sitting_Enter'], ['cKneel', 'Fixing_Kneeling'],
  ['cCarry', 'Walk_Carry_Loop'], ['cPick', 'PickUp_Table'], ['cReach', 'Interact'], ['cCrouch', 'Crouch_Idle_Loop'], ['cTalk', 'Idle_Talking_Loop'], ['cNod', 'Yes']];
const SPINE = [['spine_01', 'sp', 0.5], ['spine_02', 'sp', 0.5], ['spine_03', 'ch', 1], ['neck_01', 'nk', 1], ['Head', 'hd', 1]];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
export const GAIT = { thigh: 1.22, kneeFrom: 0.35, knee: 0.6, foot: 0.75 };   // the walk's step and knee (round seventeen; see gait() below)

export function createPerson(key, S = {}) {
  const P = PACK.people[key], nb = P.bones.length;
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const bones = P.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.fromArray(b.t); o.quaternion.fromArray(b.q); return o; });
  const B = {}; P.bones.forEach((b, i) => { B[b.name] = bones[i]; if (b.parent < 0) inner.add(bones[i]); else bones[b.parent].add(bones[i]); });
  inner.updateMatrixWorld(true);
  // the eyes (round fourteen): the library's rig has no face bones, so the eyes turned with the head and could only
  // stare straight out of it. Each eyeball gets a bone of its own here, hung from the head at the eyeball's centre and
  // lined up with the body's rest axes, and its vertices are weighted to it. fig.eyesTo() turns them to look at a thing.
  const eyeBones = [], eyeSide = new Map();
  if (B.Head && S.parts) for (const M of P.meshes) {
    const spec = S.parts(M); if (!spec || spec.role !== 'eyes') continue;
    const pos = arr(Float32Array, M.pos); let mx = 0; for (let i = 0; i < M.count; i++) mx += pos[i * 3] / M.count;
    const C = [new THREE.Vector3(), new THREE.Vector3()], N = [0, 0], side = new Uint8Array(M.count);
    for (let i = 0; i < M.count; i++) { const k = pos[i * 3] > mx ? 0 : 1; side[i] = k; C[k].x += pos[i * 3]; C[k].y += pos[i * 3 + 1]; C[k].z += pos[i * 3 + 2]; N[k]++; }
    if (!N[0] || !N[1]) continue;
    const hq = B.Head.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const k of [0, 1]) { C[k].multiplyScalar(1 / N[k]);
      // (the centre of the vertices sits a little forward of the ball's pivot: the cornea bulges. Pull it back 0.4 of the radius)
      let rz = 0; for (let i = 0; i < M.count; i++) if (side[i] === k) rz = Math.max(rz, pos[i * 3 + 2] - C[k].z); C[k].z -= rz * 0.4;
      const o = new THREE.Bone(); o.name = k ? 'eye_r' : 'eye_l'; B.Head.add(o); o.position.copy(B.Head.worldToLocal(C[k].clone())); o.quaternion.copy(hq); o.updateMatrixWorld(true);
      B[o.name] = o; bones.push(o); eyeBones.push(o); }
    eyeSide.set(M.name, { side, i0: bones.length - 2 });
  }
  inner.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  // height: scale the whole model so the top of the head is where the bible says
  let top = 0; const meshes = [];
  for (const M of P.meshes) {
    const spec = S.parts ? S.parts(M) : {}; if (spec === null) continue;
    const g = new THREE.BufferGeometry(), pos = arr(Float32Array, M.pos), n8 = arr(Int8Array, M.nor), nor = new Float32Array(M.count * 3), jw8 = arr(Uint8Array, M.jw), jw = new Float32Array(M.count * 4);
    for (let i = 0; i < M.count; i++) { nor[i * 3] = n8[i * 4] / 127; nor[i * 3 + 1] = n8[i * 4 + 1] / 127; nor[i * 3 + 2] = n8[i * 4 + 2] / 127; if (pos[i * 3 + 1] > top) top = pos[i * 3 + 1]; }
    for (let i = 0; i < jw.length; i++) jw[i] = jw8[i] / 255;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(arr(Float32Array, M.uv), 2));
    const ji = Array.from(arr(Uint8Array, M.ji)), es = eyeSide.get(M.name);
    if (spec.smoothN) smoothNormals(pos, nor, M.wide ? arr(Uint32Array, M.index) : arr(Uint16Array, M.index), M.count, spec.smoothN);
    if (spec.handFlat) {   // how much of each vertex hangs from a hand or a finger (round fourteen: the skin texture's knuckle creases went to dark blots on a hand drawn small)
      const nm = bones.map((b) => b.name), ah = new Float32Array(M.count);
      for (let i = 0; i < M.count; i++) { let w = 0; for (let c = 0; c < 4; c++) if (/^(hand|index|middle|ring|pinky|thumb)_/.test(nm[ji[i * 4 + c]] || '')) w += jw[i * 4 + c]; ah[i] = Math.min(1, w); }
      g.setAttribute('aHand', new THREE.BufferAttribute(ah, 1));
    }
    if (es) for (let i = 0; i < M.count; i++) { ji[i * 4] = es.i0 + es.side[i]; ji[i * 4 + 1] = ji[i * 4 + 2] = ji[i * 4 + 3] = 0; jw[i * 4] = 1; jw[i * 4 + 1] = jw[i * 4 + 2] = jw[i * 4 + 3] = 0; }   // (each eyeball rides on its own bone)
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ji, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(jw, 4));
    g.setIndex(new THREE.BufferAttribute(M.wide ? arr(Uint32Array, M.index) : arr(Uint16Array, M.index), 1));
    const belt = spec.belt && B.pelvis ? { ...spec.belt, y: B.pelvis.getWorldPosition(new THREE.Vector3()).y + spec.belt.at } : null;   // (the belt's height over the hip joint at rest, in the model's own units, as tools/assets.mjs cut the outfit)
    const mesh = new THREE.SkinnedMesh(g, painted(spec.tex === undefined ? M.tex : spec.tex, { alphaTest: M.alpha || 0, ...spec, belt }));
    if (spec.inkSoft) mesh.material.userData.inkSoft = spec.inkSoft;
    if (spec.role === 'skin') mesh.material.userData.inkSkin = true;   // (round thirteen: where skin lies over its own skin, the chin over the neck, the line is only a breath: materials.js, post.js)
    if (spec.role === 'eyes') blinkPatch(mesh, M, pos, spec.lid);
    mesh.name = M.name; mesh.userData.role = spec.role || 'body'; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    inner.add(mesh); mesh.bind(skeleton, new THREE.Matrix4()); meshes.push(mesh);
  }
  const blinkU = meshes.map((m) => m.userData.blink).filter(Boolean);
  const scale = (S.height || top) / top; inner.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  // ---- rest measurements, in figure space (root space, metres) ----------------------------------------------------
  const restQ = {}, restP = {}, restLocal = {};
  for (const b of bones) { restQ[b.name] = b.getWorldQuaternion(new THREE.Quaternion()); restP[b.name] = b.getWorldPosition(new THREE.Vector3()); restLocal[b.name] = b.quaternion.clone(); }
  const len = (a, b) => restP[a].distanceTo(restP[b]);
  const D = { pelvis: restP.pelvis.y, sh: restP.upperarm_l.y, sw: Math.abs(restP.upperarm_l.x), ua: len('upperarm_l', 'lowerarm_l'), fa: len('lowerarm_l', 'hand_l'), hw: Math.abs(restP.thigh_l.x),
    thigh: len('thigh_l', 'calf_l'), shin: len('calf_l', 'foot_l'), ankle: restP.foot_l.y, head: restP.Head.y, top: top * scale, hs: 1, scale };
  D.wrist = D.sh - D.ua - D.fa; D.chest = restP.spine_03.y;
  // the hand's working frame: -Y down the fingers, +Z toward the thumb side, X across (the palm faces +X on the right
  // hand, -X on the left). Poses are written in this frame, so they do not care how the rig's bones are oriented.
  const hand = {};
  for (const s of ['l', 'r']) {
    const f = _a.copy(restP['middle_01_' + s]).sub(restP['hand_' + s]).normalize(), t = _b.copy(restP['index_01_' + s]).sub(restP['pinky_01_' + s]); t.addScaledVector(f, -t.dot(f)).normalize();
    const Y = f.clone().negate(), Z = t.clone(), X = new THREE.Vector3().crossVectors(Y, Z);
    const Qo = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const palm = X.clone().multiplyScalar(s === 'r' ? 1 : -1);
    const fingers = [];   // each finger joint with its curl axis in its own local space
    for (const fn of FINGERS) for (const k of [1, 2, 3]) { const n = `${fn}_0${k}_${s}`, bo = B[n]; if (!bo) continue;
      const ax = new THREE.Vector3().crossVectors(f, palm).normalize().applyQuaternion(restQ[n].clone().invert()); fingers.push({ bo, ax, rest: restLocal[n], amt: k === 1 ? 0.8 : 0.9 }); }
    const thumb = [1, 2, 3].map((k) => { const n = `thumb_0${k}_${s}`, bo = B[n]; const ax = new THREE.Vector3().crossVectors(t.clone().multiplyScalar(1), palm).normalize().applyQuaternion(restQ[n].clone().invert()); return { bo, ax, rest: restLocal[n], amt: k === 1 ? 0.35 : 0.55 }; });
    hand[s] = { off: Qo.clone().invert().multiply(restQ['hand_' + s]), offInv: restQ['hand_' + s].clone().invert().multiply(Qo), fingers, thumb };
  }
  const SIDE = { L: 'l', R: 'r' };

  // ---- pose channels ----------------------------------------------------------------------------------------------
  const rest = () => ({
    cIdle: 1, cWalk: 0, cSit: 0, cSitIn: 0, cKneel: 0, cCarry: 0, cPick: 0, cReach: 0, cCrouch: 0, cTalk: 0, cNod: 0,
    hipX: 0, hipY: 0, hipZ: 0, pelRX: 0, pelRY: 0, pelRZ: 0, spRX: 0, spRY: 0, spRZ: 0, chRX: 0, chRY: 0, chRZ: 0, nkRX: 0, nkRY: 0, hdRX: 0, hdRY: 0, hdRZ: 0,
    ikL: 0, ikR: 0, aLx: D.sw + 0.05, aLy: D.wrist + 0.03, aLz: 0.04, aRx: -D.sw - 0.05, aRy: D.wrist + 0.03, aRz: 0.04,
    pLx: 0.35, pLy: -0.1, pLz: -1, pRx: -0.35, pRy: -0.1, pRz: -1,
    hLm: 0, hLaz: 0, hLtilt: 0, hLroll: 0, hRm: 0, hRaz: 0, hRtilt: 0, hRroll: 0, curlL: 0.35, curlR: 0.35, thL: 0.2, thR: 0.2,
    gripL: 0, gripR: 0, legIK: 0, fLx: D.hw, fLy: 0, fLz: 0, fLp: 0, fRx: -D.hw, fRy: 0, fRz: 0, fRp: 0, toe: 0.14, straight: 0,
  });
  const cur = rest();
  const blend = (a, b, t) => { for (const k in a) a[k] += (b[k] - a[k]) * t; return a; };
  const time = {}; for (const [, name] of CLIP_KEYS) time[name] = 0;
  const rootM = new THREE.Matrix4(), rootQ = new THREE.Quaternion(), rootInv = new THREE.Matrix4();
  let floor = null;   // (x, z) -> y of the ground under a foot, in world space. null: the root's own y

  // base pose: a weighted mix of real clips
  const acc = new Float32Array(nb * 4), pel = new THREE.Vector3(), iPelvis = P.bones.findIndex((b) => b.name === 'pelvis'), srcPelvisY = PACK.people.jo.bones[iPelvis] ? null : null;
  void srcPelvisY;
  const clipPelvisRest = clip('Idle_Loop').pelvis;   // used only for its scale: clips were made on the first body
  const pelvisScale = P.bones[iPelvis].t.reduce((s, x) => s + x * x, 0) ** 0.5 / (PACK.people.jo.bones[iPelvis].t.reduce((s, x) => s + x * x, 0) ** 0.5 || 1);
  void clipPelvisRest;
  function base(p) {
    let sum = 0; for (const [k] of CLIP_KEYS) sum += Math.max(0, p[k]);
    acc.fill(0); pel.set(0, 0, 0);
    for (const [k, name] of CLIP_KEYS) {
      const w = sum > 1e-4 ? Math.max(0, p[k]) / sum : (k === 'cIdle' ? 1 : 0); if (w < 1e-4) continue;
      const c = clip(name), loop = /_Loop$/.test(name), tt = loop ? ((time[name] % c.dur) + c.dur) % c.dur : clamp(time[name], 0, c.dur);
      const f = tt / c.dur * (c.frames - 1), f0 = Math.min(c.frames - 1, Math.floor(f)), f1 = Math.min(c.frames - 1, f0 + 1), u = f - f0, Q = c.q;
      for (let b = 0; b < nb; b++) {
        const o0 = (f0 * nb + b) * 4, o1 = (f1 * nb + b) * 4, o = b * 4;
        let d = Q[o0] * Q[o1] + Q[o0 + 1] * Q[o1 + 1] + Q[o0 + 2] * Q[o1 + 2] + Q[o0 + 3] * Q[o1 + 3]; const s1 = d < 0 ? -u : u;
        let x = Q[o0] * (1 - u) + Q[o1] * s1, y = Q[o0 + 1] * (1 - u) + Q[o1 + 1] * s1, z = Q[o0 + 2] * (1 - u) + Q[o1 + 2] * s1, ww = Q[o0 + 3] * (1 - u) + Q[o1 + 3] * s1;
        d = acc[o] * x + acc[o + 1] * y + acc[o + 2] * z + acc[o + 3] * ww; const sg = d < 0 ? -w : w;
        acc[o] += x * sg; acc[o + 1] += y * sg; acc[o + 2] += z * sg; acc[o + 3] += ww * sg;
      }
      const pp = c.pelvis; pel.x += (pp[f0 * 3] * (1 - u) + pp[f1 * 3] * u) * w; pel.y += (pp[f0 * 3 + 1] * (1 - u) + pp[f1 * 3 + 1] * u) * w; pel.z += (pp[f0 * 3 + 2] * (1 - u) + pp[f1 * 3 + 2] * u) * w;
    }
    for (let b = 0; b < nb; b++) { const o = b * 4; bones[b].quaternion.set(acc[o], acc[o + 1], acc[o + 2], acc[o + 3]).normalize(); }
    bones[iPelvis].position.copy(pel).multiplyScalar(pelvisScale);
    const ww = sum > 1e-4 ? Math.max(0, p.cWalk) / sum : 0;
    if (ww > 1e-3) {   // (the longer step lowers the hips by as much as it would lift the standing foot, so that foot stays on the deck)
      const low = () => { inner.updateMatrixWorld(true); return Math.min(_c.setFromMatrixPosition(B.foot_l.matrixWorld).y, _c.setFromMatrixPosition(B.foot_r.matrixWorld).y); };
      const y0 = low(); gait(ww); const dy = y0 - low();
      _v.set(0, dy, 0); wquat(bones[iPelvis].parent, _q).invert(); bones[iPelvis].position.add(_v.applyQuaternion(_q).multiplyScalar(1 / scale));
    }
  }
  // (round seventeen) the walk, made a person's. The library's walk lifts the swinging knee to 89 degrees and takes short
  // steps, so at her pace it went at 164 steps a minute: high knees, quick feet, a horse's trot (the owner). People bend
  // the swinging knee about 60 degrees and step about 0.42 of their height. So, on top of the clip: each thigh swings
  // further about its own mean (a longer step), and the knee's bend past 20 degrees is taken down. The stance leg (under
  // 20 degrees) is the clip's. tools/gait.mjs measures the result against a person's walk.
  let thighMean = null;
  const scaleTurn = (q, k) => { if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); const a = 2 * Math.acos(clamp(q.w, -1, 1)); if (a < 1e-6) return q.identity(); _a.set(q.x, q.y, q.z).normalize(); return q.setFromAxisAngle(_a, k(a)); };
  function gait(w) {
    if (!thighMean) { const c = clip('Walk_Formal_Loop'); thighMean = {};
      for (const s of ['l', 'r']) { const bi = P.bones.findIndex((b) => b.name === 'thigh_' + s), m = new THREE.Quaternion(0, 0, 0, 0), q = new THREE.Quaternion();
        for (let f = 0; f < c.frames; f++) { const o = (f * nb + bi) * 4; q.set(c.q[o], c.q[o + 1], c.q[o + 2], c.q[o + 3]); if (q.dot(m) < 0) q.set(-q.x, -q.y, -q.z, -q.w); m.x += q.x; m.y += q.y; m.z += q.z; m.w += q.w; }
        thighMean[s] = m.normalize(); } }
    for (const s of ['l', 'r']) {
      const th = B['thigh_' + s], ca = B['calf_' + s], m = thighMean[s];
      scaleTurn(_q.copy(m).invert().multiply(th.quaternion), (a) => a * (S.stride ?? GAIT.thigh)); th.quaternion.slerp(_q.premultiply(m), w);
      let bend = 0; scaleTurn(_q.copy(restLocal['calf_' + s]).invert().multiply(ca.quaternion), (a) => { bend = a; return a <= GAIT.kneeFrom ? a : GAIT.kneeFrom + (a - GAIT.kneeFrom) * GAIT.knee; });
      ca.quaternion.slerp(_q.premultiply(restLocal['calf_' + s]), w);
      // and the swinging foot comes up level with the shin (a person's toes clear the deck), not left pointing down like a
      // hoof as the clip has it: the more the knee is bent, the nearer the foot is to its rest angle on the shin
      const fo = B['foot_' + s]; fo.quaternion.slerp(restLocal['foot_' + s], w * GAIT.foot * clamp((bend - GAIT.kneeFrom) / 0.5));
    }
  }
  // world helpers. Bones are read and written in world space, so nothing here depends on how the rig's axes lie.
  const wpos = (bo, out) => out.setFromMatrixPosition(bo.matrixWorld);
  const wquat = (bo, out) => { bo.matrixWorld.decompose(_s, out, _d); return out; };
  function setWorldQ(bo, wq) { wquat(bo.parent, _q3).invert(); bo.quaternion.copy(_q3.multiply(wq)); bo.updateMatrixWorld(true); }
  function aim(bo, from, to, pivot) {   // rotate bo so the direction pivot->from becomes pivot->to
    _a.copy(from).sub(pivot).normalize(); _b.copy(to).sub(pivot).normalize();
    const wq = wquat(bo, new THREE.Quaternion()).premultiply(_q2.setFromUnitVectors(_a, _b)); setWorldQ(bo, wq);
  }
  const S0 = new THREE.Vector3(), E0 = new THREE.Vector3(), W0 = new THREE.Vector3(), E1 = new THREE.Vector3(), W1 = new THREE.Vector3(), dir = new THREE.Vector3(), perp = new THREE.Vector3();
  function ik2(upper, lower, end, target, pole) {
    wpos(upper, S0); wpos(lower, E0); wpos(end, W0);
    const l1 = S0.distanceTo(E0), l2 = E0.distanceTo(W0); dir.copy(target).sub(S0); const raw = dir.length() || 1e-5, L = clamp(raw, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.998); dir.multiplyScalar(1 / raw);
    const ca = clamp((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1), sa = Math.sqrt(1 - ca * ca);
    perp.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (perp.lengthSq() < 1e-8) perp.set(0, 0, -1).addScaledVector(dir, dir.z); perp.normalize();
    E1.copy(S0).addScaledVector(dir, l1 * ca).addScaledVector(perp, l1 * sa); W1.copy(S0).addScaledVector(dir, L);
    aim(upper, E0, E1, S0); wpos(lower, E0); wpos(end, W0); aim(lower, W0, W1, E0);
    return raw <= l1 + l2;
  }
  const footP = { l: new THREE.Vector3(), r: new THREE.Vector3() }, footQ = { l: new THREE.Quaternion(), r: new THREE.Quaternion() }, kneeP = { l: new THREE.Vector3(), r: new THREE.Vector3() }, T = new THREE.Vector3(), pole = new THREE.Vector3(), H = new THREE.Quaternion();
  const reach = { L: true, R: true };

  const lock = { s: null, p: new THREE.Vector3() };   // the walking foot held on the deck (solve, below)
  function solve(p) {
    base(p);
    inner.updateMatrixWorld(true);
    for (const s of ['l', 'r']) { wpos(B['foot_' + s], footP[s]); wquat(B['foot_' + s], footQ[s]); wpos(B['calf_' + s], kneeP[s]); }
    // hips: moved and turned in figure space; the feet are put back afterwards, so the knees take it up
    const pv = B.pelvis, hipMoved = Math.abs(p.hipX) + Math.abs(p.hipY) + Math.abs(p.hipZ) + Math.abs(p.pelRX) + Math.abs(p.pelRY) + Math.abs(p.pelRZ) > 1e-4;
    if (hipMoved) {
      _v.set(p.hipX, p.hipY, p.hipZ).applyQuaternion(rootQ); wquat(pv.parent, _q).invert(); pv.position.add(_v.applyQuaternion(_q).multiplyScalar(1 / scale));
      pv.quaternion.multiply(_q.copy(restQ.pelvis).invert().multiply(quat(p.pelRX, p.pelRY, p.pelRZ, _q2)).multiply(restQ.pelvis));
    }
    // spine, neck, head: added on top of the clip, about each bone's own (figure-aligned) axes
    for (const [n, k, f] of SPINE) {
      const rx = p[k + 'RX'] * f, ry = p[k + 'RY'] * f, rz = (p[k + 'RZ'] || 0) * f; if (Math.abs(rx) + Math.abs(ry) + Math.abs(rz) < 1e-5) continue;
      B[n].quaternion.multiply(_q.copy(restQ[n]).invert().multiply(quat(rx, ry, rz, _q2)).multiply(restQ[n]));
    }
    inner.updateMatrixWorld(true);
    // standing: the library's idle has both knees bent (about 140 degrees, a half squat from the side). The hips go up
    // until the less bent leg is nearly straight; never further, so neither foot leaves the floor (round twelve). A pose
    // that lowers the hips on purpose (hipY below zero) keeps its bend.
    const sk = clamp(p.straight) * clamp(p.legIK) * clamp(1 + p.hipY * 20) * clamp(1 - 3 * (p.cSit + p.cSitIn + p.cKneel + p.cCrouch));   // (never while sitting, kneeling or crouching, nor on the way into it)
    if (sk > 1e-3) {
      let lift = Infinity;
      for (const [n, s] of [['L', 'l'], ['R', 'r']]) {
        _v.set(p['f' + n + 'x'], p['f' + n + 'y'] + D.ankle, p['f' + n + 'z']).applyMatrix4(rootM);
        const hip = wpos(B['thigh_' + s], _u), Lw = (restP['thigh_' + s].distanceTo(restP['calf_' + s]) + restP['calf_' + s].distanceTo(restP['foot_' + s])) * 0.993;
        const hz = Math.hypot(hip.x - _v.x, hip.z - _v.z), want = Math.sqrt(Math.max(0, Lw * Lw - hz * hz)) - (hip.y - _v.y); lift = Math.min(lift, want);
      }
      if (lift > 0 && lift < 0.2) { _v.set(0, lift * sk, 0); wquat(pv.parent, _q).invert(); pv.position.add(_v.applyQuaternion(_q).multiplyScalar(1 / scale)); inner.updateMatrixWorld(true); }
    }
    // legs: feet back where the clip had them (or on the targets, on the stairs), never under the ground
    for (const [n, s, sg] of [['L', 'l', 1], ['R', 'r', -1]]) {
      const k = clamp(p.legIK), ft = B['foot_' + s]; T.copy(footP[s]);
      if (k > 0) { _v.set(p['f' + n + 'x'], p['f' + n + 'y'] + D.ankle, p['f' + n + 'z']).applyMatrix4(rootM); T.lerp(_v, k); }
      if (floor) { const fy = floor(T.x, T.z) + D.ankle; if (T.y < fy) T.y = fy; }
      wpos(ft, _w); if (!hipMoved && k <= 0 && _w.distanceToSquared(T) < 1e-6) continue;
      // the knee keeps the plane the clip gave it; on the stairs it points forward
      pole.copy(kneeP[s]).sub(wpos(B['thigh_' + s], _u)); if (k > 0) pole.lerp(_v.set(sg * 0.12, 0.05, 1).applyQuaternion(rootQ), k);
      ik2(B['thigh_' + s], B['calf_' + s], ft, T, pole);
      H.copy(footQ[s]); if (k > 0) H.slerp(_q.copy(rootQ).multiply(quat(p['f' + n + 'p'], sg * p.toe, 0, _q2)).multiply(restQ['foot_' + s]), k);
      setWorldQ(ft, H);
    }
    // (round seventeen) walking, the foot on the deck stays where it came down. The longer step swings the leg through a
    // wider arc, so the foot's speed under her is no longer even through the step and it slid on the boards. The lower
    // foot is held where it landed (the leg solved to it, the foot keeping its own turn) until it is the other's turn.
    // Off while the legs are on targets (stairs, standing) and while tools/gait measure the clip (fig.lockFeet false).
    const wk = clamp(p.cWalk / Math.max(1e-4, CLIP_KEYS.reduce((a, [k]) => a + Math.max(0, p[k]), 0)));
    if (api.lockFeet && wk > 0.5 && clamp(p.legIK) < 0.01) {
      const yl = wpos(B.foot_l, _a).y, yr = wpos(B.foot_r, _b).y, s = lock.s && Math.abs(yl - yr) < 0.006 ? lock.s : yl < yr ? 'l' : 'r';
      const ft = B['foot_' + s]; wpos(ft, _w);
      if (s !== lock.s) { lock.s = s; lock.p.copy(_w); }
      else { T.set(lock.p.x, _w.y, lock.p.z); const off = Math.hypot(T.x - _w.x, T.z - _w.z);
        if (off > 0.2) lock.p.copy(_w);
        else if (off > 1e-4) { wquat(ft, H); pole.copy(wpos(B['calf_' + s], _u)).sub(wpos(B['thigh_' + s], _c)); ik2(B['thigh_' + s], B['calf_' + s], ft, T, pole); setWorldQ(ft, H); } }
    } else lock.s = null;
    // arms: the wrist onto its target, eased in from where the clip had it; then the hand turned; then the fingers
    for (const n of ['L', 'R']) {
      const s = SIDE[n], k = clamp(p['ik' + n]);
      if (k <= 1e-3) { reach[n] = true; const g = clamp(p['grip' + n] || 0);   // (round seventeen) the arm as the clip has it, the fingers closed round something carried
        if (g > 1e-3) { for (const f of hand[s].fingers) f.bo.quaternion.slerp(_q.copy(f.rest).multiply(_q2.setFromAxisAngle(f.ax, p['curl' + n] * f.amt)), g); for (const f of hand[s].thumb) f.bo.quaternion.slerp(_q.copy(f.rest).multiply(_q2.setFromAxisAngle(f.ax, (0.25 + p['th' + n]) * f.amt)), g); }
        continue; }
      const up = B['upperarm_' + s], lo = B['lowerarm_' + s], ha = B['hand_' + s], hd = hand[s];
      wpos(ha, _w); T.set(p['a' + n + 'x'], p['a' + n + 'y'], p['a' + n + 'z']).applyMatrix4(rootM); T.lerpVectors(_w, T, k);
      pole.set(p['p' + n + 'x'], p['p' + n + 'y'], p['p' + n + 'z']).applyQuaternion(rootQ);
      wquat(ha, H);   // the hand as the clip left it, to ease from
      reach[n] = ik2(up, lo, ha, T, pole);
      const hm = clamp(p['h' + n + 'm']);
      if (hm > 0) { quat(p['h' + n + 'tilt'], p['h' + n + 'az'], p['h' + n + 'roll'], _q).multiply(qLevel); _q2.copy(rootQ).multiply(_q).multiply(hd.off); wquat(ha, _q); _q.slerp(_q2, hm * k); setWorldQ(ha, _q); }
      const curl = p['curl' + n], th = p['th' + n];
      for (const f of hd.fingers) f.bo.quaternion.slerp(_q.copy(f.rest).multiply(_q2.setFromAxisAngle(f.ax, curl * f.amt)), k);
      for (const f of hd.thumb) f.bo.quaternion.slerp(_q.copy(f.rest).multiply(_q2.setFromAxisAngle(f.ax, (0.25 + th) * f.amt)), k);
    }
    inner.updateMatrixWorld(true);
  }
  const api = {
    lockFeet: false,
    root, inner, meshes, skeleton, bones: B, D, rest, blend, cur, solve, time, reach, hand, restP,
    setFloor(fn) { floor = fn; },
    // the lids: 0 open .. 1 shut. Set every frame by whoever moves this person.
    blink(v) { for (const u of blinkU) u.value = v; },
    // the eyes turn to look at a point in the world (k 0 straight out of the head .. 1 on it). Called after solve().
    // Kept to what reads as an eye turned, not rolled: 30 degrees either side, 26 down, 15 up (further down, with no lid
    // bones, the iris went under the lower lid and only the white was left). Returns the turn actually made, in radians.
    eyesTo(w, k = 1) {
      if (!eyeBones.length) return 0; let made = 0, pd = 0;
      const hq = wquat(B.Head, new THREE.Quaternion()).multiply(_q2.copy(restQ.Head).invert());   // the head's turn from rest, in the world
      const hqi = hq.clone().invert();
      for (const e of eyeBones) {
        const d = _a.copy(w).sub(wpos(e, _b)).normalize().applyQuaternion(hqi);
        const yaw = clamp(Math.atan2(d.x, d.z), -0.52, 0.52) * k, pitch = clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -0.26, 0.45) * k;
        const qr = quat(pitch, yaw, 0, new THREE.Quaternion()); setWorldQ(e, hq.clone().multiply(qr)); made = Math.max(made, Math.hypot(yaw, pitch)); pd += pitch / eyeBones.length;
      }
      for (const m of meshes) if (m.userData.pitch) m.userData.pitch.value = pd;
      return made;
    },
    eyesRest() { for (const m of meshes) if (m.userData.pitch) m.userData.pitch.value = 0; for (const e of eyeBones) setWorldQ(e, wquat(B.Head, new THREE.Quaternion()).multiply(_q2.copy(restQ.Head).invert())); },
    eyeBones,
    // the upper lids let down part way: eyes cast down to a page (0 open .. 1 the top half of the eye covered)
    down(v) { for (const m of meshes) if (m.userData.down) m.userData.down.value = v; },
    // an ordinary blink every three to five seconds, a quarter second long, from the game's clock (so a test sees the same)
    lids(t, seed = 0) { const k = Math.floor(t / 4.15), ph = t - k * 4.15, h = Math.abs(Math.sin((k + seed * 7) * 12.9898) * 43758.5453) % 1, u = (ph - 0.4 - h * 3.2) / 0.24;
      this.blink(u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 0.6 : 0); },
    // standing at ease. The library's idle clip stands like a fencer (one foot 38 cm behind the other), which from the
    // side reads as a stride held still. The feet of the real rig are brought under the hips instead: a hand's width
    // apart, one a little ahead, the weight going slowly from one leg to the other.
    stand(p, t = 0, k = 1) {
      const sway = Math.sin(t * 0.37), w = D.hw * 0.92;
      p.legIK = k; p.straight = k; p.fLx = w; p.fLy = 0; p.fLz = -0.05; p.fLp = 0; p.fRx = -w; p.fRy = 0; p.fRz = -0.13; p.fRp = 0; p.toe = 0.16;
      p.hipX += 0.014 * sway * k; p.pelRZ += -0.018 * sway * k; p.spRZ += 0.012 * sway * k;
      return p;
    },
    place(x, y, z, heading) { root.position.set(x, y, z); root.rotation.set(0, heading, 0); root.updateMatrixWorld(true); rootM.copy(root.matrixWorld); rootInv.copy(rootM).invert(); rootQ.setFromRotationMatrix(rootM); },
    toFigure(w, out) { return out.copy(w).applyMatrix4(rootInv); },
    toWorld(f, out) { return out.copy(f).applyMatrix4(rootM); },
    // world matrix of a named frame, with an optional local offset (for things held in a hand or worn on a head).
    // handL / handR: the working hand frame above. head / pelvis / chest: at the bone, axes as the figure's at rest.
    boneMatrix(name, out, local) {
      if (name === 'handL' || name === 'handR') { const s = name === 'handL' ? 'l' : 'r', bo = B['hand_' + s]; wpos(bo, _v); wquat(bo, _q).multiply(hand[s].offInv); out.compose(_v, _q, _one); }
      else { const bn = name === 'head' ? 'Head' : name === 'chest' ? 'spine_03' : name, bo = B[bn]; wpos(bo, _v); wquat(bo, _q).multiply(_q2.copy(restQ[bn]).invert()); out.compose(_v, _q, _one); }
      if (local) out.multiply(local); return out;
    },
    rootMatrix: rootM,
  };
  return api;
}

// ---- the lids -----------------------------------------------------------------------------------------------------
// The library's faces have eyes but no lids to close. A blink is painted on the eye mesh itself: from the top and the
// bottom of each eye the lid colour closes in toward its middle, and at the end a dark lash line is all that is left.
// Measured in the eye's own rest space, so it rides with the head wherever the clip puts it.
function blinkPatch(mesh, M, pos, lid) {
  const ys = []; for (let i = 0; i < M.count; i++) ys.push(pos[i * 3 + 1]);
  let lo = Infinity, hi = -Infinity; for (const y of ys) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  // the eyeball's pivot in depth (the middle of its vertices, pulled back 0.4 of the cornea's bulge, as for its bone)
  let zs = 0, zx = -Infinity; for (let i = 0; i < M.count; i++) { zs += pos[i * 3 + 2] / M.count; zx = Math.max(zx, pos[i * 3 + 2]); }
  const U = { uBlink: { value: 0 }, uDown: { value: 0 }, uPitch: { value: 0 }, uEyeZ: { value: zs - (zx - zs) * 0.4 }, uEyeC: { value: (lo + hi) / 2 }, uEyeH: { value: Math.max(1e-4, (hi - lo) / 2) }, uLid: { value: new THREE.Color(lid ? (PAL[lid] || lid) : '#b97a56') } };
  const m = mesh.material, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, r) {
    if (prev) prev.call(this, shader, r);
    Object.assign(shader.uniforms, U);
    // (the lids belong to the head, not the ball: when the eye turns down by uPitch, the height on it is measured as the
    // head sees it, so the lid stays put while the iris goes down under it, as a real upper lid follows the eye down)
    shader.vertexShader = 'uniform float uPitch; uniform float uEyeC; uniform float uEyeZ; varying float vEyeY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEyeY = uEyeC + (position.y - uEyeC) * cos(uPitch) - (position.z - uEyeZ) * sin(uPitch);');
    shader.fragmentShader = 'uniform float uBlink; uniform float uDown; uniform float uEyeC; uniform float uEyeH; uniform vec3 uLid; varying float vEyeY;\n' + shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n{ float d = abs(vEyeY - uEyeC) / uEyeH; if (uBlink > 0.01 && d > 1. - uBlink) diffuseColor.rgb = uLid; if (uBlink > 0.85 && d < 0.22) diffuseColor.rgb = uLid * 0.25; if (uDown > 0.01) { float e = (vEyeY - uEyeC) / uEyeH - (1. - 2. * uDown); if (e > 0.) diffuseColor.rgb = uLid; else if (e > -0.14) diffuseColor.rgb = uLid * 0.22; } }');   // (the let-down lid a shade under the skin, with a lash line along its edge)
  };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|blink'; };
  m.needsUpdate = true; mesh.userData.blink = U.uBlink; mesh.userData.down = U.uDown; mesh.userData.pitch = U.uPitch;
}

// ---- a real prop --------------------------------------------------------------------------------------------------
// The triangles of a model from the library as one mesh per part, painted like everything else.
export function createProp(key, spec = () => ({})) {
  const P = PACK.props[key]; if (!P) return null; const g = new THREE.Group();
  P.parts.forEach((M, i) => {
    const o = spec(M, i) || {}, geo = new THREE.BufferGeometry(), n8 = arr(Int8Array, M.nor), nor = new Float32Array(M.count * 3);
    for (let k = 0; k < M.count; k++) { nor[k * 3] = n8[k * 4] / 127; nor[k * 3 + 1] = n8[k * 4 + 1] / 127; nor[k * 3 + 2] = n8[k * 4 + 2] / 127; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr(Float32Array, M.pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(arr(Float32Array, M.uv), 2));
    geo.setIndex(new THREE.BufferAttribute(M.wide ? arr(Uint32Array, M.index) : arr(Uint16Array, M.index), 1));
    const mesh = new THREE.Mesh(geo, painted(o.tex === undefined ? M.tex : o.tex, o)); mesh.name = key + (P.parts.length > 1 ? i : ''); mesh.userData.part = M.name; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  });
  return g;
}
