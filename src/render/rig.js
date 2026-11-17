// OWNER: A (render). Camera rig. Named shots, each with a landscape and a portrait framing.
// Game picks the shot (state.camera.shot) and feeds orbit (yaw, pitch, zoom). The rig eases.
// The camera is held by a person: it starts and stops softly (two eases in series, about 0.6 s together),
// it follows a drag at once, and it breathes by four thousandths of a radian. It never shakes.
import * as THREE from 'three';

// at: look-at point. dist, yaw (0 = straight on from +z), pitch (radians down), fov (vertical degrees).
// l is tuned at 1440 x 900, p at 390 x 844. Other shapes are fitted from these (see fit()).
export const SHOTS = {
  wide:     { l: { at: [-0.3, 0.2, 1.2], dist: 15.5, yaw: 0.0, pitch: 0.2, fov: 36 }, p: { at: [-2.4, 0.9, 1.6], dist: 17.5, yaw: 0.14, pitch: 0.46, fov: 44 } },
  shelf:    { l: { at: [-1.8, 0.5, 3.55], dist: 7.4, yaw: 0.22, pitch: 0.2, fov: 34 }, p: { at: [-1.05, 0.75, 2.7], dist: 11.3, yaw: 0.16, pitch: 0.4, fov: 42 } },
  // the barrel: close and low, so the water line and the jar on the chair beyond can be read
  barrel:   { l: { at: [3.7, 0.85, 2.3], dist: 6.2, yaw: -0.16, pitch: 0.26, fov: 34 }, p: { at: [3.8, 0.9, 1.6], dist: 10.4, yaw: -0.12, pitch: 0.4, fov: 42 } },
  follow:   { l: { at: [0, 0.5, 2.6], dist: 12, yaw: 0.0, pitch: 0.2, fov: 35 }, p: { at: [0, 0.9, 1.6], dist: 11.6, yaw: 0.0, pitch: 0.42, fov: 42 } },
  // the hatch: over Jo's shoulder, so the neighbour's face and the tray between the two of them are seen side-on
  hatch:    { l: { at: [-3.2, 0.45, 4.0], dist: 6.9, yaw: 0.56, pitch: 0.04, fov: 34 }, p: { at: [-3.3, 0.2, 3.9], dist: 8.6, yaw: 0.42, pitch: 0.2, fov: 42 } },
  // the talk after the tray: both people in one frame, the stair head between them
  talk:     { l: { at: [-2.35, 0.5, 3.8], dist: 7.2, yaw: 0.3, pitch: 0.14, fov: 34 }, p: { at: [-2.5, 0.45, 3.7], dist: 9.8, yaw: 0.3, pitch: 0.26, fov: 42 } },
  // the neighbour out on the roof: the two of them behind the shelf's near end, the tray (or the bucket) between them,
  // from high enough that the plants in front never cover their hands
  // (side on and low, so both faces are seen in profile under the hat and the cap)
  // (a waist-up two-shot at their eye height: their faces are what this scene is, so the camera comes in close enough to read them)
  meet:     { l: { at: [-1.5, 1.28, 2.9], dist: 3.9, yaw: 0.04, pitch: 0.05, fov: 34 }, p: { at: [-1.5, 0.9, 2.95], dist: 3.6, yaw: -0.7, pitch: 0.16, fov: 42 } },   // (round fifteen: on a phone a step back and to his side: his shoulder and the tray's end were cut by the left edge)
  // (round sixteen: on a phone, the two of them side by side at eye height were small in the lower middle under an empty
  // band of night, faces a few pixels across: a tall screen has no width for two people a metre apart. Now close and from
  // his side, at eye height: he is nearer, in profile, she faces the camera beyond him, their heads in the upper middle
  // and the shelf across the bottom. His back may meet the left edge; his face never does. tools/guide.mjs talkframe)
  // the hand-over: the same two from higher, looking down onto the tray, so its six pots are all seen as it changes hands
  take:     { l: { at: [-1.45, 1.0, 2.95], dist: 4.6, yaw: 0.12, pitch: 0.5, fov: 34 }, p: { at: [-1.4, 0.95, 2.95], dist: 6.4, yaw: 0.12, pitch: 0.66, fov: 42 }, tau: 0.5 },
  // the night after the plants in front are tall: the same two people from higher up
  meetHigh: { l: { at: [-1.95, 0.8, 2.8], dist: 6.0, yaw: 0.12, pitch: 0.46, fov: 34 }, p: { at: [-1.95, 0.9, 2.85], dist: 6.6, yaw: 0.15, pitch: 0.34, fov: 42 } },   // (a little left on a tall screen: the bucket at the shelf's end stays in frame)
  // the night after, by hand: from the open side of the roof, low enough to see the boards the bucket stands on, with
  // nothing between: the neighbour faces this way, she kneels side on, the warm stairwell behind them
  bucket:   { l: { at: [-1.95, 0.72, 2.7], dist: 5.6, yaw: 1.42, pitch: 0.24, fov: 34 }, p: { at: [-1.9, 0.8, 2.65], dist: 6.4, yaw: 1.55, pitch: 0.26, fov: 42 } },
  // the tap: Jo in the left third, in profile, the whole hat in frame
  valve:    { l: { at: [0.3, 0.7, -1.0], dist: 6.9, yaw: 0.78, pitch: 0.12, fov: 34 }, p: { at: [0.4, 0.75, -1.0], dist: 7.8, yaw: 0.78, pitch: 0.26, fov: 42 } },
  // (round fifteen) the swing to the tap when the barrel runs dry, on a wide screen: from in front and above, she by the
  // barrel on the right, the tap on the left with open ground between, so neither her hat nor her back is ever over it.
  // The tap shot above framed it from where she stood: the camera settled at her back and the ring landed on her shoulder.
  // A phone keeps the tap shot (from higher, over her hat). tools/scene.mjs: tapclear
  valveLook: { l: { at: [2.7, 0.7, 0.0], dist: 8.0, yaw: -0.13, pitch: 0.25, fov: 34 }, p: { at: [0.4, 0.75, -1.0], dist: 7.8, yaw: 0.78, pitch: 0.26, fov: 42 } },
  beds:     { l: { at: [0, 0.4, -1.2], dist: 13, yaw: -0.08, pitch: 0.24, fov: 34 }, p: { at: [-0.6, 1.0, 0.2], dist: 16, yaw: 0.1, pitch: 0.46, fov: 44 } },
  // the pour: the shelf shot leaning in toward the pot Jo is at (goal() pulls `at` toward her)
  pour:     { l: { at: [-1.8, 0.66, 3.55], dist: 5.4, yaw: 0.42, pitch: 0.12, fov: 34 }, p: { at: [-1.6, 0.75, 3.1], dist: 6.6, yaw: 0.36, pitch: 0.28, fov: 42 } },   // (round twelve: a little higher on a phone, so the bucket behind the shelf is seen standing on the deck)
  // and right in, for the first pour of a night and for every pour on a phone: the arc is the biggest thing in the frame
  pourClose:{ l: { at: [-1.8, 0.74, 3.6], dist: 4.3, yaw: 0.46, pitch: 0.08, fov: 34 }, p: { at: [-1.6, 0.8, 3.4], dist: 5.4, yaw: 0.4, pitch: 0.16, fov: 42 } },
  // first light and the choice: low and close, so the sky shows over the city and Jo stands whole at the shelf's end
  choice:   { l: { at: [-0.4, 0.95, 3.6], dist: 6.4, yaw: -0.12, pitch: 0.1, fov: 34 }, p: { at: [0.18, 0.95, 3.4], dist: 6.8, yaw: -0.1, pitch: 0.2, fov: 42 } },
  // the night after: the shelf centred, the stake (or the empty cup) the point of it
  epilogue: { l: { at: [-0.9, 0.35, 2.3], dist: 12.6, yaw: 0.06, pitch: 0.22, fov: 36 }, p: { at: [-1.25, 0.25, 3.9], dist: 7.4, yaw: 0.06, pitch: 0.56, fov: 44 } },
  // by hand, on a phone: the warm hatch, the neighbour with the bucket and Jo at the near end of the shelf, in one tall frame
  // by sensor: the shelf with its new dot and the hatch end in one frame, so the lid lifting and the kerb are both seen
  // and once she has sat down with the book, a slow push in on her from the stairwell side: the chair, the hat by it, the
  // stair light on the page, and the tomato she reaches for between her and the camera
  readClose: { l: { at: [-1.45, 0.58, 3.26], dist: 2.9, yaw: -0.88, pitch: 0.3, fov: 38 }, p: { at: [-1.94, 0.3, 2.88], dist: 3.6, yaw: -0.78, pitch: 0.25, fov: 44 }, tau: 1.0 },   // round eleven: from the open side of the lid, a little above, so both her legs show over the lid's kerb, and she sits between the title and the card when they come over her (tools/scene.mjs: readlegs). Round thirteen: on a phone, swung further round (yaw -0.78): the lid hid her left foot and the shin read as a stump. A little lower, so her bowed face is more seen than her crown (tools/guide.mjs readface). Round sixteen: on a wide screen, closer and aimed a little to her left (the shelf's side): from 4 m the open lid filled 40 percent of the picture and pushed her into the right half. Now the lid is an edge at most; she, the seat, the hat on the deck and the near pots fill it (tools/scene.mjs readlid)
  epilogueRead: { l: { at: [-2.0, 0.5, 3.3], dist: 8.0, yaw: 0.1, pitch: 0.16, fov: 36 }, p: { at: [-2.5, 0.6, 3.5], dist: 7.4, yaw: 0.12, pitch: 0.3, fov: 44 } },
  // by hand, the last of it: close on the stair head, the cup held out between the two of them
  handClose: { l: { at: [-1.75, 0.85, 2.85], dist: 4.3, yaw: 1.32, pitch: 0.2, fov: 34 }, p: { at: [-1.8, 0.85, 2.7], dist: 5.0, yaw: 1.58, pitch: 0.22, fov: 44 }, tau: 0.9 },   // (from the open side, as the bucket was: the cup between them, the bucket at their feet)
  epilogueHand: { l: { at: [-0.9, 0.35, 2.3], dist: 12.6, yaw: 0.06, pitch: 0.22, fov: 36 }, p: { at: [-2.1, 0.3, 3.9], dist: 8.6, yaw: 0.18, pitch: 0.4, fov: 44 } },
};
// round nine's reading shot, for tools/scene.mjs SH_BREAK=chairnear only (state.__oldRead): it looked past the shelf's near pot
const OLD_READ = { l: { at: [-1.9, 0.8, 3.14], dist: 3.3, yaw: -1.14, pitch: 0.1, fov: 34 }, p: { at: [-1.9, 0.8, 3.14], dist: 3.7, yaw: -1.14, pitch: 0.1, fov: 44 }, tau: 1.3 };
export const ORBIT = { yaw: 0.5, pitchUp: 0.1, pitchDown: 0.14, zoomMin: 0.85, zoomMax: 1.2 };
// The paper of the paint pass is pinned to this point on the roof (see post.js).
export const PAPER_ANCHOR = new THREE.Vector3(-1.2, 0, 3.0);
const REF_L = 1440 / 900, REF_P = 390 / 844;

export function createRig(state) {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 220);
  const mk = () => ({ at: new THREE.Vector3(), dist: 15, yaw: 0, pitch: 0.2, fov: 36 });
  const g = mk(), mid = mk(), cur = mk(), orb = { yaw: 0, pitch: 0, zoom: 1 };
  let first = true, aspect = 1.6;
  // a shot is tuned for one screen shape. Narrower than that, step back so the same width stays in frame.
  function fit(f, portrait) {
    if (portrait) return f.dist * Math.max(0.78, Math.min(1.18, Math.pow(REF_P / aspect, 0.6)));
    return f.dist * Math.max(1, Math.min(1.5, Math.pow(REF_L / aspect, 0.9)));
  }
  function goal() {
    // the lean in for the pour is a small move the shelf shot makes; under reduced motion it does not move at all
    const name = (state.camera.shot === 'pour' || state.camera.shot === 'pourClose') && state.reducedMotion ? 'shelf' : state.camera.shot;
    const s = (state.__shotTry && state.__shotTry[name]) || (state.__oldRead && name === 'readClose' ? OLD_READ : SHOTS[name]) || SHOTS.wide, portrait = !!state.viewport.portrait, f = portrait ? s.p : s.l;
    g.at.set(f.at[0], f.at[1], f.at[2]); g.dist = fit(f, portrait); g.yaw = f.yaw; g.pitch = f.pitch; g.fov = f.fov;
    if (state.camera.shot === 'follow' && state.jo && state.jo.present) {
      g.at.x = state.jo.pos.x * (portrait ? 0.8 : 0.6); g.at.z = f.at[2] - 0.5 + state.jo.pos.z * 0.2;
      // and the water she needs next, if the game names it: aim between the two, so both are in the picture
      const w = state.camera.lookTo;
      if (w) { g.at.x = state.jo.pos.x + (w.x - state.jo.pos.x) * 0.5; g.at.z = f.at[2] - 0.5 + (state.jo.pos.z + w.z) * 0.5 * 0.2;
        // step back far enough that the two, and a body's width either side, fit across the picture
        const span = Math.abs(w.x - state.jo.pos.x) + 2.0, half = Math.tan(g.fov * Math.PI / 360) * aspect;
        g.dist = Math.max(g.dist, span / (2 * half) + 1.2); }
    }
    if ((state.camera.shot === 'pour' || state.camera.shot === 'pourClose') && state.jo && state.jo.present) {
      // lean toward the pot she is pouring into, never so far that the shelf leaves the frame. Close in, follow it fully.
      const px = state.jo.pos.x - 0.35, k = state.camera.shot === 'pourClose' ? 1 : portrait ? 0.7 : 0.55;
      g.at.x = f.at[0] + (Math.max(-2.3, Math.min(0.2, px)) - f.at[0]) * k;
    }
  }
  const step = (a, b, k) => { a.at.lerp(b.at, k); a.dist += (b.dist - a.dist) * k; a.yaw += (b.yaw - a.yaw) * k; a.pitch += (b.pitch - a.pitch) * k; a.fov += (b.fov - a.fov) * k; };
  return {
    camera, anchor: PAPER_ANCHOR,
    update(dt, snap = false) {
      goal();
      const calm = state.reducedMotion, shot = SHOTS[state.camera.shot], tau = calm ? 0.45 : shot && shot.tau ? shot.tau : state.camera.shot === 'pourClose' ? 0.42 : 0.3;
      const k = snap || first ? 1 : 1 - Math.exp(-dt / tau), ko = snap || first ? 1 : 1 - Math.exp(-dt / (calm ? 0.16 : 0.09));
      first = false;
      step(mid, g, k); step(cur, mid, k);
      const c = state.camera;
      orb.yaw += ((c.yaw || 0) - orb.yaw) * ko; orb.pitch += ((c.pitch || 0) - orb.pitch) * ko; orb.zoom += ((c.zoom || 1) - orb.zoom) * ko;
      // a breath of sway, never more, and none at all under reduced motion
      const t = state.time || 0, sway = calm ? 0 : Math.sin(t * 0.23) * 0.004, nod = calm ? 0 : Math.sin(t * 0.17 + 1.3) * 0.0016;
      const yaw = cur.yaw + orb.yaw + sway, pitch = cur.pitch + orb.pitch + nod, dist = cur.dist * orb.zoom, cy = Math.cos(pitch);
      camera.position.set(cur.at.x + Math.sin(yaw) * cy * dist, cur.at.y + Math.sin(pitch) * dist, cur.at.z + Math.cos(yaw) * cy * dist);
      camera.lookAt(cur.at);
      if (camera.fov !== cur.fov) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
    },
    resize(w, h) { aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix(); },
  };
}
