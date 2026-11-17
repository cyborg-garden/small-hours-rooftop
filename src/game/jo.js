// OWNER: D (game). Jo: where she is, where she is going, what her hands are doing. Game moves her; world
// only poses her from what is written here. She walks around things, eases in and out of a walk, turns
// before she acts, and takes the stairs one tread at a time. She never jumps from one place to another.
import { EV } from '../core/events.js';
import { stairPoint, HATCH } from '../core/layout.js';
import { pathBetween, STAIR_HEAD } from './nav.js';

export const SPEED = 1.65;                 // metres a second on the deck
export const STRIDE = Math.PI / 4.4;       // one footfall of `walked` (the skeleton gait: legs swing on sin(walked * 4.4))
const TURN = 7.5;                          // radians a second, turning on the spot
const STAIR_TIME = 6.5;                    // seconds for the whole flight
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const turnToward = (h, goal, max) => { const d = wrap(goal - h); return Math.abs(d) <= max ? goal : h + Math.sign(d) * max; };
// one footfall each time `walked` passes the middle of a stride
export const footfalls = (before, after) => Math.floor((after + STRIDE / 2) / STRIDE) - Math.floor((before + STRIDE / 2) / STRIDE);

export function createJo({ state, bus }) {
  let path = null, then = null, mode = 'walk', speed = 0, face = null, act = null, waits = [], stair = null;
  const J = () => state.jo;
  const settle = () => { const j = J(); j.action = 'idle'; j.actionT = 0; j.actionDur = 0; };

  function update(dt) {
    const j = J();
    if (stair) {                                             // on the stairs the tread decides everything
      const before = stair.t, dir = stair.dir;
      stair.t = Math.max(0, Math.min(stair.to, stair.t + dir * dt / STAIR_TIME));
      const treads = Math.abs(stair.t - before) * HATCH.steps, w0 = j.walked; j.walked += treads * STRIDE;
      const p = stairPoint(stair.t); j.pos.x = p.x; j.pos.z = p.z; j.y = p.y; j.heading = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let i = footfalls(w0, j.walked); i > 0; i--) bus.emit(EV.JO_STEP, { foot: Math.floor(j.walked / STRIDE) % 2, surface: 'stair' });
      if (dir < 0 && stair.t <= 0) { const f = stair.then; stair = null; j.y = 0; settle(); f && f(); }
      // at the bottom she stays where she is, on the landing. The night fades with her still in the picture.
      else if (dir > 0 && stair.t >= stair.to) { const f = stair.then; stair = null; settle(); f && f(); }
    } else if (path) {
      const next = path[0], dx = next.x - j.pos.x, dz = next.z - j.pos.z, d = Math.hypot(dx, dz);
      let left = d; for (let i = 1; i < path.length; i++) left += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      // ease into the walk and out of it: no sliding starts, no dead stops
      const top = SPEED * (j.carrying ? 0.72 : 1), want = Math.min(top, 0.35 + left * 2.6);
      speed += Math.max(-dt * 6, Math.min(dt * 4.2, want - speed));
      const s = speed * dt;
      if (d > 1e-4) j.heading = turnToward(j.heading, Math.atan2(dx, dz), TURN * 1.6 * dt);
      if (d <= s) { j.pos.x = next.x; j.pos.z = next.z; path.shift(); }
      else { j.pos.x += (dx / d) * s; j.pos.z += (dz / d) * s; }
      const w0 = j.walked; j.walked += Math.min(s, d);
      for (let i = footfalls(w0, j.walked); i > 0; i--) bus.emit(EV.JO_STEP, { foot: Math.floor(j.walked / STRIDE) % 2, surface: 'deck' });
      if (!path.length) { path = null; speed = 0; settle(); if (face == null) { const f = then; then = null; f && f(); } }
    } else if (face != null) {                               // arrived: turn to the work, then do it
      j.heading = turnToward(j.heading, face, TURN * dt);
      if (Math.abs(wrap(face - j.heading)) < 1e-3) { face = null; const f = then; then = null; f && f(); }
    } else if (act) {
      j.actionT += dt;
      if (act.mid && !act.midDone && j.actionT >= j.actionDur * act.midAt) { act.midDone = true; act.mid(); }
      if (act && j.actionT >= j.actionDur) { const f = act.onEnd; act = null; settle(); f && f(); }
    }
    if (waits.length && free()) waits.shift()();
  }
  const moving = () => !!(path || face != null || stair);
  const busy = () => !!act || !!stair || ['take', 'hang', 'place', 'give', 'plant', 'scoop', 'pour', 'pourEmpty'].includes(J().action);
  const free = () => !act && !moving();

  return {
    update, busy, free, moving,
    // walk to a stand (x, z, heading), around whatever is in the way, then turn to face and call `done`
    walkTo(stand, done, as = 'walk') {
      const j = J(); act = null;
      path = pathBetween({ x: j.pos.x, z: j.pos.z }, { x: stand.x, z: stand.z }); then = done || null; mode = as;
      face = stand.heading == null ? null : stand.heading; j.action = as; j.actionT = 0; j.actionDur = 0;
      if (Math.hypot(stand.x - j.pos.x, stand.z - j.pos.z) < 0.02) { path = null; settle(); if (face == null) { then = null; done && done(); } }
    },
    // turn on the spot to a heading (she hears something; she looks)
    turnTo(heading, done) { if (act || path || stair) return; face = heading; then = done || null; },
    // hold a pose for `dur` seconds. mid() fires once at midAt of the way through; onEnd when it is over.
    act(name, dur, onEnd, mid, midAt = 0.55) {
      const j = J(); path = null; face = null; then = null;
      Object.assign(j, { action: name, actionT: 0, actionDur: dur }); act = { onEnd, mid, midAt, midDone: false };
    },
    sit() { const j = J(); if (!act && !moving()) j.action = 'sit'; },
    // come up the stairs from `from` (0 top .. 1 bottom), then call done at the top tread
    climb(from, done) {
      const j = J(); path = null; face = null; act = null; then = null;
      Object.assign(j, { present: true, action: 'climb', actionT: 0, actionDur: 0, y: stairPoint(from).y, heading: Math.PI / 2 }); j.pos = { x: stairPoint(from).x, z: stairPoint(from).z };
      stair = { t: from, to: from, dir: -1, then: done };
    },
    // walk to the stair head and go down out of sight
    descend(done, to = 1) {
      this.walkTo({ x: STAIR_HEAD.x, z: STAIR_HEAD.z, heading: -Math.PI / 2 }, () => { J().action = 'descend'; stair = { t: 0, to, dir: 1, then: done }; });
    },
    whenFree(fn) { waits.push(fn); },
    // put her somewhere under a fade (never in view)
    place(o) { path = null; face = null; act = null; then = null; stair = null; speed = 0; const j = J(); Object.assign(j, { actionT: 0, actionDur: 0, y: 0 }, o); if (o.pos) j.pos = { ...o.pos }; },
    reset() { path = null; then = null; face = null; act = null; waits = []; stair = null; speed = 0; },
  };
}
