// OWNER: C (audio). The music is the garden. There is no score: every pot has a note (POT_NOTES in layout.js),
// and the notes of the pots that are standing are what plays.
//
// Under it is one fixed tune, eight steps long, that uses every pot exactly once:
//
//   step   1      2    3    4    5      6    7       8    (and)
//   pots   6+0    2    1    4    7+3    8    10+5    9    11
//   notes  A3 D4  A4   F#4  D5   B3 B4  F#5  E4 E5   A5   B5
//          D . . . . . . . . . . Bm . . . . . A . . . . . .
//
// The pot with no tag, the one that came up by itself, falls between the last step and the first.
//
//   garden  the three nights. One note at a time, 2.5 to 6 s apart, in tune order, only from pots that have been
//           watered tonight. The tune has holes, and watering fills them in. Nobody is told it is a tune.
//   box     the sensor ending. All twelve, strict, 0.75 s a step, every note identical. Now you can hear what it was.
//   hands   the by-hand ending. All twelve, loose, chords rolled, and a second voice an octave down answering.
//   off     silence.
import { POT_NOTES } from '../core/layout.js';
import { buildPad } from './sfx.js';

export const STEPS = [[6, 0], [2], [1], [4], [7, 3], [8], [10, 5], [9]];
export const GRACE = 11;
export const ORDER = [0, 6, 2, 1, 4, 3, 7, 8, 5, 10, 9, 11];   // the same tune, one note at a time
const PAD = 1;

export function createMusic(engine, rng, panOfPot) {
  const { ctx } = engine, pad = buildPad(ctx, engine.buses.music, ctx.currentTime);
  let mode = 'garden', next = 0, cursor = 0, step = 0, played = 0, padLevel = 0, lastPool = 0;
  const note = (i, t, o = {}) => engine.voice('potNote', { midi: POT_NOTES[i] + (o.down ? -12 : 0), gain: o.gain ?? 0.5, growth: o.growth ?? 0, strict: !!o.strict,
    pan: panOfPot(i) * (o.down ? -0.6 : 1), send: o.send }, t);
  return {
    get mode() { return mode; },
    setMode(m, t) {
      if (m === mode) return; mode = m; step = 0; played = 0;
      if (m === 'garden') { next = t + 3; cursor = 0; }
      if (m === 'box') next = t + 1.1;
      if (m === 'hands') { note(6, t + 0.38, { gain: 0.6, growth: 2 }); step = 1; next = t + 1.7; }   // the pour was step one; the other hand answers it
    },
    // a pot was just watered and its note rang: leave it some air
    heard(t) { if (mode === 'garden') next = Math.max(next, t + 2.8 + rng() * 1.4); },
    setPad(level, t) { if (level === padLevel) return; pad.level.setTargetAtTime(level * PAD, t, level > padLevel ? 2.0 : 2.6); padLevel = level; },
    advance(tTo, view) {
      const ended = view.beat === 'end';
      if (next < tTo - 1) next = tTo - 0.25;   // after a stall, pick up from now; never play the backlog
      if (mode === 'garden') {
        if (view.beat === 'title') { next = Math.max(next, tTo); return; }
        const pool = ORDER.filter((i) => view.pots[i] && view.pots[i].present && view.pots[i].watered);
        if (!pool.length) { next = Math.max(next, tTo + 0.4); cursor = 0; lastPool = 0; return; }
        lastPool = pool.length;
        while (next < tTo) {
          let k = ORDER.indexOf(pool[0]), wrapped = true;
          for (let j = 0; j < ORDER.length; j++) { const c = (cursor + j) % ORDER.length; if (pool.includes(ORDER[c])) { k = c; wrapped = cursor + j >= ORDER.length; break; } }
          const i = ORDER[k]; cursor = (k + 1) % ORDER.length;
          note(i, Math.max(next, ctx.currentTime + 0.03), { gain: 0.55 + rng() * 0.15, growth: view.pots[i].growth || 0 });
          next += (pool.length < 3 ? 4 + rng() * 2 : 2.5 + rng() * 1.9) + (wrapped ? 1.2 + rng() * 0.9 : 0);
        }
      } else if (mode === 'box') {
        while (next < tTo) {
          const g = ended ? 0.5 : 0.7;
          for (const i of STEPS[step % 8]) note(i, next, { strict: true, gain: g, send: 0.1 });
          if (step % 8 === 7) note(GRACE, next + 0.375, { strict: true, gain: g, send: 0.1 });
          step++; next += 0.75;
        }
      } else if (mode === 'hands') {
        while (next < tTo) {
          const s = step % 8, pass = Math.floor(step / 8), slow = pass >= 2 ? 1.9 : 1, quiet = ended ? 0.8 : 1;
          const len = 1.18 * slow * (0.88 + rng() * 0.26) * (s === 3 || s === 7 ? 1.45 : 1), g = (0.62 + rng() * 0.16) * quiet, pots = STEPS[s];
          note(pots[0], next, { gain: g * (pots.length > 1 ? 0.85 : 1), growth: 2 });
          if (pots.length > 1) note(pots[1], next + 0.09 + rng() * 0.08, { gain: g, growth: 2 });                   // rolled, low hand first
          else note(pots[0], next + len * (0.46 + rng() * 0.1), { gain: g * 0.52, growth: 2, down: true });         // the second voice
          if (s === 7) note(GRACE, next + len * 0.8, { gain: g * 0.7, growth: 2 });
          step++; next += len;
        }
      }
    },
  };
}
