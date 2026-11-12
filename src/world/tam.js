// OWNER: B (world). The neighbour: 1.78 m, a long work coat, a cap, a lanyard, tired shoulders. Never named.
// Also what they carry: the tray of six pots, and (by-hand ending) the bucket.
import * as THREE from 'three';
import { Batch, box, xf, col, mix, shade, paint, tube, V, ball, lathe, extrude, disc, clamp, lerp, smooth } from './kit.js';
import { createFigure, walkGait, stairGait } from './figure.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export const TRAY = { w: 0.86, d: 0.56 };
export const TRAY_SLOTS = [[-0.28, 0.14], [0, 0.14], [0.28, 0.14], [-0.28, -0.14], [0, -0.14], [0.28, -0.14]].map(([x, z]) => new THREE.Vector3(x, 0.022, z));

export function makeTray() {
  const b = new Batch(), wood = (k) => mix('tray', k % 2 ? 'tag' : 'cedarWarm', 0.28 + 0.08 * k);
  for (let k = 0; k < 4; k++) b.add(box(TRAY.w, 0.018, TRAY.d / 4 - 0.006), wood(k), xf(0, 0.009, (k - 1.5) * TRAY.d / 4));
  for (const s of [-1, 1]) { b.add(box(TRAY.w, 0.06, 0.018), wood(2), xf(0, 0.04, s * (TRAY.d / 2 - 0.009))); b.add(box(0.02, 0.085, TRAY.d), wood(3), xf(s * (TRAY.w / 2 - 0.01), 0.05, 0)); }
  const m = b.mesh(paint.lit()); m.matrixAutoUpdate = false; return m;
}
export function makeBucket() {
  const b = new Batch();
  b.add(lathe([[0, 0], [0.11, 0], [0.145, 0.27], [0.152, 0.27], [0.152, 0.285], [0.13, 0.285], [0.1, 0.03], [0, 0.03]], 12), (p, n) => (Math.hypot(p.x, p.z) < 0.128 && p.y > 0.02) ? shade('barrelBand', 0.8) : mix('barrel', 'tamCoat', 0.3));
  b.add(lathe([[0.118, 0.07], [0.124, 0.07], [0.127, 0.095], [0.121, 0.095]], 12), 'barrelBand');
  b.add(disc(0.128, 12), mix('water', 'barrel', 0.35), xf(0, 0.235, 0));
  const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push(V(Math.cos(a) * 0.15, 0.27 + Math.sin(a) * 0.19, 0)); }
  b.add(tube(pts, 0.008, 4, false), 'barrelBand');
  const m = b.mesh(paint.lit2()); m.matrixAutoUpdate = false; return m;
}

export function createTam() {
  const fig = createFigure({ k: 1.1, wk: 1.1, tired: 1, coat: 'long', sleeves: 'long', bareAnkles: false,
    colours: { coat: 'tamCoat', trousers: 'tamTrousers', skin: 'tamSkin', shoe: 'barrelBand' },
    build({ add, HC, hk }) {
      // the hair: short, at the back and over the ears under the cap. Its front edge stops well behind the eyes, so in
      // profile the side of the face is skin, not a dark disc
      add(ball(0.104 * hk, 10, 8), 'joHair', 'head', xf(0, HC - 0.004, -0.05, 0.1, 0, 0, 0.98, 0.94, 0.9), 'hair');
      const M = xf(0, HC + 0.04 * hk, -0.004, -0.06, 0, 0, hk);
      add(lathe([[0, 0], [0.104, 0], [0.108, 0.03], [0.094, 0.072], [0.05, 0.094], [0, 0.098]], 12, true), 'tamCap', 'head', M, 'cap');
      const peak = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; peak.push([Math.cos(a) * 0.088, Math.sin(a) * 0.1]); }
      add(extrude(peak, 0.012), shade('tamCap', 0.82), 'head', M.clone().multiply(xf(0, 0.012, 0.078, Math.PI / 2 + 0.18, 0, 0)), 'cap');
    } });
  const D = fig.D, group = new THREE.Group(); group.add(fig.root);
  let heading = Math.PI / 2, shown = false, stage = '', tStage = 0, tFree = 9, hadTray = true, look = 0, lookY = 0;
  const F = (w, out) => fig.toFigure(w, out), M = new THREE.Matrix4();
  function pose(state, env, t, dt) {
    const T = state.tam, p = fig.rest(), calm = state.reducedMotion, br = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.8 + 1.3);
    // tired: the spine gives, the head hangs forward of it, the arms hang a little in front
    p.spRX = 0.09; p.chRX = 0.1 - 0.03 * br; p.nkRX = 0.26; p.hdRX = -0.1; p.aLz = 0.07; p.aRz = 0.07; p.aLy -= 0.012 + 0.006 * br; p.aRy -= 0.012 + 0.006 * br; p.curlL = p.curlR = 0.45;
    const climbing = T.stage === 'climbing', leaving = T.stage === 'leaving';
    if (climbing || leaving) {
      stairGait(p, fig, T.pos.x, climbing ? 1 : -1); p.spRX += climbing ? 0.13 : 0.02; p.nkRX += leaving ? 0.12 : -0.12;
      const a = (T.pos.x / 0.2231) * Math.PI; p.hipX = Math.sin(a) * 0.016; p.chRY = Math.sin(a) * 0.05; p.aLz += Math.sin(a) * 0.07; p.aRz -= Math.sin(a) * 0.07;
    } else if (T.stage === 'watering' || (T.walkedDeck || 0) > 0) walkGait(p, D, T.walked || 0, 0.7, 0.0, 1);
    else {   // standing at the top: the weight goes onto one leg, a long breath out
      const s = smooth(0.2, 1.6, tStage); p.hipX = -0.032 * s; p.pelRZ = -0.045 * s; p.spRZ = 0.03 * s; p.hipY = -0.012 * s; p.chRX += 0.03 * Math.sin(Math.min(tStage, 3) * 1.05) * (calm ? 0 : 1);
    }
    // where they look: at the pots in their hands first, then at Jo
    const j = F(_v.set(state.jo.pos.x, 1.45, state.jo.pos.z), new THREE.Vector3()), toJo = clamp(Math.atan2(j.x, j.z), -1.0, 1.0);
    const wantLook = state.jo.present && !climbing && !leaving ? smooth(0.5, 1.5, tStage) : 0;
    look += (wantLook - look) * (1 - Math.exp(-dt * 3)); lookY += (toJo - lookY) * (1 - Math.exp(-dt * 4));
    p.nkRY = lookY * 0.45 * look; p.hdRY = lookY * 0.35 * look; p.chRY += lookY * 0.2 * look; p.nkRX = lerp(p.nkRX + (T.hasTray ? 0.12 : 0), -0.06, look); p.hdRX = lerp(p.hdRX, -0.3, look);   // she is above them: the face comes up to her
    // hands: on the tray while they have it; in the air a moment after it is taken; then down
    if (env.trayHands) { const air = T.hasTray ? 1 : 1 - smooth(1.0, 2.1, tFree);
      for (const [n, g] of [['L', env.trayHands.L], ['R', env.trayHands.R]]) { F(g, _w); if (!T.hasTray) _w.y -= 0.03 * smooth(0, 1, tFree);
        p['a' + n + 'x'] = lerp(p['a' + n + 'x'], _w.x, air); p['a' + n + 'y'] = lerp(p['a' + n + 'y'], _w.y, air); p['a' + n + 'z'] = lerp(p['a' + n + 'z'], _w.z, air);
        p['h' + n + 'm'] = air; p['h' + n + 'az'] = env.trayHands.az; p['h' + n + 'tilt'] = 0.1; p['curl' + n] = lerp(p['curl' + n], T.hasTray ? 0.95 : 0.25, air); p['p' + n + 'y'] = -0.6; }
    }
    if (T.bucket) {   // the bucket hangs from the right hand and pulls that shoulder down; set down at the top
      const down = !climbing && !leaving ? smooth(0.4, 1.4, tStage) * (1 - smooth(1.6, 2.4, tStage)) : 0, held = env.bucketHeld;
      if (held) { p.aRx = -D.sw - 0.09; p.aRy = D.wrist + 0.02 - 0.22 * down; p.aRz = 0.06 + 0.16 * down; p.curlR = 1.05; p.spRZ += 0.07; p.chRZ = 0.05; p.aLx += 0.06; p.aLy += 0.05; }
      p.spRX += 0.5 * down; p.chRX += 0.25 * down; p.hipY -= 0.14 * down; p.hipZ -= 0.1 * down;
    }
    // the night after, by hand: their left hand comes up under the cup she holds out, palm up, a hand's breadth below it
    if (T.touch > 0.001 && env.offerCup && !climbing && !leaving) {
      const k = T.touch, g = F(env.offerCup, _w); g.y -= 0.075;
      p.aLx = lerp(p.aLx, g.x, k); p.aLy = lerp(p.aLy, g.y, k); p.aLz = lerp(p.aLz, g.z, k);
      p.hLm = k; p.hLaz = Math.atan2(g.x, g.z) * k; p.hLtilt = -0.25 * k; p.curlL = lerp(p.curlL, 0.3, k); p.pLx = 0.6; p.pLy = -0.8; p.pLz = -0.2;
      p.nkRX = lerp(p.nkRX, 0.2, k); p.hdRX = lerp(p.hdRX, -0.05, k);   // and they look down at it, at her hands
    }
    return p;
  }
  return {
    group, fig, tStage: () => tStage,
    handWorld(n, out) { fig.boneMatrix('hand' + n, M); return out.set(0, -0.075 * D.hs, 0).applyMatrix4(M); },
    frame(state, dt) {
      const T = state.tam; if (T.stage !== stage) { stage = T.stage; tStage = 0; } else tStage += dt;
      if (T.hasTray) tFree = 0; else tFree += dt; hadTray = T.hasTray;
      let dh = (T.heading ?? Math.PI / 2) - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading = shown && T.present ? heading + dh * (1 - Math.exp(-dt * 6)) : (T.heading ?? Math.PI / 2);
      const pos = T.pos || { x: -6, z: 4.25 }; fig.place(pos.x, T.y || 0, pos.z, heading);
    },
    update(state, env, dt, t) {
      const T = state.tam; group.visible = !!T.present;
      if (!T.present) { shown = false; look = 0; return; }
      const target = pose(state, env, t, dt);
      if (!shown) Object.assign(fig.cur, target); else fig.blend(fig.cur, target, 1 - Math.exp(-dt * 10));
      shown = true; fig.solve(fig.cur); void hadTray;
    },
  };
}
void col; void ball;
