// OWNER: D (game). The neighbour. Never named, home from a night shift, carrying something up four floors.
// The climb is not a ramp: they stop once on the way to shift the weight, and slow for the last treads. Then they
// step out onto the roof (stage 'out'), stand there ('top', 'handoff'), and go back the way they came ('back', 'leaving').
// state.tam.stageT counts seconds in the current stage and state.tam.look says where their attention is
// ('stairs' | 'pots' | 'jo' | 'tray' | 'down'), so world can turn a head without guessing.
import { EV } from '../core/events.js';
import { HATCH, TAM_ROOF, TAM_WAY, stairPoint } from '../core/layout.js';
import { STRIDE, footfalls, turnToward } from './jo.js';
import { STAIR_HEAD } from './nav.js';

const DECK_SPEED = 0.95, STEP = 0.62;      // metres a second on the roof (tired, and carrying); metres between footfalls

export function createTam({ state, bus }) {
  let rest = 0, rested = false, path = null, speed = 0;
  const T = () => state.tam;
  // they come all the way up and step out onto the roof, to a place behind the shelf's near end, clear of the grab post
  // and the open lid. Whatever they carry changes hands there, in the open, at one height.
  const setStage = (s) => { const t = T(); if (t.stage !== s) { t.stage = s; t.stageT = 0; } };
  function update(dt) {
    const t = T(); if (!t.present) return;
    t.stageT = (t.stageT || 0) + dt;
    // standing on the roof, they turn to face her (slowly: they are tired)
    // (with the bucket, they set it down at their side first, then turn)
    if (t.stage === 'top' || t.stage === 'handoff') {   // (with the bucket too: they turn to her as they set it down, so it goes down in front of them, between the two)
      // (talking, they stand a little open to the picture; for the hand-over itself they square up to her)
      const want = state.jo.present ? Math.atan2(state.jo.pos.x - t.pos.x, state.jo.pos.z - t.pos.z) - (t.stage === 'top' ? 0.62 : 0) : TAM_ROOF.heading;
      t.heading = turnToward(t.heading, want, dt * 1.6);
    }
    if (t.stage === 'out' || t.stage === 'back') {            // across the deck, round the shelf's end
      const next = path && path[0];
      if (next) {
        const dx = next.x - t.pos.x, dz = next.z - t.pos.z, d = Math.hypot(dx, dz);
        let left = d; for (let i = 1; i < path.length; i++) left += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
        const want = Math.min(DECK_SPEED, 0.3 + left * 2.2); speed += Math.max(-dt * 5, Math.min(dt * 3, want - speed));
        const s = speed * dt; if (d > 1e-4) t.heading = turnToward(t.heading, Math.atan2(dx, dz), dt * 5);
        if (d <= s) { t.pos = { x: next.x, z: next.z }; path.shift(); } else t.pos = { x: t.pos.x + (dx / d) * s, z: t.pos.z + (dz / d) * s };
        const w0 = t.walkedM || 0; t.walkedM = w0 + Math.min(s, d);
        if (Math.floor(t.walkedM / STEP) > Math.floor(w0 / STEP)) bus.emit(EV.TAM_STEP, { depth: 0 });
      }
      if (!path || !path.length) {
        path = null; speed = 0;
        if (t.stage === 'out') { setStage('top'); t.look = t.hasTray ? 'pots' : 'jo'; bus.emit(EV.TAM_ARRIVE, {}); }
        else { setStage('leaving'); t.t = 0; t.heading = -Math.PI / 2; }
      }
      return;
    }
    if (t.stage === 'home') {
      if (t.stageT < 0.55) return;                           // the door opens first
      const next = path && path[0];
      if (next) { const dx = next.x - t.pos.x, dz = next.z - t.pos.z, d = Math.hypot(dx, dz); speed += Math.max(-dt * 5, Math.min(dt * 3, 0.8 - speed));
        const s = speed * dt; if (d > 1e-4) t.heading = turnToward(t.heading, Math.atan2(dx, dz), dt * 6);
        if (d <= s) { t.pos = { x: next.x, z: next.z }; path.shift(); } else t.pos = { x: t.pos.x + (dx / d) * s, z: t.pos.z + (dz / d) * s };
        const w0 = t.walkedM || 0; t.walkedM = w0 + Math.min(s, d); if (Math.floor(t.walkedM / STEP) > Math.floor(w0 / STEP)) bus.emit(EV.TAM_STEP, { depth: 1 }); }
      if (!path || !path.length) { path = null; setStage('gone'); t.present = false; bus.emit(EV.DOOR_CLOSE, {}); }
      return;
    }
    if (t.stage !== 'climbing' && t.stage !== 'leaving') return;
    const up = t.stage === 'climbing';
    if (rest > 0) { rest -= dt; return; }                    // standing on a tread, getting a better grip
    // seconds for the whole flight: slower with a tray than with a bucket, slower still over the last treads
    const flight = up ? (t.hasTray ? 7.2 : 6.6) * (t.t < 0.2 ? 1.2 : 1) : 6.6;
    const before = t.t; t.t = Math.max(0, Math.min(1, t.t + (up ? -1 : 1) * dt / flight));
    const w0 = t.walked; t.walked += Math.abs(t.t - before) * HATCH.steps * STRIDE;
    const p = stairPoint(t.t); t.pos = { x: p.x, z: p.z }; t.y = p.y; t.heading = up ? Math.PI / 2 : -Math.PI / 2;
    for (let i = footfalls(w0, t.walked); i > 0; i--) bus.emit(EV.TAM_STEP, { depth: t.t });
    if (up && !rested && t.t <= 0.46) { rested = true; rest = t.hasTray ? 1.1 : 0.5; }
    if (up && t.t <= 0) { t.t = 0; t.y = 0; setStage('out'); t.look = 'stairs'; path = TAM_WAY.map((p) => ({ ...p })); speed = 0.5; }
    // at the foot of the stairs they open the door of 4B and go in. Nobody vanishes: the wall takes them.
    if (!up && t.t >= 1) { setStage('home'); path = [{ x: -6.0, z: 4.45 }, { x: -6.3, z: HATCH.z0 - 0.6 }]; speed = 0.3; }
  }
  return {
    update, setStage,
    comeUp(extra) { rest = 0; rested = false; path = null; Object.assign(T(), { present: true, stage: 'climbing', stageT: 0, t: 1, walked: 0, walkedM: 0, look: 'stairs', hasCup: false, cupK: 0, touch: 0, ...extra }); const p = stairPoint(1); Object.assign(T(), { pos: { x: p.x, z: p.z }, y: p.y, heading: Math.PI / 2 }); },
    leave() { rest = 0; setStage('back'); T().look = 'down'; path = [...TAM_WAY.slice(0, -1).reverse().map((p) => ({ ...p })), { ...STAIR_HEAD }]; speed = 0; bus.emit(EV.TAM_LEAVE, {}); },
    look(at) { T().look = at; },
    reset() { rest = 0; rested = false; path = null; speed = 0; },
  };
}
