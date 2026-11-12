// OWNER: B (world). Jo: 1.62 m, a wide straw hat (the silhouette), a plait, an ochre jacket with rolled sleeves,
// teal trousers, bare ankles, slippers, and the copper cup, which never leaves her hand. All her poses.
import * as THREE from 'three';
import { Batch, paint, xf, col, mix, shade, tube, V, ball, lathe, clamp, lerp, smooth, follow } from './kit.js';
import { createFigure, walkGait, stairGait } from './figure.js';
import { CUP, makeCup } from './barrel.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _u2 = new THREE.Vector3();
const STEP = 0.66;

export function createJo() {
  let hatLocal = null;
  const fig = createFigure({ k: 1, wk: 1, coat: 'short', sleeves: 'rolled', bareAnkles: true,
    colours: { coat: 'joJacket', trousers: 'joTrousers', skin: 'joSkin', shoe: mix('cedar', 'pot', 0.45) },
    build({ add, D, Y, HC, blendY }) {
      // the hair: a cap over the crown and back of the skull, its front edge a hairline high on the forehead (never
      // over the face). No fringe: tipped down over a book it read as a dark band across her eyes
      add(ball(0.114, 10, 8), 'joHair', 'head', xf(0, HC + 0.036, -0.03, -0.3, 0, 0, 1.0, 0.98, 1.06), 'hair');
      // the crown: a shell on the skull's own curve, its front edge a hairline across the top of the forehead
      add(lathe([[0.094, 0.066], [0.091, 0.088], [0.055, 0.124], [0, 0.131]], 12, true), 'joHair', 'head', xf(0, HC, 0.006, 0, 0, 0, 1.05, 1.04, 1.155), 'hair');
      // the plait
      add(tube([V(0, HC - 0.07, -0.105), V(0, Y(1.33), -0.135), V(0, Y(1.2), -0.14), V(0, Y(1.09), -0.133), V(0, Y(1.05), -0.128)], (t) => 0.034 * (1 - 0.4 * t) * (1 + 0.2 * Math.sin(t * 15.7)), 6), 'joHair', blendY('chest', 'head', Y(1.33), Y(1.42)));
      add(tube([V(0, Y(1.075), -0.131), V(0, Y(1.055), -0.129)], 0.026, 6), 'joJacket', 'chest');
      hatLocal = xf(0, HC + 0.082 - D.head, -0.012, -0.1, 0, 0);   // where the hat sits on the head bone
    } });
  // the hat: wide brim, low crown, a band. Its own mesh, carried on the head bone, because the night after she takes it off.
  const hat = (() => { const b = new Batch();
    b.add(lathe([[0, -0.004], [0.1, -0.004], [0.335, -0.05], [0.342, -0.04], [0.114, 0.012], [0.106, 0.092], [0.09, 0.106], [0, 0.108]], 18), (p, n) => n.y < -0.25 ? shade('joHat', 0.7) : col('joHat'));
    b.add(lathe([[0.108, 0.014], [0.12, 0.014], [0.114, 0.046], [0.106, 0.046]], 18), mix('tray', 'joJacket', 0.3));
    const m = b.mesh(paint.lit2()); m.matrixAutoUpdate = false; m.frustumCulled = false; return m; })();
  let hatK = 0;   // 0 on her head .. 1 on the kerb
  const cup = makeCup(); cup.matrixAutoUpdate = false;
  const D = fig.D, hs = D.hs, c0 = new THREE.Vector3(0, -(0.07 * hs + 0.1), -0.07), cupLocal = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(c0);
  const group = new THREE.Group(); group.add(fig.root, cup, hat);
  const hatHead = new THREE.Matrix4(), hatRest = new THREE.Matrix4(), hatMid = new THREE.Matrix4(), _p = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _s = new THREE.Vector3();
  const lipLocal = new THREE.Vector3(0, CUP.h, CUP.r), lip = new THREE.Vector3(), M = new THREE.Matrix4();
  let heading = 0, shown = false;
  const qLevel = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  // put the cup (its lip, or its base) at a point in figure space with a heading and a tip; solve the wrist from it
  function holdCup(p, pt, az, tilt, atLip) {
    _q.setFromEuler(_e.set(tilt, az, 0, 'YXZ'));                    // cup orientation
    _v.copy(pt); if (atLip) _v.sub(_w.copy(lipLocal).applyQuaternion(_q));   // cup base
    _q2.copy(_q).multiply(qLevel); _v.sub(_w.copy(c0).applyQuaternion(_q2));  // wrist
    p.aRx = _v.x; p.aRy = _v.y; p.aRz = _v.z; p.hRm = 1; p.hRaz = az; p.hRtilt = tilt; p.curlR = 1.05; p.thR = 0.7;
    p.pRx = -0.5; p.pRy = -0.75; p.pRz = -0.6;
  }
  const F = (w, out) => fig.toFigure(w, out);
  const carry = (p, t, calm) => { holdCup(p, _u.set(-0.2, 0.985 + (calm ? 0 : Math.sin(t * 1.05) * 0.004), 0.25), 0.18, 0, false); };

  function pose(state, env, t) {
    const J = state.jo, p = fig.rest(), u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0, calm = state.reducedMotion, act = J.action;
    // standing breath, a little weight on one leg, chin down under the brim
    const br = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.05);
    p.chRX = -0.02 * br; p.hipX = 0.012; p.pelRZ = 0.02; p.nkRX = 0.07; p.aLy += 0.004 * br;
    if (env.carryBook) { p.aRx = -D.sw - 0.05; p.aRy = D.wrist + 0.03; p.aRz = 0.06; p.hRm = 1; p.hRaz = 0; p.hRtilt = 0; p.hRroll = 0; p.curlR = 1.0; p.thR = 0.6; }
    else carry(p, t, calm);
    if (act === 'walk') walkGait(p, D, J.walked || 0, STEP, 1, 1);
    else if (act === 'carry') walkGait(p, D, J.walked || 0, STEP, 0.85, 0);
    else if (act === 'climb' || act === 'descend') {
      stairGait(p, fig, J.pos.x, act === 'climb' ? 1 : -1); p.spRX += act === 'climb' ? 0.17 : 0.05; p.nkRX += act === 'climb' ? -0.1 : 0.2;
      const a = (J.pos.x / 0.2231) * Math.PI; p.aLz += Math.sin(a) * 0.1; p.hipX = Math.sin(a) * 0.012; p.chRY = Math.sin(a) * 0.06;
      if (!env.carryBook) holdCup(p, _u.set(-0.19, 1.03, 0.24), 0.2, 0, false);
    } else if (act === 'pour' || act === 'pourEmpty') {
      const i = +String(J.target || 'p0').slice(1) || 0, s = F(env.soil(i, _v), new THREE.Vector3()), dh = Math.hypot(s.x, s.z), az = Math.atan2(s.x, s.z), empty = act === 'pourEmpty';
      // the cup is held high and well back from the pot, so the water has a long way to fall: a bold arc, not a dribble
      // the cup goes out at arm's length and a little below the shoulder, well clear of her face, so the water
      // falls in the open beside her and lands where everyone can see it
      const back = empty ? 0.14 : 0.3, lh = Math.max(0.5, Math.min(dh - back, 0.64)), ly = s.y + (empty ? 0.28 : 0.5) + Math.max(0, dh - back - lh) * 0.3;
      const e = smooth(0, 0.14, u) * (1 - smooth(0.88, 1, u)), tip = (empty ? 1.75 : 1.25) * smooth(0.07, 0.17, u) * (1 - smooth(0.82, 0.92, u));
      const far = clamp((lh - 0.5) / 0.2), q = fig.rest();
      // she stays upright and only tips her head to watch: a lean would put her face over the cup
      q.spRX = 0.08 + 0.14 * far; q.chRX = 0.06 + 0.1 * far; q.hipZ = -0.03 - 0.05 * far; q.hipY = -0.02 - 0.03 * far; q.spRY = az * 0.3; q.chRY = az * 0.15;
      q.nkRX = 0.22; q.hdRY = az * 0.55; q.hdRZ = -0.1; q.hipX = 0;
      q.aLx = D.sw + 0.1; q.aLy = D.wrist + 0.16; q.aLz = 0.02; q.curlL = 0.6;   // the other hand rests at her hip
      holdCup(q, _u.set(Math.sin(az) * lh, ly, Math.cos(az) * lh), az, tip, true);
      fig.blend(p, q, e);
    } else if (act === 'scoop' && J.target !== 'valve') {
      const B = env.barrel, rimY = B.rim.y, P1 = F(_v.set(B.centre.x - 0.03, rimY + 0.24, B.centre.z + 0.03), new THREE.Vector3()), P2 = F(_v.set(B.centre.x - 0.03, Math.max(B.waterY() - 0.07, rimY - 0.08), B.centre.z + 0.03), new THREE.Vector3());   // the cup goes down the middle of the opening, so her hand is well inside the lip and the arm passes over the rim
      const P0 = new THREE.Vector3(-0.2, 0.985, 0.25), Pu = new THREE.Vector3(P0.x, P1.y, P0.z);   // up first, then in over the lip; out the same way
      const c = P0.clone().lerp(Pu, smooth(0, 0.14, u)).lerp(P1, smooth(0.1, 0.28, u)).lerp(P2, smooth(0.3, 0.5, u)).lerp(P1, smooth(0.6, 0.76, u)).lerp(Pu, smooth(0.74, 0.88, u)).lerp(P0, smooth(0.86, 1, u));
      c.y += 0.07 * smooth(0.48, 0.58, u) * (1 - smooth(0.7, 0.8, u));   // as the full cup levels, it lifts, so the forearm rides over the lip
      const e = smooth(0, 0.25, u) * (1 - smooth(0.8, 1, u)), dip = smooth(0.3, 0.46, u) * (1 - smooth(0.52, 0.66, u)), az = Math.atan2(P1.x, P1.z);
      p.hipY += 0.05 * e; p.fLp = p.fRp = 0.5 * e; p.spRX = 0.22 * e; p.chRX = 0.14 * e; p.nkRX = 0.07 + 0.25 * e; p.hdRY = az * 0.4 * e; p.spRY = az * 0.3 * e; p.hipZ = 0.08 * e;   // she leans over the barrel
      p.aLx = D.sw + 0.05; p.aLy = D.wrist + 0.05 + 0.2 * e; p.aLz = 0.06 * e;   // the other hand comes up toward the staves to steady her, a hand's width off them
      holdCup(p, c, az * e + 0.18 * (1 - e), 0.75 * dip, false); p.pRy = lerp(-0.75, 1.2, e); p.pRx = -0.6;   // the elbow stays up over the barrel
    } else if (act === 'scoop') {   // at Marlow's tap: down on her heels, cup under the spout, the other hand on the lever
      const e = smooth(0, 0.2, u) * (1 - smooth(0.84, 1, u)), sp = F(env.spout, new THREE.Vector3()), q = fig.rest();
      q.hipY = -0.36; q.hipZ = -0.14; q.pelRX = 0.4; q.spRX = 0.12; q.chRX = 0.18; q.nkRX = 0.1; q.fLp = q.fRp = 0.35; q.hipX = 0;
      holdCup(q, _u.set(sp.x, sp.y - 0.19, sp.z), 0, 0, false);
      q.aLx = D.hw + 0.04; q.aLy = 0.6; q.aLz = 0.3; q.curlL = 0.5; q.pLx = 1; q.pLy = 0.1; q.pLz = 0.2;   // the tap is open; the other hand rests on her knee while the cup fills
      fig.blend(p, q, e);
    } else if (act === 'sit' && J.seat === 'chair') {
      // in the folding chair: seat at 0.48, feet flat on the deck, upright enough to hold a book up to the light.
      // sitK runs 0..1 while she lowers herself and backs the last step onto the seat.
      const q = fig.rest(), k = J.sitK == null ? 1 : J.sitK;
      q.hipY = 0.565 - D.pelvis; q.hipZ = -0.02; q.hipX = 0; q.pelRX = -0.1; q.spRX = 0.1; q.chRX = 0.08; q.nkRX = 0.05;
      q.fLx = D.hw + 0.06; q.fRx = -D.hw - 0.06; q.fLz = 0.44; q.fRz = 0.46; q.toe = 0.18;
      q.aRx = -0.16; q.aRy = 0.62; q.aRz = 0.4; q.pRx = -1; q.pRy = 0.1; q.pRz = 0.2; q.curlR = 0.5;
      q.aLx = 0.16; q.aLy = 0.62; q.aLz = 0.4; q.pLx = 1; q.pLy = 0.1; q.pLz = 0.2; q.curlL = 0.5;
      if (env.carryBook) { q.aRx = -0.15; q.aRy = 0.7; q.aRz = 0.36; q.hRm = 1; q.hRaz = 0; q.hRtilt = 0; q.curlR = 1.0; }
      // as she sits she bends at the hip and knee together, a hand back toward the seat
      const mid = Math.sin(Math.PI * k);
      fig.blend(p, q, smooth(0, 1, k)); p.spRX += 0.3 * mid; p.chRX += 0.1 * mid;
    } else if (act === 'sit') {
      p.hipY = 0.235 - D.pelvis; p.hipZ = -0.03; p.hipX = 0; p.pelRZ = 0; p.pelRX = -0.12; p.spRX = 0.3; p.chRX = 0.26; p.nkRX = -0.05; p.hdRX = 0.0;
      p.fLx = D.hw + 0.05; p.fRx = -D.hw - 0.05; p.fLz = 0.4; p.fRz = 0.44; p.toe = 0.2;
      if (J.noCup) { p.aRx = -0.15; p.aRy = 0.47; p.aRz = 0.44; p.pRx = -1; p.pRy = 0.1; p.pRz = 0.2; p.curlR = 0.5; }   // no cup tonight: the hand rests on the knee
      else { holdCup(p, _u.set(-0.1, 0.5, 0.42), 0.3, 0, false); p.pRx = -1; p.pRy = 0.1; p.pRz = 0.2; }
      p.aLx = 0.15; p.aLy = 0.47; p.aLz = 0.44; p.pLx = 1; p.pLy = 0.1; p.pLz = 0.2; p.curlL = 0.5;
    }
    // the hat coming off: the right hand goes up to the crown, brings it down to the kerb, and lets go
    if (hatK > 0.02 && hatK < 0.98) {
      const k = smooth(0, 0.12, hatK) * (1 - smooth(0.9, 1, hatK)), h = F(_p.setFromMatrixPosition(hat.matrix), new THREE.Vector3());
      p.aRx = lerp(p.aRx, h.x + 0.1, k); p.aRy = lerp(p.aRy, h.y + 0.04, k); p.aRz = lerp(p.aRz, h.z + 0.05, k);
      p.hRm = lerp(p.hRm, 1, k); p.hRtilt = lerp(p.hRtilt, 0.3, k); p.curlR = lerp(p.curlR, 0.8, k); p.pRx = -0.6; p.pRy = -0.6; p.pRz = 0.4;
      p.nkRX += 0.1 * k;
    }
    // reading: both hands hold the book's edges, the head tips to the page; the right hand lifts across to turn one
    if (env.bookHands && act === 'sit') {
      const k = env.bookHands.k, pg = env.bookHands.page || 0, L = F(env.bookHands.L, new THREE.Vector3()), R = F(env.bookHands.R, _v);
      R.lerp(_w.set(L.x - 0.02, L.y + 0.09, L.z + 0.02), pg);
      for (const [n, g, t] of [['L', L, 0.35], ['R', R, 0.35 - 0.6 * pg]]) {
        p['a' + n + 'x'] = lerp(p['a' + n + 'x'], g.x, k); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], g.y, k); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], g.z, k);
        p['h' + n + 'm'] = lerp(p['h' + n + 'm'], 1, k); p['h' + n + 'az'] = lerp(p['h' + n + 'az'], 0, k); p['h' + n + 'tilt'] = lerp(p['h' + n + 'tilt'], t, k); p['curl' + n] = lerp(p['curl' + n], 0.55, k);
      }
      p.pLx = 0.25; p.pRx = -0.25; p.pLy = p.pRy = -1; p.pLz = p.pRz = 0.15;   // elbows down at her sides, not out like wings
      // she sits up out of the watering hunch and the book comes up to her: the head tips only a little and the eyes do
      // the rest, so her face stays open to the stair light (tipped further, the crown and the hairline are all you see)
      p.spRX -= 0.14 * k; p.chRX -= 0.12 * k; p.nkRX += 0.16 * k; p.hdRX += 0.1 * k; p.hdRY += 0.05 * k;
      // a while into it she looks up from the page, out toward the paling sky, and then back down
      const up = (J.lookUp || 0) * k; p.nkRX -= 0.34 * up; p.hdRX -= 0.24 * up; p.hdRY += 0.18 * up; p.chRX -= 0.04 * up;
      // the one gesture: her right hand leaves the page and goes out to a leaf of the basil in front of her, and rests there
      if (env.leaf && J.leaf > 0.001) {
        const lf = J.leaf, g = F(env.leaf, _u2), az = Math.atan2(g.x, g.z), gh = Math.hypot(g.x, g.z) || 1;
        g.x -= (g.x / gh) * 0.055; g.z -= (g.z / gh) * 0.055; g.y += 0.02;   // the wrist stops short, so the palm and fingers lie on the leaf
        p.spRX += 0.5 * lf; p.chRX += 0.16 * lf; p.spRY += az * 0.25 * lf; p.chRY += az * 0.15 * lf; p.nkRX += 0.08 * lf; p.hdRY += az * 0.45 * lf;
        p.aRx = lerp(p.aRx, g.x, lf); p.aRy = lerp(p.aRy, g.y + 0.012, lf); p.aRz = lerp(p.aRz, g.z, lf);
        p.hRm = lerp(p.hRm, 1, lf); p.hRaz = lerp(p.hRaz, az, lf); p.hRtilt = lerp(p.hRtilt, 0.55, lf); p.curlR = lerp(p.curlR, 0.25, lf); p.thR = lerp(p.thR || 0, 0.3, lf);
        p.pRx = lerp(p.pRx, -0.8, lf); p.pRy = lerp(p.pRy, -0.6, lf); p.pRz = lerp(p.pRz, 0.2, lf);
      }
    } else if (act === 'plant') {
      const e = smooth(0, 0.22, u) * (1 - smooth(0.8, 1, u)), a = F(env.stakeCrate, new THREE.Vector3()), b = F(env.stakeBean, new THREE.Vector3());
      const h = a.clone().lerp(b, smooth(0.3, 0.5, u)); h.y += Math.sin(Math.PI * smooth(0.3, 0.5, u)) * 0.25 - 0.06 * smooth(0.5, 0.62, u) * (1 - smooth(0.62, 0.75, u));   // lifted clear of the plants on its way
      const reach = smooth(0.05, 0.24, u) * (1 - smooth(0.7, 0.86, u)), az = Math.atan2(h.x, h.z);
      p.spRX = 0.42 * e; p.chRX = 0.3 * e; p.hipZ = -0.1 * e; p.hipY = -0.07 * e; p.spRY = az * 0.4 * e; p.nkRX = 0.07 + 0.2 * e; p.hdRY = az * 0.4 * e;
      p.aLx = lerp(p.aLx, h.x, reach); p.aLy = lerp(p.aLy, h.y, reach); p.aLz = lerp(p.aLz, h.z - 0.03, reach); p.hLm = reach; p.hLaz = az; p.hLtilt = 0.5; p.curlL = lerp(0.35, 1.0, reach);
    }
    // the night after, by hand: down on her heels, the cup into the neighbour's bucket
    if (J.dip > 0.001 && env.bucketWater) {
      const b = F(env.bucketWater, new THREE.Vector3()), az = Math.atan2(b.x, b.z), q = fig.rest();
      q.hipY = -0.3; q.hipZ = -0.12; q.hipX = 0; q.pelRX = 0.4; q.spRX = 0.16; q.chRX = 0.22; q.nkRX = 0.32; q.fLp = q.fRp = 0.32; q.spRY = az * 0.3; q.hdRY = az * 0.4;
      q.aLx = D.sw + 0.1; q.aLy = D.wrist + 0.12; q.aLz = 0.12;
      holdCup(q, b, az, 0.7 * clamp(J.dip * 1.6), false); fig.blend(p, q, clamp(J.dip * 1.4));
    }
    // offered the tray: both hands come up toward it and wait a hand's width short of the rim, palms up
    if (env.trayReach) { const k = env.trayReach.k; for (const [n, g] of [['L', env.trayReach.L], ['R', env.trayReach.R]]) { F(g, _v); _v.z -= 0.1; _v.y -= 0.04; _v.x *= 0.9;
      p['a' + n + 'x'] = lerp(p['a' + n + 'x'], _v.x, k); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], _v.y, k); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], _v.z, k);
      p['h' + n + 'm'] = lerp(p['h' + n + 'm'], 1, k); p['h' + n + 'az'] = lerp(p['h' + n + 'az'], 0, k); p['h' + n + 'tilt'] = lerp(p['h' + n + 'tilt'], -0.2, k); p['curl' + n] = lerp(p['curl' + n], 0.3, k); }
      p.spRX += 0.16 * k; p.chRX += 0.1 * k; p.nkRX += 0.1 * k; }
    // the tray: both hands go where it is
    if (env.trayHands) { const k = env.trayHands.k; for (const [n, g] of [['L', env.trayHands.L], ['R', env.trayHands.R]]) { F(g, _v);
      p['a' + n + 'x'] = lerp(p['a' + n + 'x'], _v.x, k); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], _v.y, k); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], _v.z, k);
      p['h' + n + 'm'] = lerp(p['h' + n + 'm'], 1, k); p['h' + n + 'az'] = lerp(p['h' + n + 'az'], env.trayHands.az, k); p['h' + n + 'tilt'] = lerp(p['h' + n + 'tilt'], 0.15, k); p['curl' + n] = lerp(p['curl' + n], 0.95, k); }
      if (act === 'take') { p.spRX += 0.2 * k; p.chRX += 0.12 * k; p.nkRX += 0.15 * k; }
      if (act === 'carry') { p.spRX -= 0.05; p.nkRX += 0.12; }
      if (act === 'place') { const e = smooth(0, 0.4, u) * (1 - smooth(0.82, 1, u)); p.spRX += 0.55 * e; p.chRX += 0.45 * e; p.hipZ += 0.12 * e; p.hipY -= 0.08 * e; p.nkRX += 0.15 * e; } }
    // the night after, by hand, the last of it: the cup held out level between her and the neighbour, at the stair head
    if (J.offer > 0.001 && env.offerAt && act === 'idle') {
      const a = F(env.offerAt, new THREE.Vector3()), az = Math.atan2(a.x, a.z), q = fig.rest(), k = J.offer;
      q.spRX = 0.1; q.chRX = 0.06; q.nkRX = 0.12; q.hdRY = az * 0.3; q.spRY = az * 0.2;
      q.aLx = D.sw + 0.04; q.aLy = D.wrist + 0.03; q.aLz = 0.04;
      holdCup(q, a, az, 0, false); fig.blend(p, q, k);
    }
    // the choice: the cup held out, level, over the shelf. Not poured yet.
    if (state.beat === 'choice' && !state.ending && (act === 'idle')) {
      const a = F(env.cupAnchor, new THREE.Vector3()), dh = Math.hypot(a.x, a.z), az = Math.atan2(a.x, a.z), lh = Math.min(dh, 0.66), k = env.choiceK;
      const q = fig.rest(); q.spRX = 0.16; q.chRX = 0.12; q.spRY = az * 0.3; q.hdRY = az * 0.5; q.nkRX = 0.25; q.hipZ = -0.05;
      q.aLx = D.sw + 0.09; q.aLy = D.wrist + 0.05; q.aLz = -0.08;
      holdCup(q, _u.set(Math.sin(az) * lh, Math.max(a.y + 0.1, 0.93), Math.cos(az) * lh), az, 0.12, true); fig.blend(p, q, k);
    }
    return p;
  }
  return {
    group, fig, cup, hat, materials: [fig.mesh.material],
    lip(out) { return out.copy(lip); },
    handWorld(n, out) { fig.boneMatrix('hand' + n, M); return out.set(0, -0.07 * hs, 0).applyMatrix4(M); },
    frame(state, dt) {   // root first: other things (the tray) are placed from it before the pose is made
      const J = state.jo; let dh = J.heading - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading = shown && J.present ? heading + dh * (1 - Math.exp(-dt * 11)) : J.heading;
      fig.place(J.pos.x, J.y || 0, J.pos.z, heading);
    },
    update(state, env, dt, t) {
      const J = state.jo; group.visible = !!J.present;
      if (!J.present) { shown = false; return; }
      const target = pose(state, env, t);
      if (!shown) Object.assign(fig.cur, target); else fig.blend(fig.cur, target, 1 - Math.exp(-dt * 13));
      shown = true; fig.solve(fig.cur);
      fig.boneMatrix('handR', cup.matrix, cupLocal); cup.matrixWorldNeedsUpdate = true; cup.visible = J.cupHeld !== false;
      lip.copy(lipLocal).applyMatrix4(cup.matrix);
      // the hat: on her head, or (the night after, by sensor) lifted off and set on the kerb beside her, in an arc
      hatK = follow(hatK, J.hatOff && J.hatAt ? 1 : 0, dt, 1.15);   // slow: the one gesture that says she is not working tonight
      fig.boneMatrix('head', hatHead, hatLocal);
      if (hatK < 0.002 || !J.hatAt) hat.matrix.copy(hatHead);
      else {
        const A = J.hatAt; hatRest.compose(_p.set(A.x, A.y, A.z), _q3.setFromEuler(_e.set(0.06, A.ry || 0, 0.04)), _s.set(1, 1, 1));
        const k = smooth(0, 1, hatK); hatHead.decompose(_v, _q, _s); hatRest.decompose(_w, _q2, _s);
        _v.lerp(_w, k); _v.y += Math.sin(Math.PI * k) * 0.22; _q.slerp(_q2, k); hat.matrix.compose(_v, _q, _s.set(1, 1, 1));
      }
      hat.matrixWorldNeedsUpdate = true;
    },
  };
}
