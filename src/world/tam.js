// OWNER: B (world). The neighbour: 1.78 m. A real rigged man from the asset library (CREDITS.md) painted in the
// game's colours: a slate work shirt, dark trousers, the red cap, tired shoulders. Never named.
// Also what they carry: the tray of six pots, and (by-hand ending) the bucket.
import * as THREE from 'three';
import { Batch, box, xf, col, mix, shade, paint, tube, V, ball, lathe, extrude, disc, clamp, lerp, smooth } from './kit.js';
import { createPerson, createProp, clipDur, REAL } from './person.js';
import { stairGait, clipSpeed } from './gait.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export const TRAY = { w: 0.86, d: 0.56 };
export const TRAY_SLOTS = [[-0.28, 0.14], [0, 0.14], [0.28, 0.14], [-0.28, -0.14], [0, -0.14], [0.28, -0.14]].map(([x, z]) => new THREE.Vector3(x, 0.022, z));

export function makeTray() {
  const b = new Batch(), wood = (k) => mix('tray', k % 2 ? 'tag' : 'cedarWarm', 0.28 + 0.08 * k);
  for (let k = 0; k < 4; k++) b.add(box(TRAY.w, 0.018, TRAY.d / 4 - 0.006), wood(k), xf(0, 0.009, (k - 1.5) * TRAY.d / 4));
  for (const s of [-1, 1]) { b.add(box(TRAY.w, 0.06, 0.018), wood(2), xf(0, 0.04, s * (TRAY.d / 2 - 0.009))); b.add(box(0.02, 0.085, TRAY.d), wood(3), xf(s * (TRAY.w / 2 - 0.01), 0.05, 0)); }
  const m = b.mesh(paint.lit()); m.matrixAutoUpdate = false; return m;
}
// the bucket: a real model of a wooden bucket (CREDITS.md), with water in it. BUCKET.grip is where a hand holds the handle.
export const BUCKET = { scale: 0.72, grip: 0.55 * 0.72 - 0.02 };
export function makeBucket() {
  const g = new THREE.Group(), m = createProp('bucket', () => ({ ramp: { dark: shade('barrelBand', 0.8), light: mix('barrel', 'tray', 0.55), lo: 0.02, hi: 0.4 } }));
  m.scale.setScalar(BUCKET.scale); g.add(m);
  const b = new Batch(); b.add(disc(0.105, 12), mix('water', 'barrel', 0.35), xf(0, 0.2, 0)); const w = b.mesh(paint.water()); w.castShadow = false; g.add(w);
  g.matrixAutoUpdate = false; return g;
}

export function createTam() {
  const tskin = { dark: shade('tamSkin', 0.5), light: mix('tamSkin', 'potLit', 0.2), lo: 0.08, hi: 0.36 };
  const fig = createPerson('tam', { stride: 1,   // (round seventeen: his own short, tired step; the knee and foot are made a person's as hers are, person.js gait())
    height: 1.78, parts: REAL ? (M) => {
    if (/casualsuit.*_top/.test(M.name)) return { ramp: { dark: shade('tamCoat', 0.5), light: mix('tamCoat', 'winCool', 0.15), lo: 0.03, hi: 0.3 }, role: 'torso', side: THREE.DoubleSide };
    if (/casualsuit.*_legs/.test(M.name)) return { ramp: { dark: shade('tamTrousers', 0.6), light: mix('tamTrousers', 'barrel', 0.5), lo: 0.05, hi: 0.45 }, role: 'legs', side: THREE.DoubleSide };
    if (/shoes/.test(M.name)) return { ramp: { dark: shade('barrelBand', 0.7), light: mix('barrelBand', 'barrel', 0.6), lo: 0.05, hi: 0.5 }, role: 'feet', side: THREE.DoubleSide };
    if (M.name === 'body') return { ramp: tskin, role: 'skin', inkSoft: 0.85 };
    if (/high-poly|eye(?!brow|lash)/.test(M.name)) return { role: 'eyes', lid: 'tamSkin', inkSoft: 0.9 };
    if (/eyelash/.test(M.name)) return { ramp: { dark: mix('joHair', 'tamSkin', 0.45), light: mix('joHair', 'tamSkin', 0.6), lo: 0, hi: 1 }, role: 'brow', inkSoft: 0.95 };
    if (/eyebrow|eyelash/.test(M.name)) return { ramp: { dark: shade('joHair', 0.6), light: col('joHair'), lo: 0, hi: 1 }, role: 'brow', inkSoft: 0.95 };
    return { ramp: { dark: shade('joHair', 0.6), light: col('joHair'), lo: 0.05, hi: 0.5 }, role: 'hair', inkSoft: 0.5, side: THREE.DoubleSide };
  } : (M) => {
    if (/Body/.test(M.name) || (/Arms/.test(M.name) && /Peasant/.test(M.material))) return { ramp: { dark: shade('tamCoat', 0.5), light: mix('tamCoat', 'winCool', 0.15), lo: 0.03, hi: 0.5 }, role: /Arms/.test(M.name) ? 'arm' : 'torso', side: THREE.DoubleSide };   // cloth is drawn on both sides: an armhole or a collar shows lining, never a hole
    if (/Arms/.test(M.name)) return { ramp: { dark: shade('tamSkin', 0.5), light: mix('tamSkin', 'potLit', 0.2), lo: 0.02, hi: 0.3 }, role: 'arm', inkSoft: 0.6 };
    if (/Legs/.test(M.name)) return { ramp: { dark: shade('tamTrousers', 0.6), light: mix('tamTrousers', 'barrel', 0.5), lo: 0.0, hi: 0.12 }, role: 'legs', side: THREE.DoubleSide };
    if (/Feet/.test(M.name)) return { ramp: { dark: shade('barrelBand', 0.7), light: mix('barrelBand', 'barrel', 0.6), lo: 0.02, hi: 0.45 }, role: 'feet', side: THREE.DoubleSide };
    if (/SuperHero/i.test(M.name)) return { ramp: { dark: shade('tamSkin', 0.5), light: mix('tamSkin', 'potLit', 0.2), lo: 0.02, hi: 0.3 }, role: 'skin', inkSoft: 0.75 };
    if (/Eyes/.test(M.name)) return { role: 'eyes', lid: 'tamSkin' };
    return { tint: col('joHair'), role: 'hair', inkSoft: 0.5 };
  } });
  const D = fig.D, group = new THREE.Group(); group.add(fig.root);
  // the cap: its own small mesh, worn on the head bone
  const cap = (() => { const b = new Batch(), r = 0.108;
    b.add(lathe([[0, -0.01], [r, -0.01], [r + 0.004, 0.03], [r - 0.012, 0.075], [0.05, 0.1], [0, 0.104]], 14, true), 'tamCap');
    const peak = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; peak.push([Math.cos(a) * 0.09, Math.sin(a) * 0.07]); }
    b.add(extrude(peak, 0.012), shade('tamCap', 0.82), xf(0, 0.012, 0.085, Math.PI / 2 - 0.12, 0, 0));
    const m = b.mesh(paint.lit2()); m.matrixAutoUpdate = false; m.frustumCulled = false; return m; })();
  group.add(cap);
  const capLocal = new THREE.Matrix4().compose(new THREE.Vector3(0, D.top - D.head - 0.085, 0.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0)), new THREE.Vector3(1, 1, 1));
  let heading = Math.PI / 2, shown = false, stage = '', tStage = 0, tFree = 9, look = 0, lookY = 0;
  const F = (w, out) => fig.toFigure(w, out), M = new THREE.Matrix4();
  const armTo = (p, n, g, k, tilt, curl, az = 0) => {
    p['ik' + n] = lerp(p['ik' + n], 1, k); p['a' + n + 'x'] = lerp(p['a' + n + 'x'], g.x, k); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], g.y, k); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], g.z, k);
    p['h' + n + 'm'] = lerp(p['h' + n + 'm'], 1, k); p['h' + n + 'az'] = lerp(p['h' + n + 'az'], az, k); p['h' + n + 'tilt'] = lerp(p['h' + n + 'tilt'], tilt, k); p['curl' + n] = lerp(p['curl' + n], curl, k);
  };
  const walk = clipSpeed(fig, 'Walk_Formal_Loop', clipDur('Walk_Formal_Loop')), CYCLE = walk.speed * clipDur('Walk_Formal_Loop');
  fig.lockFeet = true; fig.gait = { cycle: CYCLE, dur: clipDur('Walk_Formal_Loop') };   // (round seventeen: tools/gait.mjs reads the step from here)
  function pose(state, env, t, dt) {
    const T = state.tam, p = fig.rest(), calm = state.reducedMotion;
    const climbing = T.stage === 'climbing', leaving = T.stage === 'leaving', deck = T.stage === 'out' || T.stage === 'back' || (T.stage === 'home' && T.stageT > 0.5), still = !climbing && !leaving && !deck;
    fig.time.Idle_Loop = calm ? 0 : t * 0.8 + 1.3;
    fig.time.Walk_Formal_Loop = deck ? clipDur('Walk_Formal_Loop') * (walk.strike + ((T.walkedM || 0) - CYCLE / 4) / CYCLE) : (T.walked || 0) * 0.9;
    // tired: the spine gives, the head hangs forward of it
    p.spRX = 0.07; p.chRX = 0.08; p.nkRX = 0.2; p.hdRX = -0.06;
    if (climbing || leaving) {
      p.cIdle = 0.5; p.cWalk = 0.5;
      stairGait(p, fig, T.pos.x, climbing ? 1 : -1); p.spRX += climbing ? 0.12 : 0.02; p.nkRX += leaving ? 0.1 : -0.1;
    } else if (deck) { p.cIdle = 0; p.cWalk = 1; }   // out onto the roof and back: a real walk
    else fig.stand(p, calm ? 0 : t * 0.8 + 2.0);     // standing: at ease, the weight going from one leg to the other
    // where they look: at the pots in their hands first, then at Jo
    const j = F(_v.set(state.jo.pos.x, 1.45 - (T.y || 0) + (state.jo.y || 0), state.jo.pos.z), new THREE.Vector3()), toJo = clamp(Math.atan2(j.x, j.z), -1.0, 1.0);
    const wantLook = state.jo.present && still ? smooth(0.5, 1.5, tStage) : 0;
    look += (wantLook - look) * (1 - Math.exp(-dt * 3)); lookY += (toJo - lookY) * (1 - Math.exp(-dt * 4));
    p.nkRY = lookY * 0.45 * look; p.hdRY = lookY * 0.35 * look; p.chRY += lookY * 0.2 * look; p.nkRX = lerp(p.nkRX + (T.hasTray ? 0.04 : 0), 0.02, look); p.hdRX = lerp(p.hdRX, -0.18, look);   // (round twelve: standing straighter he is taller, so his chin comes up a touch more to keep the cap's peak off his eyes)
    // stepping out over the hatch's frame with the tray lifted, he looks up and ahead, over the stakes (round eleven: tools/pose.mjs trayface)
    if (T.hasTray && T.stage === 'out') { p.nkRX -= 0.14; p.hdRX -= 0.08; }
    // talking: the library's talking idle while they speak (arms that are holding something stay on it: the hands are
    // set on top of the clip below); listening, a small nod. Looking at the pots or the tray, the head goes down to them.
    const sp = state.speaking && state.time < state.speaking.until ? state.speaking.who : null;
    if (still && state.jo.present) {
      fig.time.Idle_Talking_Loop = calm ? 0 : t * 0.85 + 0.7; fig.time.Yes = calm ? 0 : (t * 0.5 + 1.1) % 2.5;
      if (sp === 'tam') { p.cTalk = 0.7; p.cIdle = 0.3; } else if (sp === 'jo') { p.cNod = 0.22; p.cIdle = 0.78; p.nkRX -= 0.05; }   // (a small nod: the cap's peak must not hide his eyes)
      if (T.look === 'pots' || T.look === 'tray') { p.nkRX += 0.1 * look; p.hdRX += 0.08 * look; p.nkRY *= 0.4; p.hdRY *= 0.4; }
      p.hdRX += calm ? 0 : 0.03 * Math.sin(t * 0.9 + 1.3); p.hdRY += calm ? 0 : 0.05 * Math.sin(t * 0.45);   // (a slow small turn and lift, never a tilt: a tilted head puts the cap's peak over his eyes)
    }
    // hands: on the two short ends of the tray while they have it. World says how firmly (k goes to nothing once it is
    // taken, so the arms come back down to rest by themselves).
    if (env.trayHands) { const k = env.trayHands.k;
      for (const [n, g] of [['L', env.trayHands.L], ['R', env.trayHands.R]]) armTo(p, n, F(g, _w), k * (env.trayHands['k' + n] ?? 1), 0.1, 0.95, 0);
      p.pLx = 0.8; p.pRx = -0.8; p.pLy = p.pRy = -0.7; p.pLz = p.pRz = -0.4;
    }
    if (T.bucket) {   // the bucket hangs from the left hand and pulls that shoulder down; set down with a real crouch
      const down = still ? smooth(0.3, 1.1, tStage) * (1 - smooth(1.6, 2.4, tStage)) : 0, held = env.bucketHeld;
      if (held && env.bucketGrip) { armTo(p, 'L', F(env.bucketGrip, _w), 1, 0, 1.05); p.hLm = 0; p.spRZ -= 0.06; p.chRZ = -0.04; }
      if (down > 0.001) { p.cIdle = 1 - down; p.cCrouch = down; p.legIK *= 1 - down; p.straight *= 1 - down; fig.time.Crouch_Idle_Loop = 0.4; p.spRX += 0.42 * down; p.chRX += 0.18 * down; p.nkRX -= 0.25 * down; }   // and a bend from the waist, so the hand goes all the way down with it
    }
    // the night after, by hand: the cup she holds out stays in her hand; their left hand comes up under it, open, palm
    // up, the way four hands were on the tray (round twelve: they used to take it and hold it at the belly)
    if (still && T.touch > 0.001 && env.offerCup) {
      const k = T.touch, g = F(env.offerCup, _w);
      g.y -= 0.035; g.z -= 0.075;   // the wrist: under the cup's foot and back toward them, so the palm is under it
      p.cReach = 0.5 * k; p.cIdle = 1 - p.cReach; fig.time.Interact = clipDur('Interact') * 0.4;
      armTo(p, 'L', g, k, 0, 0.25, 0); p.hLroll = lerp(p.hLroll, -1.35, k); p.thL = 0.2; p.pLx = 0.7; p.pLy = -0.9; p.pLz = -0.3;
      p.nkRX = lerp(p.nkRX, 0.16, k); p.hdRX = lerp(p.hdRX, -0.02, k);   // and they look down at it
      if (!calm) { p.hdRX += 0.07 * k * Math.sin(t * 0.7 + 0.4); p.hdRY += 0.06 * k * Math.sin(t * 0.38 + 2); }   // (round seventeen: from the cup up to her face and back, slowly; held dead still for 4 s while her slower walk brought her: tools/scene.mjs frozen)
    }
    return p;
  }
  return {
    group, fig, cap, tStage: () => tStage,
    handWorld(n, out) { fig.boneMatrix('hand' + n, M); return out.set(n === 'R' ? 0.02 : -0.02, -0.085, 0).applyMatrix4(M); },
    frame(state, dt) {
      const T = state.tam; if (T.stage !== stage) { stage = T.stage; tStage = 0; } else tStage += dt;
      if (T.hasTray) tFree = 0; else tFree += dt;
      let dh = (T.heading ?? Math.PI / 2) - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading = shown && T.present ? heading + dh * (1 - Math.exp(-dt * 6)) : (T.heading ?? Math.PI / 2);
      const pos = T.pos || { x: -6, z: 4.25 }; fig.place(pos.x, T.y || 0, pos.z, heading);
    },
    update(state, env, dt, t) {
      const T = state.tam; group.visible = !!T.present;
      if (!T.present) { shown = false; look = 0; return; }
      const target = pose(state, env, t, dt);
      if (!shown) Object.assign(fig.cur, target); else fig.blend(fig.cur, target, 1 - Math.exp(-dt * 10));
      shown = true; fig.solve(fig.cur); fig.lids(t, 0.37);
      fig.boneMatrix('head', cap.matrix, capLocal); cap.matrixWorldNeedsUpdate = true;
    },
  };
}
void ball; void tube; void V; void disc; void box;
