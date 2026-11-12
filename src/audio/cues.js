// OWNER: C (audio). What the game says, turned into sound.
// Two inputs only: bus events (one-shots) and the view (everything that persists). The view is the live state,
// or a recorded snapshot of it when a scene is rendered offline, so both paths run this same file.
// Rule: anything that lasts (pad, tune mode, night, stair tone, scene level) is derived from the view on every
// poll and only acts on change. Events never own lasting state. That is why jumping to a beat sounds right.
import { EV } from '../core/events.js';
import { ANCHORS, BEDS, BARREL, HATCH, stairPoint } from '../core/layout.js';
import { createRng } from '../core/rng.js';
import { createEngine } from './engine.js';
import { createAmbience } from './ambience.js';
import { createMusic } from './music.js';

// Roughly where each shot looks: [x, z, distance, yaw]. Only used to place sounds left and right, so close is enough.
const LOOK = { wide: [-0.3, 1.2, 15.5, 0], shelf: [-2.2, 3.4, 9.5, 0.12], barrel: [2.4, 2.6, 11, -0.1], follow: [0, 2.6, 14, 0],
  hatch: [-3.4, 4.0, 8.5, 0.2], beds: [0, -1.2, 13, -0.08], choice: [-0.6, 3.7, 6.8, -0.14], epilogue: [-0.6, 1.4, 16.5, 0.06] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function place(view, x, z) {
  const cam = view.camera || {}, L = LOOK[cam.shot] || LOOK.wide, jo = view.jo;
  const lx = cam.shot === 'follow' && jo && jo.present ? jo.pos.x * 0.45 : L[0], lz = L[1], yaw = L[3] + (cam.yaw || 0);
  const dx = x - lx, dz = z - lz, right = dx * Math.cos(yaw) - dz * Math.sin(yaw), away = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  return { pan: clamp(right / (L[2] * 0.5), -1, 1) * 0.7, dist: 1 / (1 + Math.max(0, away) * 0.045) };
}
// The part of state that audio reads, copied, in the same shape. Recorded with every event for offline scenes.
export function snap(s) {
  return { time: s.time, beat: s.beat, beatTime: s.beatTime, night: s.night, ending: s.ending,
    jo: { present: s.jo.present, pos: { x: s.jo.pos.x, z: s.jo.pos.z }, y: s.jo.y, action: s.jo.action, target: s.jo.target, actionDur: s.jo.actionDur, book: !!s.jo.book },
    tam: { present: s.tam.present, stage: s.tam.stage, t: s.tam.t },
    marlow: { beds: s.marlow.beds.slice(), leak: s.marlow.leak, shelfSensor: s.marlow.shelfSensor, misting: s.marlow.misting },
    pots: s.pots.map((p) => ({ present: p.present, watered: p.watered, growth: p.growth })),
    hatchOpen: s.hatchOpen, lampOn: s.lampOn, stakeAsProp: s.stakeAsProp, sky: { dawn: s.sky.dawn },
    camera: { shot: s.camera.shot, yaw: s.camera.yaw }, valve: { fills: s.valve.fills, sealed: s.valve.sealed } };
}

export function createCues({ engine, ambience, music, rng }) {
  let L = {};   // edges and latches
  const fresh = (view) => ({ scene: null, choiceAt: -1e9, trainIdx: view ? Math.floor((view.time + 37.5) / 90) : 0, closing: false, filling: false, stake: view ? !!view.stakeAsProp : false, placeT: -1,
    lamp: view ? !!view.lampOn : true, lid: view ? !!view.hatchOpen : true });
  L = fresh(null);
  const at = (view, x, z, o = {}) => { const p = place(view, x, z); return { ...o, pan: p.pan, gain: (o.gain ?? 1) * p.dist }; };
  const atId = (view, id, o) => { const a = ANCHORS[id]; return a ? at(view, a.pos.x, a.pos.z, o) : (o || {}); };
  const atJo = (view, o) => at(view, view.jo.pos.x, view.jo.pos.z, o);
  const stairLp = (depth) => 4000 * Math.pow(0.1, clamp(depth, 0, 1));   // 4 kHz at the top, 400 Hz at the bottom landing
  const V = (name, o, t) => engine.voice(name, o, t);

  function handle(name, p, t, view) {
    p = p || {};
    switch (name) {
      case EV.BEGIN:
        L = fresh(view); L.scene = 1;
        engine.scene.setTargetAtTime(0, t, 0.08); engine.scene.setTargetAtTime(1, t + 0.35, 0.5);   // the whole night fades in over a second and a half
        V('dyad', { gain: 0.85 }, t + 0.45);
        break;
      case EV.MARLOW_TICK: {
        const on = view.marlow.beds.filter(Boolean).length, opening = (view.beat === 'epilogue' || /_open$/.test(view.beat)) && view.beatTime < 3.4 && on > 0 && !view.marlow.misting;
        if (opening) V('tick', at(view, BEDS[on - 1].x, BEDS[on - 1].z, { v: rng() }), t);        // one relay per bed, left to right
        else V('tick', atId(view, 'marlow', { v: rng() }), t);
        break;
      }
      case EV.MARLOW_MIST:
        if (!p.on) break;
        V('valveOpen', at(view, BEDS[1].x, BEDS[1].z + 0.5), t);
        V('mist', { ...at(view, BEDS[1].x, BEDS[1].z), pan: place(view, BEDS[1].x, BEDS[1].z).pan * 0.4 }, t + 0.1);
        if (p.shelf) {   // the thirteenth zone opens a moment after the others, nearer
          V('tick', atId(view, 'p2', { v: rng() }), t + 0.55);   // a fourth relay
          V('valveOpen', atId(view, 'p2', { gain: 0.7 }), t + 0.7);
          V('mist', atId(view, 'p2', { near: true, dur: 4.9 }), t + 0.8);
        }
        break;
      case EV.MARLOW_LINE:   // the relay, then the report. A leak line is spoken by MARLOW_LEAK instead.
        if (/^leak/.test(p.key || '')) break;
        V('blip', atId(view, 'marlow', { variant: p.key === 'epHand2' ? 'flat' : 'up' }), t + 0.2);
        engine.duck('music', 0.6, t + 0.1, 0.9);
        break;
      case EV.MARLOW_LEAK:
        V('blip', atId(view, 'marlow', { variant: ['down', 'again', 'seal'][clamp((p.count || 1) - 1, 0, 2)] }), t);
        engine.duck('music', 0.6, t, 1.0);
        break;
      case EV.JO_STEP: {
        const stair = p.surface === 'stair', depth = stair ? clamp(-(view.jo.y || 0) / HATCH.depth, 0, 1) : 0;
        V('step', atJo(view, { foot: p.foot || 0, surface: stair ? 'stair' : 'deck', who: 'jo', v: rng(), lp: stair ? stairLp(depth) : 0, gain: stair ? 1 - 0.3 * depth : 1 }), t);
        break;
      }
      case EV.TAM_STEP: {
        const depth = clamp(p.depth ?? 0.5, 0, 1), sp = stairPoint(depth);
        V('step', at(view, sp.x, sp.z, { foot: Math.round(depth * 13) % 2, surface: 'stair', who: 'tam', v: rng(), lp: stairLp(depth), gain: 1.15 - 0.2 * depth }), t);
        break;
      }
      case EV.TAM_HANDOFF: V('tray', atId(view, 'tray', { quiet: true }), t); V('clink', atId(view, 'tray', { n: 1, gain: 0.6 }), t + 0.14); break;
      case EV.TRAY_SET: V('tray', atId(view, 'p8'), t); V('clink', atId(view, 'p8'), t + 0.11); break;
      case EV.DOOR_CLOSE: V('door', at(view, HATCH.x0, 4.25), t); break;
      case EV.JO_SCOOP:
        if (p.source === 'dry') V('dry', at(view, BARREL.x, BARREL.z), t);
        else if (p.source === 'barrel') { V('scoop', at(view, BARREL.x, BARREL.z), t); V('cupRing', at(view, BARREL.x, BARREL.z), t + 1.0); }
        else if (p.source === 'bucket') V('scoop', atJo(view, { source: 'bucket', gain: 0.9 }), t);
        else if (p.source === 'valve') { V('drip', atId(view, 'valve', { f: 1250 }), t + 1.25); V('drip', atId(view, 'valve', { f: 1420, gain: 0.6 }), t + 1.62); }
        break;
      case EV.JO_POUR_START: {
        const dur = p.dur || 2.4;   // the ribbon is in the air from 18% to 82% of the pose
        V('pour', atId(view, p.pot, { dur: dur * 0.64, seed: (p.index || 0) + 1 + (view.night || 0) * 13 }), t + dur * 0.18);
        engine.duck('amb', 0.6, t + dur * 0.14, dur * 0.7, 0.2, 0.9);
        break;
      }
      case EV.JO_POUR_END: V('soil', atId(view, p.pot, { seed: (p.index || 0) + 2 }), t + 0.05); break;
      case EV.JO_POUR_EMPTY: V('drip', atId(view, p.pot, { gain: 0.8 }), t + 0.45); break;
      case EV.JO_PAGE: V('page', atJo(view, {}), t + 0.5); break;
      // her hand on the basil's leaf: its own note, the one it sang every time it was watered, once and quietly
      case EV.LEAF_TOUCH: V('potNote', atId(view, p.pot, { midi: 66, growth: 2, gain: 0.42 }), t + 0.1); break;
      case EV.POT_WATERED: {
        const pot = view.pots[p.index] || {};
        V('potNote', atId(view, p.pot, { midi: p.note, growth: pot.growth || 0, gain: 1 }), t);
        music.heard(t);
        break;
      }
      case EV.CHOICE_MADE:   // a bare fifth for the sensor, a third for the cup
        V('dyad', { notes: p.ending === 'sensor' ? [62, 69] : [62, 66], gain: 0.85 }, t + 0.05);
        L.choiceAt = view.time;
        break;
      case EV.SENSOR_SET: V('stake', atId(view, 'sensor'), t); V('blip', atId(view, 'sensor', { variant: 'wake' }), t + 0.55); break;
      default: break;
    }
  }

  // everything that lasts, from the view alone
  function poll(view, t) {
    const b = view.beat, jo = view.jo, tam = view.tam, hand = view.ending === 'hand', sensor = view.ending === 'sensor';
    ambience.apply(view, t);
    // the night closes when Jo has gone down, and after the choice; it opens again with the next beat
    let lv = 1;
    if ((b === 'n1_quiet' || b === 'n2_quiet') && jo.action === 'below' && view.beatTime > 3) lv = 0.2;
    // (after the choice: once Jo has finished with the stake, or eight seconds, whichever is first)
    const since = view.time - L.choiceAt;
    if (b === 'choice' && view.ending && since >= 4.8 && (since >= 8 || jo.action === 'idle' || jo.action === 'below')) L.closing = true;
    if (b !== 'choice') L.closing = false;
    if (L.closing) lv = 0.2;
    if (lv !== L.scene) { engine.scene.setTargetAtTime(lv, t, lv < 1 ? 0.9 : 0.8); L.scene = lv; }
    // the pad is the neighbour: it arrives with them, and comes back when the roof starts to cost something
    let pad = 0; const tamUp = tam.stage === 'top' || tam.stage === 'handoff' || tam.stage === 'leaving' || tam.stage === 'gone';
    if (b === 'turn' && tamUp) pad = 1; else if (b === 'n2_more') pad = 1; else if (b === 'n2_quiet') pad = jo.action === 'below' ? 0 : 1;
    else if (b === 'n3_water') pad = view.marlow.leak ? 0.7 : 0; else if (b === 'firstlight') pad = 1; else if (b === 'choice') pad = sensor ? 0 : 1;
    else if (b === 'epilogue' && hand) pad = tam.present && tam.stage !== 'climbing' && tam.stage !== 'below' ? 0.9 : 0;
    else if (b === 'end' && hand) pad = 0.6;
    music.setPad(pad, t);
    // the tune
    let mode = 'garden';
    // by sensor: the music box is the roof running itself. It stops when the light comes on below; once she has sat
    // down with her book the garden's own loose notes come back, as on the nights she sat there with the cup.
    if (b === 'epilogue' || b === 'end') mode = sensor ? (b === 'end' || jo.book ? 'garden' : view.lampOn ? 'off' : view.beatTime >= 4.5 ? 'box' : 'off') : (view.pots[0] && view.pots[0].watered ? 'hands' : 'off');
    music.setMode(mode, t);
    // the tap on line two runs for as long as Jo holds the cup under it
    const filling = jo.action === 'scoop' && jo.target === 'valve';
    if (filling && !L.filling) V('valveFill', at(view, ANCHORS.valve.pos.x, ANCHORS.valve.pos.z, { dur: Math.max(1.2, (jo.actionDur || 2.6) - 0.2) }), t);
    L.filling = filling;
    // the night after, by sensor: her door below, then the lid lifting back onto its stay
    if (b === 'epilogue' && sensor) {
      if (view.lampOn && !L.lamp) V('door', at(view, HATCH.x0, 4.25, { gain: 0.8 }), t);
      if (view.hatchOpen && !L.lid) V('stake', at(view, (HATCH.x0 + HATCH.x1) / 2, HATCH.z0, { gain: 0.7 }), t + 1.5);
    }
    L.lamp = !!view.lampOn; L.lid = !!view.hatchOpen;
    // the dead stake tied to the tomato
    if (view.stakeAsProp && !L.stake) V('stake', atJo(view, { gain: 0.5 }), t);
    L.stake = !!view.stakeAsProp;
    // A far train, every 90 s, in step with the lights that cross the far city (world/city.js shows them from
    // time = 38 + 90k for 45 s; the sound swells for 8 s and peaks as they pass the middle). The first sounds its horn.
    const trainIdx = Math.floor((view.time + 37.5) / 90);
    if (trainIdx !== L.trainIdx) { if (L.trainIdx != null && trainIdx > L.trainIdx && lv === 1 && b !== 'title' && b !== 'end') ambience.train(t, trainIdx === 1); L.trainIdx = trainIdx; }
    // where the hatch and the fan sit in the picture
    if (view.time - L.placeT > 0.3 || view.time < L.placeT) { L.placeT = view.time; ambience.place(place(view, HATCH.lamp.x, HATCH.lamp.z).pan, place(view, 6, -4).pan, t); }
  }
  // after a jump (a test stepping the game faster than sound): take the view as it is, without sounding its history
  function sync(view, t) { const keep = L.choiceAt; L = fresh(view); L.choiceAt = keep; L.filling = view.jo.action === 'scoop'; poll(view, t); }
  return { handle, poll, sync };
}

// The whole instrument on one context. Live play makes one; every offline measurement makes another.
export function createRig(ctx, { volume = 0.6, seed = 340, solo = null } = {}) {
  const rng = createRng((seed ^ 0xa0d10) >>> 0), engine = createEngine(ctx, { volume, solo });
  engine.scene.value = 0;
  let view = null;
  const panOfPot = (i) => (view && ANCHORS['p' + i] ? place(view, ANCHORS['p' + i].pos.x, ANCHORS['p' + i].pos.z).pan : 0);
  const ambience = createAmbience(engine, rng.fork(1)), music = createMusic(engine, rng.fork(2), panOfPot);
  const cues = createCues({ engine, ambience, music, rng: rng.fork(3) });
  return {
    engine, ambience, music, cues,
    handle(name, payload, t, v) { view = v; cues.handle(name, payload, t, v); },
    sync(v, t) { view = v; cues.sync(v, t); },
    // once per tick: lasting state, then whatever needs scheduling before the next tick
    tick(v, t) { view = v; cues.poll(v, t); ambience.advance(t + 1.5); music.advance(t + 0.25, v); engine.sweep(t); },
  };
}
