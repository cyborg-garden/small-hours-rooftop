// OWNER: C (audio). The night itself: one continuous graph that is never re-struck.
// City bed, wind in swells, the stairwell's room tone, far cars, the train, and birds at first light.
// Everything persistent is set from the view (state, or a recorded snapshot of it) and only acts on change,
// so jumping to any beat lands on the right night. Nights cross into each other by easing these numbers.
import { buildBed, buildWind, buildStair } from './sfx.js';

const BED = 1, STAIR = 1;
// per night: bed level, wind strength, and the band the wind travels in. Night 3 is dry: thinner, higher.
const NIGHT = [
  { bed: 1.0, wind: 1.0, lo: 300, hi: 700, every: 1.0 },
  { bed: 1.0, wind: 1.0, lo: 300, hi: 700, every: 1.0 },      // night 1
  { bed: 0.92, wind: 0.62, lo: 280, hi: 600, every: 1.25 },   // night 2: stiller
  { bed: 0.86, wind: 1.2, lo: 380, hi: 860, every: 0.85 },    // night 3: nine nights without rain
  { bed: 1.0, wind: 0.9, lo: 300, hi: 700, every: 1.0 },      // the next night, by hand
  { bed: 0.9, wind: 0.42, lo: 280, hi: 560, every: 1.5 },     // the next night, with the sensor: very still
];

export function createAmbience(engine, rng) {
  const { ctx } = engine, t0 = ctx.currentTime, out = engine.buses.amb;
  const bed = buildBed(ctx, out, t0), wind = buildWind(ctx, out, t0), stair = buildStair(ctx, out, t0);
  const cur = {};
  const set = (key, param, v, t, tau) => { if (cur[key] === v || !param) return; cur[key] = v; param.setTargetAtTime(v, t, tau); };
  let N = NIGHT[1], nextGust = t0 + 1.5, nextCar = t0 + 11 + rng() * 8, nextBird = Infinity, birds = false, birdN = 0, quiet = 1;
  return {
    apply(view, t) {
      const n = Math.max(1, Math.min(4, view.night || 1)), ended = view.beat === 'end', dawn = Math.round(((view.sky && view.sky.dawn) || 0) * 20) / 20;
      N = NIGHT[n === 4 && view.ending === 'sensor' ? 5 : n]; quiet = ended ? 0.7 : 1;
      set('bed', bed.level, +(BED * N.bed * quiet).toFixed(3), t, 1.6);
      bed.lp.forEach((p, i) => set('lp' + i, p, 210 + 150 * dawn, t, 2.5));   // the city wakes: the bed opens upward
      set('air', bed.air, +(0.03 * (1 + 1.6 * dawn)).toFixed(4), t, 2.5);
      set('wind', wind.level, +(N.wind * quiet).toFixed(3), t, 2.0);
      const open = !!(view.hatchOpen && view.lampOn);
      set('stair', stair.level, open ? STAIR : 0, t, open ? 1.2 : 0.6);
      // and the night after, by sensor, while she reads on into first light
      const b = view.beat === 'firstlight' || (view.beat === 'choice' && !view.ending) || (view.beat === 'epilogue' && view.ending === 'sensor' && ((view.sky && view.sky.dawn) || 0) > 0.12);
      if (b && !birds) nextBird = t + 3.2;
      birds = b;
    },
    // where the fixed things sit in the picture right now
    place(stairPan, fanPan, t) { set('sp', stair.pan, +stairPan.toFixed(2), t, 0.5); set('fp', bed.fanPan, +fanPan.toFixed(2), t, 0.5); },
    // schedule whatever starts before tTo
    advance(tTo) {
      while (nextGust < tTo) {
        const len = 8 + rng() * 6, side = rng() > 0.5 ? 1 : -1;
        wind.gust(nextGust, len, (0.6 + rng() * 0.7), N.lo * (0.9 + rng() * 0.2), N.hi * (0.85 + rng() * 0.3), side * (0.15 + rng() * 0.4), -side * (0.1 + rng() * 0.4));
        nextGust += len * (0.7 + rng() * 0.5) * N.every;
      }
      while (nextCar < tTo) {
        const side = rng() > 0.5 ? 1 : -1;
        engine.voice('car', { dur: 6 + rng() * 4, from: side * (0.2 + rng() * 0.4), to: -side * (0.1 + rng() * 0.4), gain: (0.5 + rng() * 0.5) * quiet }, nextCar);
        nextCar += (18 + rng() * 24) * N.every;
      }
      while (birds && nextBird < tTo) {
        engine.voice('bird', { seed: ++birdN, pan: (rng() * 2 - 1) * 0.7, gain: 0.75 + rng() * 0.5 }, nextBird);
        nextBird += 5.5 + rng() * 5.5;
      }
      if (!birds) nextBird = Infinity;
    },
    train(t, horn) { engine.voice('train', { horn, from: -0.3, to: 0.3 }, t); },   // the lights run left to right
  };
}
