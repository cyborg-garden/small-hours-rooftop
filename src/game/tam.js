// OWNER: D (game). The neighbour. Never named, home from a night shift, carrying something up four floors.
// The climb is not a ramp: they stop once on the way to shift the weight, and slow for the last treads.
// state.tam.stageT counts seconds in the current stage and state.tam.look says where their attention is
// ('stairs' | 'pots' | 'jo' | 'tray' | 'down'), so world can turn a head without guessing.
import { EV } from '../core/events.js';
import { HATCH, TAM_TOP, stairPoint } from '../core/layout.js';
import { STRIDE, footfalls } from './jo.js';

export function createTam({ state, bus }) {
  let rest = 0, rested = false;
  const T = () => state.tam;
  // they never step out onto the roof. With the tray they stop three treads down (head below her shoulder) and hold it up to Jo, so the
  // hand-off happens over the lip of the stairwell; with the bucket, one tread down, to set it on the deck.
  const stopAt = () => (T().hasTray ? 3 : 1) / HATCH.steps;
  const setStage = (s) => { const t = T(); if (t.stage !== s) { t.stage = s; t.stageT = 0; } };
  function update(dt) {
    const t = T(); if (!t.present) return;
    t.stageT = (t.stageT || 0) + dt;
    // at the top, when they are talking to Jo, they turn to face her (slowly: they are tired)
    if ((t.stage === 'top' || t.stage === 'handoff') && (t.look === 'jo' || t.look === 'tray') && state.jo.present) {
      const want = Math.atan2(state.jo.pos.x - t.pos.x, state.jo.pos.z - t.pos.z) - 0.4;
      let d = want - t.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      t.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
    }
    if (t.stage !== 'climbing' && t.stage !== 'leaving') return;
    const up = t.stage === 'climbing';
    if (rest > 0) { rest -= dt; return; }                    // standing on a tread, getting a better grip
    // seconds for the whole flight: slower with a tray than with a bucket, slower still over the last treads
    const flight = up ? (t.hasTray ? 8.4 : 7.2) * (t.t < 0.2 ? 1.35 : 1) : 6.6;
    const before = t.t; t.t = Math.max(up ? stopAt() : 0, Math.min(1, t.t + (up ? -1 : 1) * dt / flight));
    const w0 = t.walked; t.walked += Math.abs(t.t - before) * HATCH.steps * STRIDE;
    const p = stairPoint(t.t); t.pos = { x: p.x, z: p.z }; t.y = p.y; t.heading = up ? Math.PI / 2 : -Math.PI / 2;
    for (let i = footfalls(w0, t.walked); i > 0; i--) bus.emit(EV.TAM_STEP, { depth: t.t });
    if (up && !rested && t.t <= 0.46) { rested = true; rest = t.hasTray ? 1.1 : 0.5; }
    if (up && t.t <= stopAt()) { t.t = stopAt(); setStage('top'); t.heading = TAM_TOP.heading; t.look = 'pots'; bus.emit(EV.TAM_ARRIVE, {}); }
    if (!up && t.t >= 1) { setStage('gone'); t.present = false; }
  }
  return {
    update, setStage,
    comeUp(extra) { rest = 0; rested = false; Object.assign(T(), { present: true, stage: 'climbing', stageT: 0, t: 1, walked: 0, look: 'stairs', ...extra }); const p = stairPoint(1); Object.assign(T(), { pos: { x: p.x, z: p.z }, y: p.y, heading: Math.PI / 2 }); },
    leave() { rest = 0; setStage('leaving'); T().look = 'down'; bus.emit(EV.TAM_LEAVE, {}); },
    look(at) { T().look = at; },
    reset() { rest = 0; rested = false; },
  };
}
