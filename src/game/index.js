// OWNER: D (game). createGame({ canvas, state, bus, render, world, audio }) -> the contract in BIBLE.md section 7.
// Game is the only writer of state. This file is the shell: it wires the arc (arc.js), the two people
// (jo.js, tam.js), the words (ui.js) and the hands (input.js), and owns the fade between nights.
import { EV } from '../core/events.js';
import { ANCHORS } from '../core/layout.js';
import { createState } from '../core/state.js';
import { createUI } from './ui.js';
import { createInput } from './input.js';
import { createJo } from './jo.js';
import { createTam } from './tam.js';
import { createArc } from './arc.js';

const TITLE_DIM = 0.7;                       // how much of the roof shows behind the title card
const FADE_UP = 2.5, FADE_DOWN = 1.8;        // seconds for a whole fade. Slow on purpose: nothing on this roof is sudden.

export function createGame({ canvas, state, bus, render, world, audio }) {
  let fade = TITLE_DIM, fadeGoal = TITLE_DIM, fadeSecs = 0, restarting = false, opening = false, ui = null, arc = null;
  const say = (kind, text, hold) => bus.emit(EV.TEXT, { kind, text, hold });
  const jo = createJo({ state, bus }), tam = createTam({ state, bus });
  const tap = (id) => { const a = ANCHORS[id]; if (a && a.kind === 'alias') id = a.to; return state.begun && arc ? arc.tap(id) : false; };

  function begin() {
    if (state.begun) return;
    state.begun = true; ui.showTitle(false); bus.emit(EV.BEGIN, {});
    // the title is the same roof, dimmed. Let it go dark before the first night comes up on the beds.
    fadeGoal = 0; opening = true;
  }
  function reset(seed = state.seed) {
    const keep = { viewport: state.viewport, quality: state.quality, qualityLocked: state.qualityLocked, perf: state.perf, muted: state.muted, volume: state.volume, reducedMotion: state.reducedMotion, auto: state.auto, paused: state.paused };
    Object.assign(state, createState(seed), keep);
    jo.reset(); tam.reset(); arc.reset(); fadeSecs = 0; restarting = false; opening = false; fade = fadeGoal = TITLE_DIM;
    ui.showEnd(false); ui.clearLine(); ui.showTitle(true); render.snap();
  }
  // Begin again: the roof goes dark first, so the night can be put back the way it was without anyone seeing
  function again() { if (restarting) return; restarting = true; ui.showEnd(false); state.hot = []; fadeGoal = 0; fadeSecs = 0; }

  // a tap on nothing still leaves a small ring where the finger landed: the roof heard it, there was nothing there
  const input = createInput({ canvas, state, render, world, onTap: tap, onMiss: (x, y, spent) => { bus.emit(EV.TAP_MISS, { x, y }); if (ui && state.begun) ui.ripple(null, { x, y }); if (spent && state.begun && arc) arc.spent(spent); }, onBegin: begin, onAgain: () => again(), onKey: (k) => { if (k === 'mute') ui.toggleMute(); } });
  ui = createUI({ state, bus, render, audio, input, onBegin: begin, onTap: tap, onAgain: again });
  arc = createArc({ state, bus, render, ui, jo, tam, say, fade: (g, secs = 0) => { fadeGoal = g; fadeSecs = secs; } });   // secs: a quicker dip than a night's, for a cut inside a scene

  return {
    begin, reset, tap, pick: input.pick, where: input.where, rects: () => ui.rects(),
    autopilot: () => { if (state.begun) arc.autopilot(); },
    setOptions(o) { arc.setOptions(o); },
    update(dt) {
      if (!(dt > 0)) dt = 0;                 // the first animation frame can arrive with a timestamp from before the script ran
      if (state.begun) {
        state.time += dt; state.beatTime += dt;
        jo.update(dt); tam.update(dt); arc.update(dt);
      }
      fade += Math.max(-dt / (fadeSecs || FADE_DOWN), Math.min(dt / (fadeSecs || FADE_UP), fadeGoal - fade));
      if (restarting && fade <= 0.001) { reset(); fade = 0; begin(); }
      if (opening && fade <= 0.001) { opening = false; arc.enter('n1_open'); }
      state.fade = fade;                     // 0 black .. 1 clear. Cuts and re-staging only ever happen at 0.
      render.setFade(fade);
      input.update(dt); ui.update(dt);
    },
  };
}
