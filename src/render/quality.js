// OWNER: A (render). Quality tiers and the frame-time watch. The picture is sized by a pixel budget, not a
// fixed ratio: a phone and a laptop both paint about the same number of pixels on the same tier, so the
// phone gets its full sharpness and a 4K monitor does not sink the frame rate.
//   mp      pixels the tier aims to paint (millions)      mpMax  the most it will ever paint
//   dprMin  never go softer than this unless mpMax says so   dprMax  never go finer than this
//   shadow  moon shadow map size (0 = no shadows)
//   rich    pooling, bristle streaks and the wider smear in the paint pass
// The drawn line, the flat washes and the paper are the same on every tier: only sharpness, shadows and the
// last layer of brushwork change.
export const TIERS = [
  { mp: 0.45, mpMax: 0.8, dprMin: 0.5, dprMax: 1.0, shadow: 0, rich: false },
  { mp: 0.8, mpMax: 1.5, dprMin: 0.75, dprMax: 1.5, shadow: 1024, rich: false },
  { mp: 1.4, mpMax: 2.6, dprMin: 1.0, dprMax: 2.0, shadow: 2048, rich: true },
  { mp: 2.6, mpMax: 4.2, dprMin: 1.0, dprMax: 2.5, shadow: 2048, rich: true },
];
export const tier = (q) => TIERS[Math.max(0, Math.min(TIERS.length - 1, q | 0))];

export function pixelRatio(q, cssW, cssH, deviceDpr = 1) {
  const t = tier(q), css = Math.max(1, cssW * cssH);
  let r = Math.sqrt((t.mp * 1e6) / css);
  r = Math.max(t.dprMin, Math.min(t.dprMax, r));
  r = Math.min(r, Math.sqrt((t.mpMax * 1e6) / css), Math.max(0.5, deviceDpr));
  return Math.max(0.35, r);
}

// Scale down when frames run long. Never scale back up: a picture that changes sharpness back and forth
// is worse than one that settles. A lone long frame (a hidden tab, a resize, a shader compile) is not evidence
// and is skipped, but a machine where most frames are long is seen for what it is and dropped to the floor.
export function createWatch(state, drop) {
  let acc = 0, n = 0, slow = 0, hold = 45, longRun = 0, wall = [];
  return {
    hold(frames = 45) { hold = frames; acc = 0; n = 0; longRun = 0; },
    feed(ms) {
      if (!(ms > 0)) return;
      // real wall-clock rate over the last two seconds, long frames included
      wall.push(ms); while (wall.length > 1 && wall.reduce((a, b) => a + b, 0) - wall[0] > 2000) wall.shift();
      state.perf.wallFps = +(1000 / (wall.reduce((a, b) => a + b, 0) / wall.length)).toFixed(1);
      if (ms > 250) {
        // one long frame between normal ones is noise. Four in a row is a slow machine.
        if (++longRun >= 4 && !state.qualityLocked && state.quality > 0) { longRun = 0; acc = 0; n = 0; drop(0); }
        else hold = Math.max(hold, 2);
        return;
      }
      longRun = 0;
      state.perf.frameMs += (ms - state.perf.frameMs) * 0.05; state.perf.fps = 1000 / state.perf.frameMs;
      if (hold > 0) { hold--; return; }
      acc += ms; n++;
      if (n < 40) return;
      const avg = acc / n; acc = 0; n = 0;
      slow = avg > 36 ? slow + (avg > 58 ? 2 : 1) : 0;         // under 28 fps counts; under 17 fps counts double
      if (slow >= 2 && !state.qualityLocked && state.quality > 0) { slow = 0; drop(avg > 120 ? 0 : state.quality - 1); }
    },
  };
}
