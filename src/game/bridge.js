// OWNER: D (game). window.__game: the test bridge. Never needed for play. Tests and critics drive the game
// through this: step it deterministically, play forward to a named beat with the canonical player, ask
// where a thing is on screen, measure a frame, render a sound offline.
import { BEAT_IDS, beatIndex } from '../core/beats.js';
import { ANCHORS } from '../core/layout.js';

export function installBridge({ state, bus, game, world, render, audio, tick }) {
  const DT = 1 / 30;
  const api = {
    ready: true, version: '1.0.0', beats: BEAT_IDS, anchors: Object.keys(ANCHORS),
    get state() { return state; }, bus, audio: { names: audio.names, renderOffline: (n, o) => audio.renderOffline(n, o) },
    begin() { game.begin(); },
    seed(n) { game.reset(n); return n; },
    // auto(false) stops the real-time clock so only step() advances the game. Rendering continues.
    auto(on) { state.auto = !!on; },
    step(seconds = DT, pilot = false) { const n = Math.max(1, Math.round(seconds / DT)); for (let i = 0; i < n; i++) { if (pilot) game.autopilot(); tick(DT); } return state.beat; },
    tap(id) { return game.tap(id); },
    // play forward with the canonical player until the named beat begins. Never teleports state.
    // opts: { ending: 'sensor' | 'hand', seed, settle: seconds to keep playing after the beat begins }
    goto(beat, o = {}) {
      if (!BEAT_IDS.includes(beat)) throw new Error('unknown beat ' + beat);
      game.setOptions({ ending: o.ending || 'hand' });
      if (beatIndex(state.beat) > beatIndex(beat) || state.beat === 'end' || (state.ending && o.ending && state.ending !== o.ending)) game.reset(o.seed ?? state.seed);
      if (beat === 'title') return state.beat;
      game.begin();
      for (let i = 0; i < 30 * 900 && state.beat !== beat; i++) { game.autopilot(); tick(DT); }
      if (o.settle) api.step(o.settle, true);
      return state.beat;
    },
    // where a thing is on screen right now, in CSS pixels (the cup follows Jo's hand during the choice)
    screenOf(id) { const p = game.where ? game.where(id) : ANCHORS[id] && ANCHORS[id].pos; return p ? render.project(p) : null; },
    pick(x, y) { return game.pick(x, y); },
    // any world point -> CSS pixels, for critics checking where a thing landed in the frame
    project(p) { return render.project(p); },
    // every piece of chrome that is showing: [{ name, x, y, w, h }]. For overlap, clipping and tap-size checks.
    ui() { return game.rects ? game.rects() : []; },
    setQuality(q, lock = true) { render.setQuality(q, lock); return state.quality; },
    perf() { return { ...state.perf, quality: state.quality }; },
    // feed the frame-time watch a frame of `ms` by hand, so a slow machine can be acted out in a test
    feedFrame(ms) { render.watch && render.watch.feed(ms); return state.quality; },
    // render one frame now and measure it: mean luminance, spread, share of warm pixels. For blank and flash checks.
    frameStats() {
      render.frame(world.scene);
      const gl = render.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4);
      let sum = 0, sq = 0, warm = 0, n = 0; const seen = new Set();
      for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
        gl.readPixels(Math.floor((i + 0.5) * W / 24), Math.floor((j + 0.5) * H / 24), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const l = (0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]) / 255; sum += l; sq += l * l; n++;
        if (px[0] > 110 && px[0] > px[2] * 1.35) warm++; seen.add((px[0] >> 3) + ',' + (px[1] >> 3) + ',' + (px[2] >> 3));
      }
      const mean = sum / n;
      return { mean: +mean.toFixed(4), spread: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(4), warm: +(warm / n).toFixed(4), colours: seen.size };
    },
    facts() { return world.facts ? world.facts() : null; },
    // the world's meshes and camera, for geometric gates in tools/. Not for play.
    debug() { return { ...(world.debug ? world.debug() : {}), camera: render.camera, render }; },
    events(n = 40) { return bus.log.slice(-n).map((e) => e.name); },
  };
  window.__game = api;
  return api;
}
