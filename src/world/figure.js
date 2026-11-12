// OWNER: B (world). One puppet for both people. A small skeleton, a body modelled in its bind pose (arms down,
// facing +z), and CPU skinning into a single mesh: sleeves and trouser legs bend like cloth, not like hinges.
// Arms and legs are always solved by two-bone IK toward targets in figure space, so hands land on the things
// they hold and feet land on the treads. Nothing here runs in a vertex shader.
import * as THREE from 'three';
import { box, xf, col, mix, shade, paint, tube, V, ball, lathe, loft, ring, extrude, disc, clamp, lerp, smooth } from './kit.js';

const DOWN = new THREE.Vector3(0, -1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const quat = (rx, ry, rz, out = new THREE.Quaternion()) => out.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));

export function createFigure(S) {
  const k = S.k, wk = S.wk, Y = (v) => v * k, X = (v) => v * wk, hs = 1.14 * Math.sqrt(k);
  const D = { ankle: Y(0.07), knee: Y(0.44), hip: Y(0.84), pelvis: Y(0.9), spine: Y(1.02), chest: Y(1.16), sh: Y(1.335), neck: Y(1.385), head: Y(1.43), headC: Y(1.52),
    hw: X(0.085), sw: X(0.168), ua: Y(0.26), fa: Y(0.235), thigh: Y(0.4), shin: Y(0.37), hs };
  D.elbow = D.sh - D.ua; D.wrist = D.elbow - D.fa; D.knuckle = D.wrist - 0.085 * hs; D.fmid = D.knuckle - 0.045 * hs;
  // ---- bones ---------------------------------------------------------------------------------------------------
  const bones = [], byName = {};
  const bone = (name, parent, x, y, z) => { const b = { name, i: bones.length, parent: parent ? byName[parent] : null, bind: V(x, y, z), q: new THREE.Quaternion(), wq: new THREE.Quaternion(), wp: new THREE.Vector3() }; bones.push(b); byName[name] = b; return b; };
  bone('pelvis', null, 0, D.pelvis, 0); bone('spine', 'pelvis', 0, D.spine, 0); bone('chest', 'spine', 0, D.chest, 0); bone('neck', 'chest', 0, D.neck, 0); bone('head', 'neck', 0, D.head, 0);
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    bone('arm' + n, 'chest', s * D.sw, D.sh, 0); bone('fore' + n, 'arm' + n, s * D.sw, D.elbow, 0); bone('hand' + n, 'fore' + n, s * D.sw, D.wrist, 0);
    bone('fa' + n, 'hand' + n, s * D.sw, D.knuckle, 0); bone('fb' + n, 'fa' + n, s * D.sw, D.fmid, 0); bone('th' + n, 'hand' + n, s * D.sw, D.wrist - 0.028 * hs, 0.034 * hs);
    bone('leg' + n, 'pelvis', s * D.hw, D.hip, 0); bone('shin' + n, 'leg' + n, s * D.hw, D.knee, 0); bone('foot' + n, 'shin' + n, s * D.hw, D.ankle, 0);
  }
  // ---- geometry in the bind pose, with two bones and a weight per vertex -----------------------------------------
  const P = [], N = [], C = [], I = [], BI = [], W = [], parts = [];
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _cc = new THREE.Color();
  // skin: 'bone' | (pos) => [boneA, boneB, weightA]. tag names the body part, so tests can tell a sleeve from its end cap:
  // every piece is recorded as { tag, kind: 'skin' | 'cap', start, count } over the index buffer.
  function add(geo, colour, skin, m, tag = 'misc') {
    const pos = geo.attributes.position, nor = geo.attributes.normal, base = P.length / 3, fn = typeof colour === 'function' ? colour : null, fixed = fn ? null : col(colour), i0 = I.length;
    if (m) _nm.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i); if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      P.push(_v.x, _v.y, _v.z); N.push(_n.x, _n.y, _n.z); const c = fn ? fn(_v, _n) : fixed; C.push(c.r, c.g, c.b);
      if (typeof skin === 'string') { BI.push(byName[skin].i, byName[skin].i); W.push(1); } else { const [a, b, w] = skin(_v); BI.push(byName[a].i, byName[b].i); W.push(clamp(w)); }
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I.push(geo.index.getX(i) + base); else for (let i = 0; i < pos.count; i++) I.push(base + i);
    const cs = geo.userData ? geo.userData.capStart : null, cm = geo.userData ? geo.userData.capMid : null, n = I.length - i0;
    if (cs != null && cs < n) {
      parts.push({ tag, kind: 'skin', start: i0, count: cs });
      if (cm != null && cm > cs && cm < n) { parts.push({ tag, kind: 'cap', end: 0, start: i0 + cs, count: cm - cs }); parts.push({ tag, kind: 'cap', end: 1, start: i0 + cm, count: n - cm }); }
      else parts.push({ tag, kind: 'cap', end: geo.userData.capOnly ?? 0, start: i0 + cs, count: n - cs });
    } else parts.push({ tag, kind: 'skin', start: i0, count: n });
  }
  const blendY = (lo, hi, y0, y1) => (p) => [lo, hi, 1 - smooth(y0, y1, p.y)];
  const K = S.colours, skinC = col(K.skin);
  // legs
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    const x = s * D.hw, hem = S.bareAnkles ? Y(0.17) : Y(0.055), rT = X(0.09), rK = X(0.072), rH = S.bareAnkles ? X(0.078) : X(0.064);
    // the leg starts inside the seat, and its top ring belongs to the pelvis, so no end of it can ever show at the hip
    const pts = [V(x, Y(0.88), 0), V(x, Y(0.8), 0), V(x, Y(0.68), 0), V(x, D.knee + 0.04, 0), V(x, D.knee - 0.04, 0), V(x, (D.knee + hem) / 2, 0), V(x, hem, 0)], rr = [rT * 0.9, rT, rT * 0.93, rK * 1.04, rK, (rK + rH) / 2, rH];
    const legSkin = blendY('shin' + n, 'leg' + n, D.knee - 0.07, D.knee + 0.07);
    add(tube(pts, (t) => rr[Math.round(t * 6)], 8, 'start'), K.trousers, (p) => p.y > Y(0.8) ? ['pelvis', 'leg' + n, smooth(Y(0.8), Y(0.93), p.y)] : legSkin(p), null, 'leg' + n);
    add(disc(rH * 0.96, 8).rotateX(Math.PI), shade(K.trousers, 0.5), 'shin' + n, xf(x, hem + 0.045, 0), 'leg' + n);   // the dark inside of the leg, seen up the open hem
    add(ball(rK * 1.02, 8, 6), K.trousers, 'shin' + n, xf(x, D.knee, 0), 'leg' + n);   // the knee: a ball at the pivot, so the bend never opens
    if (S.bareAnkles) add(tube([V(x, hem + 0.03, 0), V(x, Y(0.05), 0)], 0.034, 6), skinC, 'shin' + n, null, 'ankle' + n);
    if (S.bareAnkles) add(ball(0.037, 8, 6), skinC, 'shin' + n, xf(x, D.ankle, 0.004), 'ankle' + n);   // the ankle bone: rounds the foot of the ankle into the slipper
    add(ball(1, 9, 6), K.shoe, 'foot' + n, xf(x, 0.04, 0.05, 0, 0, 0, X(0.052), 0.04, 0.125), 'shoe' + n);
    add(box(X(0.1), 0.014, 0.25), shade(K.shoe, 0.7), 'foot' + n, xf(x, 0.007, 0.05), 'shoe' + n);
  }
  // the seat: closes to a point between the legs (which hangs between them), and its lower rings move with the
  // nearer leg the way the thigh tops do, so a lifted knee carries the cloth over the hip instead of cutting through it
  const seatSkin = (p) => {
    if (p.y < Y(0.72)) return ['legL', 'legR', 0.5];
    const w = 1 - smooth(Y(0.8), Y(0.93), p.y); if (w <= 0) return ['pelvis', 'pelvis', 1];
    return Math.abs(p.x) < 0.03 ? (w > 0.5 ? ['legL', 'legR', 0.5] : ['pelvis', 'pelvis', 1]) : ['leg' + (p.x > 0 ? 'L' : 'R'), 'pelvis', w];
  };
  add(loft([ring(Y(0.7), X(0.03), 0.025, 10), ring(Y(0.76), X(0.165), 0.086, 10), ring(Y(0.84), X(0.174), 0.112, 10), ring(Y(0.9), X(0.162), 0.104, 10), ring(Y(0.925), X(0.07), 0.045, 10)], 'end'), K.trousers, seatSkin, null, 'pelvis');
  add(ball(0.042, 8, 6), K.trousers, seatSkin, xf(0, Y(0.715), 0), 'pelvis');   // plugs the seat's narrow bottom: round, never a flat end
  // torso: jacket or long coat
  const T = (y, rx, rz, cz = 0) => ring(Y(y), X(rx), rz * (0.5 + 0.5 * wk), 12, 0, cz);
  const rings = S.coat === 'long'
    ? [T(0.47, 0.215, 0.168), T(0.62, 0.208, 0.158), T(0.78, 0.196, 0.142), T(0.9, 0.186, 0.13), T(1.02, 0.172, 0.118), T(1.2, 0.186, 0.124, 0.006), T(1.3, 0.18, 0.108, 0.012), T(1.355, 0.105, 0.08, 0.018), T(1.385, 0.028, 0.028, 0.004)]
    : [T(0.76, 0.235, 0.162), T(0.86, 0.222, 0.152), T(0.96, 0.2, 0.138), T(1.02, 0.182, 0.122), T(1.2, 0.182, 0.119), T(1.305, 0.174, 0.102), T(1.36, 0.1, 0.076), T(1.388, 0.028, 0.028)];
  const coatSkin = (p) => {
    // the hem. The jacket's hem moves exactly as the trousers do under it (the same blend the thigh tops use), so it
    // can never cut through them; the long coat's front follows the legs and its back hangs from the seat.
    if (S.coat !== 'long') {
      const w = 1 - smooth(Y(0.8), Y(0.93), p.y);   // the same blend as the trousers' hip under it
      if (w > 0) return Math.abs(p.x) < 0.03 ? (w > 0.5 ? ['legL', 'legR', 0.5] : ['pelvis', 'spine', 1]) : ['leg' + (p.x > 0 ? 'L' : 'R'), 'pelvis', w];
    } else {
      const band = smooth(Y(0.93), Y(0.7), p.y);
      if (band > 0) {
        if (Math.abs(p.x) < 0.03) return band > 0.5 ? ['legL', 'legR', 0.5] : ['pelvis', 'spine', 1];   // the centre line hangs between the two legs
        return ['leg' + (p.x > 0 ? 'L' : 'R'), 'pelvis', lerp(0.5, 1, smooth(-0.08, 0.06, p.z)) * band];
      }
    }
    if (p.y < Y(1.07)) return ['pelvis', 'spine', 1 - smooth(Y(0.93), Y(1.07), p.y)];
    return ['spine', 'chest', 1 - smooth(Y(1.08), Y(1.22), p.y)];
  };
  add(loft(rings, 'end'), (p, n) => (S.coat === 'long' && p.z > 0.02 && Math.abs(p.x) < 0.016 && p.y < Y(1.2)) ? shade(K.coat, 0.72) : col(K.coat), coatSkin, null, 'torso');
  // the jacket's lining: looking up under the hem (she sits, she bends) you see the dark inside of the jacket, never the
  // top of the trousers' seat. A disc across the hem, facing down, moving exactly as the hem does.
  if (S.coat !== 'long') add(disc(1, 14).rotateX(Math.PI), shade(K.coat, 0.42), coatSkin, xf(0, Y(0.79), 0, 0, 0, 0, X(0.224), 1, 0.154 * (0.5 + 0.5 * wk)), 'lining');
  if (S.coat === 'long') {   // collar, and the lanyard with its card
    add(loft([ring(Y(1.34), X(0.115), 0.09, 10, 0, 0.012), ring(Y(1.4), X(0.085), 0.075, 10, 0, 0.004)], null), shade(K.coat, 0.86), 'chest', null, 'collar');
    add(box(0.058, 0.085, 0.01), 'tag', 'chest', xf(0.015, Y(1.1), 0.133 * (0.5 + 0.5 * wk) + 0.004, -0.06, 0, 0.06), 'lanyard');
    for (const s of [-1, 1]) add(box(0.014, 0.25, 0.008), 'marlowDim', 'chest', xf(0.015 + s * 0.035, Y(1.1) + 0.155, 0.118, -0.12, 0, s * 0.27), 'lanyard');
  } else {   // jacket: a collar, in the same ochre a step darker
    add(loft([ring(Y(1.35), X(0.1), 0.078, 10), ring(Y(1.39), X(0.075), 0.066, 10)], null), shade(K.coat, 0.82), 'chest', null, 'collar');
  }
  // arms and hands
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    const x = s * D.sw, up = 'arm' + n, fo = 'fore' + n, elb = blendY(fo, up, D.elbow - 0.055, D.elbow + 0.055);
    add(ball(X(0.066), 8, 6), K.coat, up, xf(x, D.sh, 0), 'shoulder' + n);
    if (S.sleeves === 'rolled') {
      add(tube([V(x, D.sh, 0), V(x, D.elbow + 0.07, 0), V(x, D.elbow + 0.0, 0), V(x, D.elbow - 0.03, 0)], (t) => X(lerp(0.064, 0.056, t)), 8), K.coat, elb, null, 'sleeve' + n);
      add(lathe([[X(0.044), -0.064], [X(0.068), -0.048], [X(0.068), -0.016], [X(0.0598), -0.002]], 10), mix(K.coat, 'joHat', 0.35), fo, xf(x, D.elbow, 0), 'cuff' + n);   // the roll: closed in at both ends, no flat ring
      add(tube([V(x, D.elbow - 0.04, 0), V(x, D.wrist + 0.08, 0), V(x, D.wrist - 0.005, 0)], (t) => lerp(0.043, 0.031, t), 7), skinC, fo, null, 'fore' + n);
    } else {
      // the sleeve closes in to the arm inside the cuff roll, so its end is a cone the roll hides, never a flat ring
      add(tube([V(x, D.sh, 0), V(x, D.elbow + 0.07, 0), V(x, D.elbow, 0), V(x, D.elbow - 0.07, 0), V(x, D.wrist + 0.03, 0), V(x, D.wrist + 0.012, 0)], (t) => X(t > 0.9 ? 0.034 : lerp(0.07, 0.054, t / 0.8)), 8), K.coat, elb, null, 'sleeve' + n);
      add(lathe([[X(0.03), 0.004], [X(0.066), 0.012], [X(0.066), 0.04], [X(0.058), 0.05]], 10), shade(K.coat, 0.85), fo, xf(x, D.wrist, 0), 'cuff' + n);   // the cuff: a roll closed onto the wrist, the sleeve ends inside it
      add(tube([V(x, D.wrist + 0.03, 0), V(x, D.wrist - 0.005, 0)], 0.032, 6), skinC, fo, null, 'fore' + n);
    }
    // joints are balls at the pivot: a bend at the elbow or the wrist never opens a gap between two tubes
    add(ball(X(0.06), 8, 6), K.coat, fo, xf(x, D.elbow, 0), 'sleeve' + n);
    add(ball(0.038, 7, 5), skinC, 'hand' + n, xf(x, D.wrist, 0), 'fore' + n);
    // the hand: palm, four fingers that curl at two joints, a thumb
    const hand = 'hand' + n, Wy = D.wrist, Ky = D.knuckle;
    add(loft([ring(Wy + 0.005, 0.02 * hs, 0.027 * hs, 6, x), ring(Wy - 0.04 * hs, 0.0165 * hs, 0.043 * hs, 6, x), ring(Ky - 0.002, 0.015 * hs, 0.044 * hs, 6, x)], 'start'), skinC, hand, null, 'palm' + n);
    add(ball(1, 8, 6), skinC, hand, xf(x, Ky, 0, 0, 0, 0, 0.0165 * hs, 0.0165 * hs, 0.046 * hs), 'palm' + n);   // the knuckles: a roll the fingers fold over
    { const L = 0.088 * hs, mid = Ky - L * 0.48;   // the finger block: a flat wedge, widest at the knuckles, that folds at two joints
      add(loft([ring(Ky + 0.002, 0.0145 * hs, 0.043 * hs, 6, x), ring(mid + 0.004, 0.013 * hs, 0.04 * hs, 6, x), ring(mid - 0.004, 0.0125 * hs, 0.039 * hs, 6, x), ring(Ky - L + 0.004, 0.0095 * hs, 0.03 * hs, 6, x, 0.006 * hs)], 'end'),
        (p) => shade(K.skin, p.y < mid ? 0.93 : 0.97), (p) => ['fa' + n, 'fb' + n, smooth(mid - 0.008, mid + 0.008, p.y)], null, 'fingers' + n);
      add(box(0.004, 0.05 * hs, 0.078 * hs), shade(K.skin, 0.86), 'fa' + n, xf(x + s * 0.015 * hs, Ky - 0.03 * hs, 0.002), 'fingers' + n);   // a crease line between the fingers' back and the palm
    }
    add(tube([V(x, Wy - 0.02 * hs, 0.026 * hs), V(x, Wy - 0.055 * hs, 0.052 * hs), V(x, Wy - 0.092 * hs, 0.062 * hs)], (t) => lerp(0.0125, 0.009, t) * hs, 5, 'end'), skinC, 'th' + n, null, 'thumb' + n);   // its root is open: the ball below closes it
    add(ball(0.015 * hs, 7, 5), skinC, 'th' + n, xf(x, Wy - 0.02 * hs, 0.026 * hs), 'thumb' + n);   // the thumb's root, inside the palm
  }
  // neck and head: a nose plane and nothing else
  add(tube([V(0, Y(1.345), 0.004), V(0, D.head + 0.03, 0.008)], 0.046 * (0.6 + 0.4 * wk), 8), skinC, blendY('chest', 'head', D.neck, D.head + 0.02), null, 'neck');
  const hk = 1 + (k - 1) * 0.35, HC = D.headC;
  // the skull: an egg with a flatter back and a longer jaw, then the planes a face is made of
  add(lathe([[0, -0.125], [0.042, -0.118], [0.072, -0.085], [0.09, -0.03], [0.096, 0.03], [0.088, 0.085], [0.052, 0.12], [0, 0.128]], 12, true), skinC, 'head', xf(0, HC, 0.006, 0, 0, 0, hk, hk, hk * 1.1), 'head');
  // the forms a face is made of, all of them solid, none painted on: a brow ridge, two eyes set under it with a
  // heavy upper lid (it is four in the morning), the nose, a mouth that is a short dark seam, the jaw, ears.
  // At play scale the eyes are the two dots that say where someone is looking; close in, the lid says how tired.
  // Round five: the face has to read in the reading close-up and still say something at play size, so every feature
  // is a value step away from the skin: a pale eye with a dark iris in it, a dark brow above each eye (the brows carry
  // the expression at a distance), a shadow under the nose, a mouth a clear step darker than the lip around it.
  const hairC = S.hair || 'joHair', white = mix('paper', K.skin, 0.32), irisC = mix('joHair', K.skin, 0.12), lidC = shade(K.skin, 0.84), lid = S.tired || 0;
  const ez = (x) => 0.006 + 1.034 * hk * Math.sqrt(Math.max(0, 0.0094 - x * x / (hk * hk)));
  add(ball(1, 9, 5), shade(K.skin, 0.98), 'head', xf(0, HC + 0.03, 0.082 * hk, -0.2, 0, 0, 0.074 * hk, 0.017, 0.028), 'head');          // the brow ridge
  // Round six: the eyes are bigger than life (a drawn face, read from across a roof), set a little further round the
  // skull so they still show in profile, and each is framed: a dark lash line along the top edge, a skin lid over it,
  // a soft lower lid, a dark iris with a point of light in it. The brows are fuller. The mouth is a soft closed line
  // with its corners turned up a hair, a lip colour, not a slot.
  for (const s of [-1, 1]) {
    const ex = s * 0.037 * hk, z = ez(0.037 * hk) - 0.002, ry = s * 0.42;
    add(ball(1, 10, 6), white, 'head', xf(ex, HC + 0.002, z, 0, ry, 0, 0.0195 * hk, 0.0112, 0.0068), 'eye');                            // the eye: pale, an almond
    add(ball(1, 9, 6), irisC, 'head', xf(ex - s * 0.0016, HC + 0.0004, z + 0.0042, 0, ry, 0, 0.0088 * hk, 0.0094, 0.0042), 'iris');      // the iris, dark, nearly round
    add(ball(1, 5, 4), white, 'head', xf(ex - s * 0.0034, HC + 0.0036, z + 0.0078, 0, ry, 0, 0.0026, 0.0026, 0.0012), 'glint');          // a point of light in it
    add(ball(1, 9, 5), hairC, 'head', xf(ex, HC + 0.0098 - 0.0016 * lid, z + 0.0022, 0.2, ry, s * -0.06, 0.0206 * hk, 0.0028, 0.0064), 'lash');   // the lash line: the dark edge that says eye at a distance
    add(ball(1, 9, 5), lidC, 'head', xf(ex, HC + 0.0128 - 0.0018 * lid, z + 0.0006, 0.25, ry, 0, 0.0206 * hk, 0.0048 + 0.0016 * lid, 0.0068), 'lid');   // the upper lid: heavier when tired, never shut
    add(ball(1, 8, 4), shade(K.skin, 0.9), 'head', xf(ex, HC - 0.0102, z + 0.0004, -0.2, ry, 0, 0.018 * hk, 0.0026, 0.0058), 'lid');       // the lower lid
    add(ball(1, 8, 5), hairC, 'head', xf(s * 0.039 * hk, HC + 0.027 + 0.003 * lid, 0.1 * hk + 0.005, -0.15, s * 0.36, s * (0.1 + 0.12 * lid), 0.024 * hk, 0.0072, 0.007), 'brow');   // the brow, fuller; its inner end a little raised when tired
  }
  add(extrude([[0, 0.036], [0, -0.03], [0.044, -0.022]], 0.028), shade(K.skin, 0.92), 'head', xf(0, HC - 0.014, 0.1 * hk, 0, -Math.PI / 2, 0), 'head');  // the nose
  add(ball(1, 7, 4), shade(K.skin, 0.58), 'head', xf(0, HC - 0.046, 0.1 * hk + 0.012, 0, 0, 0, 0.016 * hk, 0.0045, 0.008), 'head');      // the shadow under the nose
  const lipC = mix(K.skin, 'tamCap', 0.28), seam = mix(K.skin, 'joHair', 0.82);
  add(ball(1, 9, 5), lipC, 'head', xf(0, HC - 0.0655, 0.0868 * hk, 0, 0, 0, 0.026 * hk, 0.0078, 0.0062), 'head');                         // the lips, a soft warm shape
  add(ball(1, 9, 4), seam, 'head', xf(0, HC - 0.0655, 0.0872 * hk + 0.0034, 0, 0, 0, 0.022 * hk, 0.0022, 0.004), 'mouth');                  // the mouth: a soft closed line
  for (const s of [-1, 1]) add(ball(1, 5, 4), seam, 'head', xf(s * 0.022 * hk, HC - 0.0638, 0.084 * hk + 0.003, 0, s * 0.5, s * 0.5, 0.0045, 0.002, 0.0035), 'mouth');   // its corners, turned up a hair
  add(ball(1, 8, 5), shade(K.skin, 1.06), 'head', xf(0, HC - 0.0765, 0.0835 * hk, 0, 0, 0, 0.018 * hk, 0.0055, 0.006), 'head');          // the lower lip's light, so the line has an edge under it
  add(loft([ring(HC - 0.1, 0.034 * hk, 0.03, 7, 0, 0.045 * hk), ring(HC - 0.07, 0.066 * hk, 0.055, 7, 0, 0.03 * hk), ring(HC - 0.035, 0.088 * hk, 0.08, 7, 0, 0.012 * hk)], 'start'), shade(K.skin, 0.95), 'head', null, 'head');   // the jaw
  for (const s of [-1, 1]) add(ball(0.022, 6, 5), shade(K.skin, 0.93), 'head', xf(s * 0.095 * hk, HC - 0.02, -0.012, 0, 0, 0, 0.6, 1.3, 1), 'head');   // the ears
  if (S.build) S.build({ add: (g, c, s, m, tag = 'head') => add(g, c, s, m, tag), D, Y, X, HC, hk, blendY });
  // ---- the skinned mesh --------------------------------------------------------------------------------------
  const nv = P.length / 3, P0 = new Float32Array(P), N0 = new Float32Array(N), geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(new Float32Array(nv * 3), 3), na = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
  pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('normal', na); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I);
  const mesh = new THREE.Mesh(geo, paint.lit()); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const root = new THREE.Group(); root.add(mesh);
  const M = new Float32Array(bones.length * 12);
  function skin() {
    for (const b of bones) { _m.makeRotationFromQuaternion(b.wq); const e = _m.elements, o = b.i * 12, bx = b.bind.x, by = b.bind.y, bz = b.bind.z;
      M[o] = e[0]; M[o + 1] = e[4]; M[o + 2] = e[8]; M[o + 3] = e[1]; M[o + 4] = e[5]; M[o + 5] = e[9]; M[o + 6] = e[2]; M[o + 7] = e[6]; M[o + 8] = e[10];
      M[o + 9] = b.wp.x - (e[0] * bx + e[4] * by + e[8] * bz); M[o + 10] = b.wp.y - (e[1] * bx + e[5] * by + e[9] * bz); M[o + 11] = b.wp.z - (e[2] * bx + e[6] * by + e[10] * bz); }
    const po = pa.array, no = na.array;
    for (let i = 0; i < nv; i++) {
      const j = i * 3, x = P0[j], y = P0[j + 1], z = P0[j + 2], nx = N0[j], ny = N0[j + 1], nz = N0[j + 2], a = BI[i * 2] * 12, w = W[i];
      let px = M[a] * x + M[a + 1] * y + M[a + 2] * z + M[a + 9], py = M[a + 3] * x + M[a + 4] * y + M[a + 5] * z + M[a + 10], pz = M[a + 6] * x + M[a + 7] * y + M[a + 8] * z + M[a + 11];
      let qx = M[a] * nx + M[a + 1] * ny + M[a + 2] * nz, qy = M[a + 3] * nx + M[a + 4] * ny + M[a + 5] * nz, qz = M[a + 6] * nx + M[a + 7] * ny + M[a + 8] * nz;
      if (w < 0.999) { const b = BI[i * 2 + 1] * 12, u = 1 - w;
        px = px * w + (M[b] * x + M[b + 1] * y + M[b + 2] * z + M[b + 9]) * u; py = py * w + (M[b + 3] * x + M[b + 4] * y + M[b + 5] * z + M[b + 10]) * u; pz = pz * w + (M[b + 6] * x + M[b + 7] * y + M[b + 8] * z + M[b + 11]) * u;
        qx = qx * w + (M[b] * nx + M[b + 1] * ny + M[b + 2] * nz) * u; qy = qy * w + (M[b + 3] * nx + M[b + 4] * ny + M[b + 5] * nz) * u; qz = qz * w + (M[b + 6] * nx + M[b + 7] * ny + M[b + 8] * nz) * u;
        const l = Math.hypot(qx, qy, qz) || 1; qx /= l; qy /= l; qz /= l; }
      po[j] = px; po[j + 1] = py; po[j + 2] = pz; no[j] = qx; no[j + 1] = qy; no[j + 2] = qz;
    }
    pa.needsUpdate = true; na.needsUpdate = true;
  }
  // ---- the pose: channels, all in figure space ------------------------------------------------------------------
  const rest = () => ({
    hipX: 0, hipY: 0, hipZ: 0, pelRX: 0, pelRY: 0, pelRZ: 0, spRX: 0, spRY: 0, spRZ: 0, chRX: 0, chRY: 0, chRZ: 0, nkRX: 0, nkRY: 0, hdRX: 0, hdRY: 0, hdRZ: 0,
    aLx: D.sw + 0.035, aLy: D.wrist + 0.012, aLz: 0.035, aRx: -D.sw - 0.035, aRy: D.wrist + 0.012, aRz: 0.035,
    pLx: 0.35, pLy: -0.1, pLz: -1, pRx: -0.35, pRy: -0.1, pRz: -1,
    hLm: 0, hLaz: 0, hLtilt: 0, hLroll: 0, hRm: 0, hRaz: 0, hRtilt: 0, hRroll: 0, curlL: 0.35, curlR: 0.35, thL: 0.2, thR: 0.2,
    fLx: D.hw + 0.01, fLy: 0, fLz: 0, fLp: 0, fRx: -D.hw - 0.01, fRy: 0, fRz: 0, fRp: 0, toe: 0.14,
  });
  const cur = rest();
  const blend = (a, b, t) => { for (const key in a) a[key] += (b[key] - a[key]) * t; return a; };
  function ik(S0, T0, a, b, pole, outE, outW) {
    _a.subVectors(T0, S0); const L = _a.length() || 1e-4, Lc = clamp(L, Math.abs(a - b) + 0.004, a + b - 0.004); _a.multiplyScalar(1 / L);
    const ca = clamp((a * a + Lc * Lc - b * b) / (2 * a * Lc), -1, 1), sa = Math.sqrt(1 - ca * ca);
    _b.copy(pole).addScaledVector(_a, -pole.dot(_a)); if (_b.lengthSq() < 1e-6) _b.set(0, 0, -1).addScaledVector(_a, _a.z); _b.normalize();
    outE.copy(S0).addScaledVector(_a, a * ca).addScaledVector(_b, a * sa); outW.copy(S0).addScaledVector(_a, Lc);
  }
  const E = new THREE.Vector3(), Wp = new THREE.Vector3(), Sp = new THREE.Vector3(), Tg = new THREE.Vector3(), pole = new THREE.Vector3(), qLevel = quat(-Math.PI / 2, 0, 0);
  function solve(p) {
    const b = byName;
    // spine chain
    b.pelvis.wp.set(p.hipX, D.pelvis + p.hipY, p.hipZ); quat(p.pelRX, p.pelRY, p.pelRZ, b.pelvis.wq);
    const chain = [['spine', p.spRX, p.spRY, p.spRZ], ['chest', p.chRX, p.chRY, p.chRZ], ['neck', p.nkRX, p.nkRY, 0], ['head', p.hdRX, p.hdRY, p.hdRZ]];
    for (const [n, rx, ry, rz] of chain) { const o = b[n], pr = o.parent; o.wq.copy(pr.wq).multiply(quat(rx, ry, rz, _q)); o.wp.copy(_a.subVectors(o.bind, pr.bind).applyQuaternion(pr.wq)).add(pr.wp); }
    for (const [n, s] of [['L', 1], ['R', -1]]) {
      // arm
      const up = b['arm' + n], fo = b['fore' + n], ha = b['hand' + n], ch = b.chest;
      Sp.copy(_c.subVectors(up.bind, ch.bind).applyQuaternion(ch.wq)).add(ch.wp); Tg.set(p['a' + n + 'x'], p['a' + n + 'y'], p['a' + n + 'z']); pole.set(p['p' + n + 'x'], p['p' + n + 'y'], p['p' + n + 'z']);
      ik(Sp, Tg, D.ua, D.fa, pole, E, Wp);
      up.wp.copy(Sp); up.wq.setFromUnitVectors(DOWN, _c.subVectors(E, Sp).normalize()); fo.wp.copy(E); fo.wq.setFromUnitVectors(DOWN, _c.subVectors(Wp, E).normalize());
      ha.wp.copy(Wp); quat(p['h' + n + 'tilt'], p['h' + n + 'az'], p['h' + n + 'roll'], _q2).multiply(qLevel); ha.wq.copy(fo.wq).slerp(_q2, clamp(p['h' + n + 'm']));
      const curl = p['curl' + n], fa = b['fa' + n], fb = b['fb' + n], th = b['th' + n];
      fa.wq.copy(ha.wq).multiply(quat(0, 0, -s * curl * 1.25, _q)); fa.wp.copy(_c.subVectors(fa.bind, ha.bind).applyQuaternion(ha.wq)).add(ha.wp);
      fb.wq.copy(fa.wq).multiply(quat(0, 0, -s * curl * 1.5, _q)); fb.wp.copy(_c.subVectors(fb.bind, fa.bind).applyQuaternion(fa.wq)).add(fa.wp);
      th.wq.copy(ha.wq).multiply(quat(-0.25, 0, -s * (0.25 + p['th' + n]), _q)); th.wp.copy(_c.subVectors(th.bind, ha.bind).applyQuaternion(ha.wq)).add(ha.wp);
      // leg
      const lg = b['leg' + n], sh = b['shin' + n], ft = b['foot' + n], pe = b.pelvis, pitch = p['f' + n + 'p'];
      Sp.copy(_c.subVectors(lg.bind, pe.bind).applyQuaternion(pe.wq)).add(pe.wp); Tg.set(p['f' + n + 'x'], p['f' + n + 'y'] + D.ankle * Math.cos(pitch) + 0.05 * Math.sin(Math.max(0, pitch)), p['f' + n + 'z'] - D.ankle * Math.sin(pitch) * 0.6);
      pole.set(s * 0.12, 0.05, 1); ik(Sp, Tg, D.thigh, D.shin, pole, E, Wp);
      lg.wp.copy(Sp); lg.wq.setFromUnitVectors(DOWN, _c.subVectors(E, Sp).normalize()); sh.wp.copy(E); sh.wq.setFromUnitVectors(DOWN, _c.subVectors(Wp, E).normalize());
      ft.wp.copy(Wp); quat(pitch, s * p.toe, 0, ft.wq);
    }
    skin();
  }
  const rootM = new THREE.Matrix4();
  return {
    root, mesh, D, bones: byName, boneList: bones, parts, bind: P0, rest, blend, cur, solve,
    place(x, y, z, heading) { root.position.set(x, y, z); root.rotation.y = heading; root.updateMatrixWorld(true); rootM.copy(root.matrixWorld); },
    toFigure(w, out) { return out.copy(w).applyMatrix4(_m.copy(rootM).invert()); },
    toWorld(f, out) { return out.copy(f).applyMatrix4(rootM); },
    // world matrix of a bone, with an optional local offset matrix (for things held in a hand)
    boneMatrix(name, out, local) { const bo = byName[name]; out.compose(bo.wp, bo.wq, _one).premultiply(rootM); if (local) out.multiply(local); return out; },
    rootMatrix: rootM,
  };
}
void _d; void box;

// ---- gaits (shared by both people) ------------------------------------------------------------------------------
import { RUN, RISE, STAIR_X } from './hatch.js';
const fract = (x) => x - Math.floor(x);
// Flat ground. Phase comes from distance walked, so a planted foot stays where it was put.
export function walkGait(p, D, walked, stepLen, amt = 1, swing = 1) {
  const cyc = walked / (2 * stepLen), st = 0.54, half = stepLen * st * 0.92;
  for (const [n, off] of [['L', 0], ['R', 0.5]]) {
    const u = fract(cyc + off); let z, y = 0, pitch = 0;
    if (u < st) { const s = u / st; z = half - s * 2 * half; pitch = smooth(0.62, 1, s) * 0.55 - (1 - smooth(0, 0.18, s)) * 0.3; }
    else { const s = (u - st) / (1 - st), e = s * s * (3 - 2 * s); z = -half + e * 2 * half; y = Math.sin(Math.PI * s) * 0.075 + 0.02 * (1 - s); pitch = 0.55 * (1 - e) - 0.3 * e; }
    p['f' + n + 'z'] += (z - p['f' + n + 'z']) * amt; p['f' + n + 'y'] += y * amt; p['f' + n + 'p'] += pitch * amt;
  }
  const a = cyc * Math.PI * 2;
  p.hipY += (-0.055 + 0.022 * Math.cos(a * 2)) * amt; p.hipX += Math.sin(a) * 0.014 * amt; p.pelRY += Math.sin(a) * 0.1 * amt; p.pelRZ += Math.sin(a) * 0.03 * amt;
  p.chRY -= Math.sin(a) * 0.09 * amt; p.spRX += 0.045 * amt;
  p.aLz += Math.sin(a) * 0.17 * amt * swing; p.aLy += 0.02 * amt * swing; p.aRz -= Math.sin(a) * 0.17 * amt * swing;
}
// The stairs. Feet go on real treads: each foot holds its tread until the body has passed, then swings to the next but one.
export function stairGait(p, fig, worldX, facing) {
  const phi = (STAIR_X - worldX) / RUN, D = fig.D, w = new THREE.Vector3();
  let k = 0;
  for (const [n, f] of [['L', 0], ['R', 1]]) {
    const v = (phi - f) / 2 + 0.25, s = smooth(0.5, 1, fract(v)), q = f + 2 * (Math.floor(v) + s);
    w.set(STAIR_X - q * RUN, -RISE * clamp(q, 0, 13) + Math.sin(Math.PI * s) * 0.075 - fig.root.position.y, 0);
    const fz = (w.x - fig.root.position.x) * facing;        // figure faces +x (facing 1) or -x (facing -1)
    p['f' + n + 'z'] = fz + 0.02; p['f' + n + 'y'] = w.y; p['f' + n + 'p'] = Math.sin(Math.PI * s) * 0.3; k += s;
  }
  p.hipY -= 0.05; p.toe = 0.06; void D; void k;
}
