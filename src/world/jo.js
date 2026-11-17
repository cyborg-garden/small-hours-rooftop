// OWNER: B (world). Jo: 1.62 m. A real rigged woman from the asset library (CREDITS.md) painted in the game's
// colours: ochre jacket, teal trousers, dark hair, and the wide straw hat that is her silhouette. Her walk, her sit
// and her kneel are real clips; her hands are put on the cup, the tray, the book and the leaf on top of them.
import * as THREE from 'three';
import { Batch, paint, col, mix, shade, lathe, clamp, lerp, smooth, follow } from './kit.js';
import { createPerson, clipDur, REAL } from './person.js';
import { stairGait, clipSpeed } from './gait.js';
import { CUP, makeCup } from './barrel.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _u2 = new THREE.Vector3();
export const SEAT_Y = 0.445;   // the seat height her sitting clip expects, at her size
export const SEAT_BACK = 0.29; // and how far behind her feet the seat's middle is

export function createJo() {
  const jacket = { dark: shade('joJacket', 0.5), light: col('joJacket'), lo: 0.03, hi: 0.5 };
  const SHIRT = { dark: shade('joJacket', 0.66), light: col('joJacket'), lo: -0.06, hi: 0.4 }, TROUSERS = { dark: shade('joTrousers', 0.55), light: mix('joTrousers', 'leafLight', 0.25), lo: 0.05, hi: 0.4 };
  const BELT = { at: 0.13, w: 0.012, ink: shade('ink', 0.8), top: SHIRT, legs: TROUSERS };   // (at: the height over her hip joint tools/assets.mjs cuts at; w: half the line's width)
  const skin = { dark: shade('joSkin', 0.5), light: mix('joSkin', 'potLit', 0.2), lo: 0.02, hi: 0.3 };
  const fig = createPerson('jo', { height: 1.62, parts: REAL ? (M) => {
    // the realistic body (CREDITS.md): one outfit cut in two (shirt, trousers), the skin, a ponytail, brows and lashes
    // (round fifteen: large dark purple blotches across her back. The three-tone light fell on every rib and muscle of the
    // body the shirt is fitted to: its normals are smoothed (person.js smoothNormals), so the light falls in broad planes.
    // And the ramp's dark end a shade lighter: the folds painted into the texture still read, never near-black.
    // tools/guide.mjs shirtback)
    // (round sixteen: where the shirt met the trousers the colours met in a ragged, fuzzy band, the line of the triangles
    // the outfit was cut along. Both halves are now painted by height on the body: shirt above, one thin ink belt, trousers
    // below. person.js painted(): belt. tools/guide.mjs belt)
    if (/casualsuit.*_top/.test(M.name)) return { ramp: SHIRT, belt: BELT, role: 'torso', side: THREE.DoubleSide, smoothN: 32 };
    if (/casualsuit.*_legs/.test(M.name)) return { ramp: TROUSERS, belt: BELT, role: 'legs', side: THREE.DoubleSide };
    if (/shoes/.test(M.name)) return { ramp: { dark: shade('cedar', 0.6), light: mix('cedar', 'pot', 0.45), lo: 0.05, hi: 0.5 }, role: 'feet', side: THREE.DoubleSide };
    if (M.name === 'body') return { ramp: { ...skin, lo: 0.08, hi: 0.32 }, role: 'skin', inkSoft: 0.85, handFlat: 0.85 };
    if (/high-poly|eye(?!brow|lash)/.test(M.name)) return { role: 'eyes', lid: mix('joSkin', shade('joSkin', 0.5), 0.45), inkSoft: 0.9 };   // (the lid a little under the skin's own light: let down over the eye it read as a blank pale eye)
    if (/eyelash/.test(M.name)) return { ramp: { dark: mix('joHair', 'joSkin', 0.45), light: mix('joHair', 'joSkin', 0.6), lo: 0, hi: 1 }, role: 'brow', inkSoft: 0.95 };
    if (/eyebrow|eyelash/.test(M.name)) return { ramp: { dark: shade('joHair', 0.6), light: col('joHair'), lo: 0, hi: 1 }, role: 'brow', noShadow: true, inkSoft: 0.95 };
    return { ramp: { dark: shade('joHair', 0.55), light: mix('joHair', 'joJacket', 0.15), lo: 0.05, hi: 0.5 }, role: 'hair', inkSoft: 0.5, side: THREE.DoubleSide };
  } : (M) => {
    if (/Body|Arms/.test(M.name)) return { ramp: jacket, role: /Arms/.test(M.name) ? 'arm' : 'torso', side: THREE.DoubleSide };   // cloth is drawn on both sides: an armhole or a collar shows lining, never a hole
    if (/Legs/.test(M.name)) return { ramp: { dark: shade('joTrousers', 0.55), light: mix('joTrousers', 'leafLight', 0.25), lo: 0.0, hi: 0.12 }, role: 'legs', side: THREE.DoubleSide };
    if (/Feet/.test(M.name)) return { ramp: { dark: shade('cedar', 0.6), light: mix('cedar', 'pot', 0.45), lo: 0.02, hi: 0.45 }, role: 'feet', side: THREE.DoubleSide };
    if (/Superhero/.test(M.name)) return { ramp: skin, role: 'skin', inkSoft: 0.75 };
    if (/Eyes/.test(M.name)) return { role: 'eyes', lid: 'joSkin' };
    return { tint: col('joHair'), role: 'hair', inkSoft: 0.5 };
  } });
  const D = fig.D, hs = 1;
  const walk = clipSpeed(fig, 'Walk_Formal_Loop', clipDur('Walk_Formal_Loop')), CYCLE = walk.speed * clipDur('Walk_Formal_Loop');   // metres per full walk cycle
  const walkC = clipSpeed(fig, 'Walk_Carry_Loop', clipDur('Walk_Carry_Loop'), 'cCarry'), CYCLE_C = walkC.speed * clipDur('Walk_Carry_Loop');   // and with the tray
  const hatLocal = new THREE.Matrix4().compose(new THREE.Vector3(0, D.top - D.head - 0.075, 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.34, 0, 0)), new THREE.Vector3(1, 1, 1));   // where the hat sits on the head
  // the hat: wide brim, low crown, a band. Its own mesh, carried on the head bone, because the night after she takes it off.
  const hat = (() => { const b = new Batch();
    b.add(lathe([[0, -0.004], [0.1, -0.004], [0.315, -0.046], [0.322, -0.037], [0.114, 0.012], [0.106, 0.092], [0.09, 0.106], [0, 0.108]], 18), (p, n) => n.y < -0.25 ? shade('joHat', 0.7) : col('joHat'));
    b.add(lathe([[0.108, 0.014], [0.12, 0.014], [0.114, 0.046], [0.106, 0.046]], 18), mix('tray', 'joJacket', 0.3));
    const m = b.mesh(paint.lit2()); m.matrixAutoUpdate = false; m.frustumCulled = false;
    m.castShadow = false;   // (worn back a little, and casting no shadow: the brim's own underside is the shade on her face, not a black band over her eyes)
    return m; })();
  let hatK = 0;   // 0 on her head .. 1 on the kerb
  const cup = makeCup(); cup.matrixAutoUpdate = false;
  const c0 = new THREE.Vector3(0.012, -0.205, -0.075), cupLocal = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(c0);
  const group = new THREE.Group(); group.add(fig.root, cup, hat);
  const hair = fig.meshes.find((m) => m.userData.role === 'hair');
  let kneelT = 0;
  const hatHead = new THREE.Matrix4(), hatRest = new THREE.Matrix4(), hatMid = new THREE.Matrix4(), _p = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _s = new THREE.Vector3();
  const lipLocal = new THREE.Vector3(0, CUP.h, CUP.r), lip = new THREE.Vector3(), M = new THREE.Matrix4();
  let heading = 0, shown = false;
  const qLevel = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  // put the cup (its lip, or its base) at a point in figure space with a heading and a tip; solve the wrist from it
  function holdCup(p, pt, az, tilt, atLip) {
    _q.setFromEuler(_e.set(tilt, az, 0, 'YXZ'));                    // cup orientation
    _v.copy(pt); if (atLip) _v.sub(_w.copy(lipLocal).applyQuaternion(_q));   // cup base
    _q2.copy(_q).multiply(qLevel); _v.sub(_w.copy(c0).applyQuaternion(_q2));  // wrist
    p.ikR = 1; p.aRx = _v.x; p.aRy = _v.y; p.aRz = _v.z; p.hRm = 1; p.hRaz = az; p.hRtilt = tilt; p.curlR = 0.82; p.thR = 0.45;
    p.pRx = -0.5; p.pRy = -0.75; p.pRz = -0.6;
  }
  const F = (w, out) => fig.toFigure(w, out);
  const carry = (p, t, calm) => { holdCup(p, _u.set(-0.19, 0.95 + (calm ? 0 : Math.sin(t * 1.05) * 0.004), 0.2), 0.18, 0, false); };
  const KNEEL = 0.95;   // seconds into the kneeling clip at which she is down
  const armTo = (p, n, g, k, tilt, curl, az = 0) => {
    p['ik' + n] = lerp(p['ik' + n], 1, k); p['a' + n + 'x'] = lerp(p['a' + n + 'x'], g.x, k); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], g.y, k); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], g.z, k);
    p['h' + n + 'm'] = lerp(p['h' + n + 'm'], 1, k); p['h' + n + 'az'] = lerp(p['h' + n + 'az'], az, k); p['h' + n + 'tilt'] = lerp(p['h' + n + 'tilt'], tilt, k); p['curl' + n] = lerp(p['curl' + n], curl, k);
  };

  function pose(state, env, t) {
    const J = state.jo, p = fig.rest(), u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0, calm = state.reducedMotion, act = J.action;
    fig.time.Idle_Loop = calm ? 0 : t; fig.time.Sitting_Idle_Loop = calm ? 0 : t;
    fig.time.Walk_Formal_Loop = clipDur('Walk_Formal_Loop') * (walk.strike + ((J.walked || 0) - CYCLE / 4) / CYCLE);
    fig.time.Walk_Carry_Loop = clipDur('Walk_Carry_Loop') * (walkC.strike + ((J.walked || 0) - CYCLE_C / 4) / CYCLE_C);
    p.nkRX = 0.05;   // chin a little down under the brim
    const moving = act === 'walk' || act === 'carry', stairs = act === 'climb' || act === 'descend', hasCup = !env.carryBook && !J.carrying && J.cupHeld !== false && !J.cupGiven;
    if (hasCup) carry(p, t, calm);   // (the night after: no cup. The shut book rides in her left hand, which swings as the clip has it)
    // standing, she stands at ease: feet under her hips, the weight going from one leg to the other
    if (!moving && !stairs && act !== 'sit') fig.stand(p, calm ? 0 : t);
    // the tray: a real carrying walk, the tray lying on her two open hands
    if (J.carrying) { p.cIdle = 0; p.cCarry = 1; p.nkRX += 0.16; p.spRX += 0.12; p.chRX += 0.06; }   // (the library's carry leans back as if under a crate: a tray of pots is lighter, so she stands up over it)
    else if (act === 'walk' || act === 'carry') { p.cIdle = 0; p.cWalk = 1; p.nkRX = -0.05; p.spRX -= 0.04; p.chRX -= 0.02; }   // walking tall: head up over the shoulders, not pushed forward
    if (stairs) {
      p.cIdle = 0.4; p.cWalk = 0.6;
      stairGait(p, fig, J.pos.x, act === 'climb' ? 1 : -1); p.spRX += act === 'climb' ? 0.14 : 0.04; p.nkRX += act === 'climb' ? -0.08 : 0.16;
      if (hasCup) holdCup(p, _u.set(-0.19, 0.98, 0.2), 0.2, 0, false);
    } else if (act === 'pour' || act === 'pourEmpty') {
      const i = +String(J.target || 'p0').slice(1) || 0, s = F(env.soil(i, _v), new THREE.Vector3()), dh = Math.hypot(s.x, s.z), az = Math.atan2(s.x, s.z), empty = act === 'pourEmpty';
      // the cup is held high and well back from the pot, so the water has a long way to fall: a bold arc, not a dribble.
      // It goes out at arm's length and a little below the shoulder, well clear of her face, so the water falls in the
      // open beside her and lands where everyone can see it
      const back = empty ? 0.14 : 0.3, lh = Math.max(0.62, Math.min(dh - back, 0.66)), ly = Math.min(1.02, Math.max(s.y + (empty ? 0.24 : 0.3) + Math.max(0, dh - back - lh) * 0.3, env.plantTop ? Math.max(env.plantTop(i), i >= 6 ? env.plantTop(i - 6) : 0) - (J.y || 0) + 0.03 : 0));   // (a pot on the lower tier is poured over the upper one behind it: over both)   // (over the top of the plant's leaves, so the camera sees the cup the water comes out of)
      const e = smooth(0, 0.14, u) * (1 - smooth(0.88, 1, u)), tip = (empty ? 1.75 : 1.25) * smooth(0.07, 0.17, u) * (1 - smooth(0.82, 0.92, u));
      const far = clamp((lh - 0.62) / 0.04), q = fig.rest();   // (round eleven: out past the brim, and no higher than her chest, so the arm never passes up through the hat: tools/pose.mjs hatarm)
      // she stays upright and only tips her head to watch: a lean would put her face over the cup
      fig.stand(q, calm ? 0 : t); q.spRX = 0.07 + 0.08 * far; q.chRX = 0.05 + 0.06 * far; q.hipZ = -0.02; q.spRY = az * 0.3; q.chRY = az * 0.15;
      q.nkRX = 0.1; q.hdRX = 0.06; q.hdRY = clamp(az * 0.45, -0.3, 0.3); q.hdRZ = -0.04; q.spRY = az * 0.4; q.chRY = az * 0.2;   // (round eleven: the head tips less, so the wide brim never comes down onto her own shoulder: tools/pose.mjs hatarm)
      holdCup(q, _u.set(Math.sin(az) * lh, ly, Math.cos(az) * lh), az, tip, true);
      fig.blend(p, q, e);
    } else if (act === 'scoop' && J.target !== 'valve') {
      const B = env.barrel, rimY = B.rim.y, P1 = F(_v.set(B.centre.x - 0.2, rimY + 0.05, B.centre.z + 0.05), new THREE.Vector3()), P2 = F(_v.set(B.centre.x - 0.2, Math.max(B.waterY() - 0.07, rimY - 0.02), B.centre.z + 0.05), new THREE.Vector3());   // the cup goes down the middle of the opening, so her hand is well inside the lip and the arm passes over the rim
      const P0 = new THREE.Vector3(-0.19, 0.95, 0.2), Pu = new THREE.Vector3(-0.3, P1.y, 0.36);   // out in front at waist height first, then in over the lip; out the same way. Never up by her head: the brim is there (tools/pose.mjs: hatarm)
      const c = P0.clone().lerp(Pu, smooth(0, 0.14, u)).lerp(P1, smooth(0.1, 0.28, u)).lerp(P2, smooth(0.3, 0.5, u)).lerp(P1, smooth(0.6, 0.76, u)).lerp(Pu, smooth(0.74, 0.88, u)).lerp(P0, smooth(0.86, 1, u));
      c.y += 0.035 * smooth(0.48, 0.58, u) * (1 - smooth(0.7, 0.8, u));   // as the full cup levels, it lifts, so the forearm rides over the lip (round thirteen: lower, the cup never comes up past her chest: tools/pose.mjs cuphigh)
      const e = smooth(0, 0.25, u) * (1 - smooth(0.8, 1, u)), dip = smooth(0.3, 0.46, u) * (1 - smooth(0.52, 0.66, u)), az = Math.atan2(P1.x, P1.z);
      // a real bend from the hips (the library's reach-to-a-table clip, held at its reach), her left hand on the rim to
      // steady herself. The cup hand is taken down into the water on top of it. Her head only tips: the hat stays level.
      const bend = smooth(0.04, 0.3, u) * (1 - smooth(0.66, 0.94, u));
      p.cIdle = 0; p.cPick = 1; fig.time.PickUp_Table = clipDur('PickUp_Table') * 0.28 * bend;
      p.nkRX = 0.05 - 0.2 * bend; p.hdRX = -0.12 * bend; p.hdRY = az * 0.3 * e;   // the neck gives back what the bend took: the brim stays near level
      const fx = Math.sin(heading), fz = Math.cos(heading), rim = _u2.set(B.centre.x - J.pos.x, 0, B.centre.z - J.pos.z), rl = Math.hypot(rim.x, rim.z) || 1;
      rim.set(B.centre.x - (rim.x / rl - fz * 0.55) * 0.57, rimY + 0.125 + 0.14 * (1 - smooth(0.12, 0.3, u) * (1 - smooth(0.72, 0.88, u))), B.centre.z - (rim.z / rl + fx * 0.55) * 0.57);   // (it comes down onto the rim from above, and lifts off it the same way)   // a place on the rim, on her left: the palm lies on it, the fingers flat over the water
      const kL = smooth(0, 0.14, u) * (1 - smooth(0.86, 1, u));   // the hand is on the rim before she bends and stays till she is up
      armTo(p, 'L', F(rim, _v), kL, 0, 0.12); p.hLroll = 1.35 * kL; p.pLx = 0.7; p.pLy = -0.4; p.pLz = -0.5;
      holdCup(p, c, az * e + 0.18 * (1 - e), 0.75 * dip, false); p.pRy = lerp(-0.75, 0.1, e); p.pRx = -0.6;   // the elbow stays up over the barrel
    } else if (act === 'scoop') {   // at Marlow's tap: down on one knee (a real kneel), the cup under the spout
      const e = smooth(0, 0.1, u) * (1 - smooth(0.92, 1, u)), sp = F(env.spout, new THREE.Vector3()), q = fig.rest();
      fig.time.Fixing_Kneeling = KNEEL * smooth(0, 0.3, u) * (1 - smooth(0.72, 1, u));
      q.cIdle = 0; q.cKneel = 1; q.nkRX = -0.22; q.spRX = -0.24; q.hdRY = 0.38; q.hipZ = -0.06;   // (upright from the waist, the head turned a little from the pipe to watch the cup: tools/pose.mjs tapface, taphat)
      holdCup(q, _u.set(sp.x, sp.y - 0.19, sp.z), 0, 0, false);
      fig.blend(p, q, e);
    } else if (act === 'sit' && J.seat === 'chair') {
      // in the folding chair: a real sit-down clip, scrubbed by sitK while she lowers herself, then the seated idle
      const k = J.sitK == null ? 1 : J.sitK;
      p.cIdle = 0; if (k < 0.999) { p.cSitIn = 1; fig.time.Sitting_Enter = k * clipDur('Sitting_Enter'); } else { p.cSit = 1; if (!env.bookHands) { p.ikL = 1; p.aLx = 0.17; p.aLy = 0.56; p.aLz = 0.2; p.curlL = 0.5; p.pLx = 0.4; p.pLy = -0.6; p.pLz = -0.4; } }   // (round twelve: before the book, her free hand rests on her thigh, not with its fingers in the seat)
    } else if (act === 'sit') {
      // on the kerb: the same seated clip with her hips let down to the kerb, so her knees come up
      p.cIdle = 0; p.cSit = 1; p.hipY = 0.19 - SEAT_Y; p.spRX = 0.02; p.chRX = 0.02;   // (round eleven: sitting up, so the shirt does not fold down over her lap: tools/pose.mjs shirt)
      if (!J.noCup && hasCup) holdCup(p, _u.set(-0.13, 0.5, 0.36), 0.3, 0, false);
    }
    // the hat coming off: the right hand goes up to the crown, brings it down to the deck beside her, and lets go
    if (hatK > 0.02 && hatK < 0.98) {
      const k = smooth(0, 0.12, hatK) * (1 - smooth(0.86, 1, hatK)), h = F(_p.setFromMatrixPosition(hat.matrix), new THREE.Vector3());
      armTo(p, 'R', _u2.set(h.x + 0.02, h.y + 0.1, h.z + 0.08), k, 0.3, 0.8); p.pRx = -0.8; p.pRy = -0.5; p.pRz = 0.3;
      const low = smooth(0.4, 0.9, hatK) * k; p.spRZ += 0.3 * low; p.chRZ += 0.2 * low; p.spRX += 0.45 * low; p.chRX += 0.2 * low; p.nkRX += 0.1 * k; p.hdRY -= 0.3 * low;
    }
    // reading: both hands under the book's lower corners, the head tipped to the page
    if (env.bookHands && act === 'sit') {
      const k = env.bookHands.k, L = F(env.bookHands.L, new THREE.Vector3()), R = F(env.bookHands.R, _v);
      armTo(p, 'L', L, k, -0.4, 0.5); armTo(p, 'R', R, k, -0.4, 0.5); p.hLroll = lerp(p.hLroll, -0.9, k); p.hRroll = lerp(p.hRroll, 0.35, k);
      p.pLx = 0.22; p.pRx = -0.22; p.pLy = p.pRy = -1; p.pLz = p.pRz = -0.35;   // elbows down against her sides, not out like wings
      // the head tips only a little and the eyes do the rest, so her face stays open to the stair light
      p.nkRX += 0.07 * k; p.hdRX += 0.07 * k; p.chRX += 0.02 * k;
      p.nkRY -= 0.03 * k; p.hdRY -= 0.05 * k; p.hdRX -= 0.03 * k;   // and turned to the book: the seated clip has her head 12 degrees to her left of it, so her eyes had to look hard sideways in their sockets to reach the page and she read as wary (round fourteen: tools/scene.mjs readeyes)   // her head a little down to the page in her lap (round eleven: less, so from the camera above her face is over the book, not behind it: tools/guide.mjs reading)
      // once, a while into it, she glances up from the page at the paling sky over her right shoulder, then back down.
      // Away from the camera, always: she is reading, not posing (tools/scene.mjs: gaze)
      const up = (J.lookUp || 0) * k; p.nkRX -= 0.42 * up; p.hdRX -= 0.36 * up; p.nkRY -= 0.3 * up; p.hdRY -= 0.42 * up; p.chRY -= 0.1 * up; p.chRX -= 0.04 * up;
      // the one gesture: her left hand leaves the page and goes out to a leaf of the basil beside her, and rests there
      if (env.leaf && J.leaf > 0.001) {
        const lf = J.leaf, g = F(env.leaf, _u2), az = Math.atan2(g.x, g.z), gh = Math.hypot(g.x, g.z) || 1;
        g.x -= (g.x / gh) * 0.08; g.z -= (g.z / gh) * 0.08; g.y += 0.04;   // the wrist stops short, so the palm and fingers lie on the leaf
        p.spRZ -= 0.16 * lf; p.spRY += az * 0.22 * lf; p.chRY += az * 0.12 * lf; p.hdRY += Math.min(0.35, az * 0.25) * lf; p.nkRX -= 0.05 * lf;   // she glances at it; her face stays toward the light
        armTo(p, 'L', g, lf, 0.45, 0.15, az); p.hLroll = lerp(p.hLroll, 1.2, lf); p.thL = lerp(p.thL, 0.3, lf);
        p.pLx = lerp(p.pLx, 0.8, lf); p.pLy = lerp(p.pLy, -0.6, lf); p.pLz = lerp(p.pLz, 0.2, lf);
      }
    } else if (act === 'plant') {
      const e = smooth(0, 0.22, u) * (1 - smooth(0.8, 1, u)), a = F(env.stakeCrate, new THREE.Vector3()), b = F(env.stakeBean, new THREE.Vector3());
      const h = a.clone().lerp(b, smooth(0.3, 0.5, u)); h.y += Math.sin(Math.PI * smooth(0.3, 0.5, u)) * 0.25 - 0.06 * smooth(0.5, 0.62, u) * (1 - smooth(0.62, 0.75, u));   // lifted clear of the plants on its way
      const reach = smooth(0.05, 0.24, u) * (1 - smooth(0.7, 0.86, u)), az = Math.atan2(h.x, h.z);
      p.spRX = 0.3 * e; p.chRX = 0.2 * e; p.hipZ = -0.08 * e; p.hipY = -0.05 * e; p.spRY = az * 0.4 * e; p.nkRX = 0.07 - 0.08 * e; p.hdRY = az * 0.4 * e;
      h.z -= 0.03; armTo(p, 'L', h, reach, 0.5, lerp(0.35, 1.0, reach), az);
    }
    // the night after, by hand: down on one knee, the cup into the neighbour's bucket
    if (J.dip > 0.001 && env.bucketWater) {
      const b = F(env.bucketWater, new THREE.Vector3()), az = Math.atan2(b.x, b.z), q = fig.rest(), k = clamp(J.dip * 1.4);
      fig.time.Fixing_Kneeling = KNEEL * k; q.cIdle = 0; q.cKneel = 1; q.nkRX = 0.1; q.spRY = az * 0.3; q.hdRY = az * 0.4;
      holdCup(q, b, az, 0.7 * clamp(J.dip * 1.6), false); fig.blend(p, q, smooth(0, 0.3, k));
    }
    // the tray hand-off, first: her right hand takes the cup round behind her right hip and hooks its handle over her belt
    if (act === 'hang' && env.cupHook) {
      const u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0, k = smooth(0, 0.55, u) * (1 - smooth(0.9, 1, u)), h = F(env.cupHook, new THREE.Vector3());
      const q = fig.rest(); fig.stand(q, calm ? 0 : t); q.spRY = -0.1; q.nkRX = 0.12; q.hdRY = -0.3;   // and half turns her head to it
      holdCup(q, h, -2.2, 0.05, false); fig.blend(p, q, k);
    }
    // the tray. While it changes hands her two open hands go under its near edge (palms up); once it is hers it lies on
    // them, and the carrying clip has her arms. World says where the hands are wanted and how firmly (env.trayHands.k).
    if (env.trayHands) { const k = env.trayHands.k;
      for (const [n, g] of [['L', env.trayHands.L], ['R', env.trayHands.R]]) { F(g, _v); armTo(p, n, _v, k, 0, 0.2); }
      p.hLroll = lerp(p.hLroll, -1.35, k); p.hRroll = lerp(p.hRroll, 0.35, k);
      p.pLx = 0.7; p.pRx = -0.7; p.pLy = p.pRy = -0.9; p.pLz = p.pRz = -0.3;
      if (!J.carrying) p.nkRX += 0.04 * k; }
    // the night after, by hand, the last of it: the cup held out level at her chest, between her and the neighbour, and
    // it stays in her hand: his open hand comes up under it. She stands plainly (straight knees, the other arm down) and
    // holds it there through the last line and under the card (round twelve: it used to go into his hand, and she was
    // left in a half squat with nothing to hold).
    if (J.offer > 0.001 && env.offerAt && act === 'idle') {
      const a = F(env.offerAt, new THREE.Vector3()), az = Math.atan2(a.x, a.z), q = fig.rest(), k = J.offer;
      fig.stand(q, calm ? 0 : t); q.spRX = 0.04; q.chRX = 0.02; q.nkRX = 0.1; q.hdRY = az * 0.3 + (calm ? 0 : 0.07 * Math.sin(t * 0.45)); q.spRY = az * 0.15; q.hdRX = calm ? 0 : 0.03 * Math.sin(t * 0.7 + 1);   // (a slow look from the cup to his face and back: nobody holds one pose)
      holdCup(q, a, az, 0, false);
      q.ikL = 1; q.curlL = 0.3;   // the free arm hangs by her side (the rest pose's wrist, just off the thigh)
      fig.blend(p, q, k);
    }
    // talking with the neighbour: whoever speaks plays the library's talking idle (the free hand moves with the words),
    // and the other listens with the head turned to the speaker, nodding a little. Nobody stands like a mannequin.
    const Tm = state.tam, sp = state.speaking && state.time < state.speaking.until ? state.speaking.who : null;
    if (act === 'idle' && Tm.present && (Tm.stage === 'top' || Tm.stage === 'handoff') && !J.offer && !(J.dip > 0)) {
      const g = F(_v.set(Tm.pos.x, (Tm.y || 0) + 1.62, Tm.pos.z), new THREE.Vector3()), az = clamp(Math.atan2(g.x, g.z), -1.1, 1.1);
      // (a part turn, chin up a little: her face stays open to the picture under the brim, the eyes do the rest)
      p.nkRY += az * 0.22; p.hdRY += az * 0.2; p.chRY += az * 0.1; p.nkRX -= 0.07;
      fig.time.Idle_Talking_Loop = calm ? 0 : t * 0.9; fig.time.Yes = calm ? 0 : (t * 0.55) % 2.5;
      if (sp === 'jo') { p.cTalk = 0.75; p.cIdle = 0.25; }
      else if (sp === 'tam') { p.cNod = 0.35; p.cIdle = 0.65; p.hdRX += calm ? 0 : 0.04 * Math.sin(t * 1.6); }
      else p.hdRX += calm ? 0 : 0.03 * Math.sin(t * 0.8);
      // the night after, by hand: while he brings the bucket up and bends to set it on the deck she keeps her hands to
      // herself. No nod clip (it swings the free hand out in front), and both arms down at her sides (round fourteen:
      // her left hand landed on his side as he bent, and read as her grabbing him: tools/pose.mjs handclear)
      if (Tm.bucket && (Tm.stage === 'out' || (Tm.stageT || 0) < 2.8)) { p.cIdle += p.cNod + p.cTalk; p.cNod = 0; p.cTalk = 0; p.ikL = 1; p.aLx = D.sw + 0.01; p.aLy = D.wrist + 0.04; p.aLz = 0.02; p.curlL = 0.3; }
    }
    // "Dry. Nine nights without rain.": she lifts her face to the sky for the length of the line
    if (J.skyUntil && state.time < J.skyUntil && act === 'idle') { p.nkRX -= 0.32; p.hdRX -= 0.26; p.chRX -= 0.04; }
    // the choice: the cup held out, level, over the shelf. Not poured yet.
    if (state.beat === 'choice' && !state.ending && (act === 'idle')) {
      const a = F(env.cupAnchor, new THREE.Vector3()), dh = Math.hypot(a.x, a.z), az = Math.atan2(a.x, a.z), lh = Math.min(dh, 0.6), k = env.choiceK;
      const q = fig.rest(); fig.stand(q, calm ? 0 : t); q.spRX = 0.12; q.chRX = 0.08; q.spRY = az * 0.3; q.hdRY = az * 0.5; q.nkRX = 0.18; q.hipZ = -0.03;
      holdCup(q, _u.set(Math.sin(az) * lh, Math.max(a.y + 0.1, 0.93), Math.cos(az) * lh), az, 0.12, true); fig.blend(p, q, k);
    }
    return p;
  }
  let seatK = 0; const fwd = new THREE.Vector3();
  return {
    group, fig, cup, hat, materials: fig.meshes.map((m) => m.material),
    lip(out) { return out.copy(lipLocal).applyMatrix4(cup.matrix); },   // from the cup as it is drawn now, wherever world has moved it
    handWorld(n, out) { fig.boneMatrix('hand' + n, M); return out.set(n === 'R' ? 0.02 : -0.02, -0.08, 0).applyMatrix4(M); },
    frame(state, dt) {   // root first: other things (the tray) are placed from it before the pose is made
      const J = state.jo; let dh = J.heading - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading = shown && J.present ? heading + dh * (1 - Math.exp(-dt * 11)) : J.heading;
      // seated, the clip puts her hips behind her feet: the root goes forward by as much, so she sits where the game says
      const want = J.present && J.action === 'sit' ? (J.seat === 'chair' ? (J.sitK == null ? 1 : J.sitK) : 1) : 0;
      seatK = shown ? (J.seat === 'chair' && J.action === 'sit' ? want : follow(seatK, want, dt, 9)) : want;
      fwd.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(SEAT_BACK * seatK);
      fig.place(J.pos.x + fwd.x, J.y || 0, J.pos.z + fwd.z, heading);
    },
    update(state, env, dt, t) {
      const J = state.jo; group.visible = !!J.present;
      if (!J.present) { shown = false; return; }
      const target = pose(state, env, t);
      if (!shown) Object.assign(fig.cur, target); else fig.blend(fig.cur, target, 1 - Math.exp(-dt * 13));
      shown = true; fig.solve(fig.cur); fig.lids(t, 0);
      // her eyes: on the open pages while she reads (round fourteen: the eyes could not turn, so over the book they stared out sideways and she looked wary, not absorbed); straight out of the head otherwise
      const rk = env.bookHands && J.action === 'sit' ? env.bookHands.k * (1 - (J.lookUp || 0)) : 0;
      if (rk > 0.001) fig.eyesTo(env.bookHands.pages, rk); else fig.eyesRest();
      fig.down(env.bookHands && J.action === 'sit' ? 0.4 * env.bookHands.k * (1 - (J.lookUp || 0)) : 0);   // reading, her eyes are down on the page under part-lowered lids, so her head need not bow far (round thirteen: bowed, her face was a pale wedge)
      fig.boneMatrix('handR', cup.matrix, cupLocal); cup.matrixWorldNeedsUpdate = true; cup.visible = J.cupHeld !== false;   // (world moves it to her hip, or into the neighbour's hand, after this)
      lip.copy(lipLocal).applyMatrix4(cup.matrix);
      // the hat: on her head, or (the night after, by sensor) lifted off and set on the kerb beside her, in an arc
      hatK = follow(hatK, J.hatOff && J.hatAt ? 1 : 0, dt, 1.15);   // slow: the one gesture that says she is not working tonight
      // (round fifteen) her hair is up under the hat while she wears it, and falls once the hat is lifted off. The ponytail
      // hanging below the brim went to a grey stalk at night, and from behind it read as a bare grey neck between the
      // hat and the collar (the 8.1 review). tools/guide.mjs shirtback: nape
      if (hair) hair.visible = hatK > 0.15;
      fig.boneMatrix('head', hatHead, hatLocal);
      if (hatK < 0.002 || !J.hatAt) hat.matrix.copy(hatHead);
      else {
        const A = J.hatAt; hatRest.compose(_p.set(A.x, A.y, A.z), _q3.setFromEuler(_e.set(0.06, A.ry || 0, 0.04)), _s.set(1, 1, 1));
        const k = smooth(0, 1, hatK); hatHead.decompose(_v, _q, _s); hatRest.decompose(_w, _q2, _s);
        const kx = smooth(0, 0.6, k), ky = smooth(0.35, 1, k); _v.x += (_w.x - _v.x) * kx; _v.z += (_w.z - _v.z) * kx; _v.y += (_w.y - _v.y) * ky + Math.sin(Math.PI * kx) * 0.08 * (1 - ky); _q.slerp(_q2, k); hat.matrix.compose(_v, _q, _s.set(1, 1, 1));   // (round twelve: out to the side first, then down, so her hand and sleeve go round the seat, not through its corner)
      }
      hat.matrixWorldNeedsUpdate = true;
    },
  };
}
