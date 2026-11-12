// OWNER: D (game). The arc: three nights and the night after, exactly as BIBLE.md section 2, and the one
// verb. Everything here advances by dt and by what the player taps, never by wall clock, so a test can
// step it and get the same game. This file decides; jo.js and tam.js move people; ui.js shows words.
import { EV } from '../core/events.js';
import { isWaterBeat } from '../core/beats.js';
import { ANCHORS, JO_START, JO_SIT, HATCH, stairPoint } from '../core/layout.js';
import { TEXT } from './script.js';

const POUR = 2.4;                                   // the pose the game is named for, held this long
const LOOKS = ['marlow', 'city', 'chair', 'hatch', 'sensor'];
const TO_HATCH = -1.2, TO_SHELF = 0.3;              // headings: toward the stair head, toward the pots
// where Jo stands to take the tray (and, the night after, to reach the bucket). The frozen tray stand is inside
// the shelf's left end; this one is clear of it, in the gap by the stair head (world's suggestion).
const HANDOFF = { x: -2.4, z: 4.1, heading: -Math.PI / 2 };   // a step back from the lip of the stairwell, facing the neighbour on the stairs: the tray hangs in the gap
const BUCKET = { x: -2.52, z: 3.95, heading: 0.0 };      // the night after: where she crouches to fill from the bucket
// the night after, by sensor: the neighbour's folding chair has been carried over from the barrel to the shelf's end,
// into the stair light, turned a little toward the pots. She sits in it. (World moves the chair to state.chairAt.)
export const CHAIR_READ = { x: -2.0, z: 3.06, heading: 0.2 };
const CHAIR_FRONT = { x: CHAIR_READ.x + Math.sin(CHAIR_READ.heading) * 0.36, z: CHAIR_READ.z + Math.cos(CHAIR_READ.heading) * 0.36, heading: CHAIR_READ.heading };
// how much the cup holds: three on the first night, while the player learns the barrel; after that she brings the
// bigger pour, so a night of twelve pots is two trips, not four. Not every pot every time still holds.
const CAP = [3, 3, 6, 5, 3];   // night three: five, so a barrel cup and a tap cup still leave a pot or two for tomorrow
export const cupCap = (night) => CAP[Math.max(0, Math.min(4, night | 0))];
const HINT_AFTER = 8.5, HINT_EVERY = 3.2;          // seconds with no input before a quiet ring says what can be tapped
const LANDING = { x: stairPoint(1).x, z: stairPoint(1).z };
// the night after, by hand: back at the stair head, close to the neighbour, for the cup held out between them
const OFFER = { x: -2.55, z: 4.12, heading: -Math.PI / 2 };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createArc({ state, bus, render, ui, jo, tam, say, fade }) {
  let cues = [], queued = null, waiting = false, leave = null, lastLook = -99, opts = { ending: 'hand' }, epi = null;
  let showValve = 0, trayWait = 0, chain = null, firstPour = false, lastUse = 0, trayHint = 0, dawnWait = 0;   // the camera on the tap; the neighbour's patience; the next pot along; the night's first pour
  let lastInput = 0, lastHint = -99, showWater = 0, waterAt = null, triedPot = false;   // the idle hint; the empty cup's glance to the water
  const J = () => state.jo, T = () => state.tam;
  const at = (t, fn) => cues.push({ t: state.beatTime + t, fn });
  const marlow = (key, hold) => { state.marlow.line = key; bus.emit(EV.MARLOW_LINE, { key }); say('marlow', TEXT.marlow[key], hold); };
  const dryPots = () => state.pots.filter((p) => p.present && !p.watered);
  const free = () => jo.free() && !queued;
  const next = () => { if (jo.free()) J().target = null; if (queued) { const q = queued; queued = null; tap(q); } };
  // hold a pose, then take the one tap that was waiting, if any
  const act = (name, dur, onEnd, mid, midAt) => jo.act(name, dur, () => { if (onEnd && onEnd() === 'hold') return; next(); }, mid, midAt);
  const headingTo = (p) => { const j = J(); return Math.atan2(p.x - j.pos.x, p.z - j.pos.z); };
  // where water is right now: the barrel while it has any, then Marlow's tap once she has found it
  const waterSource = () => { const h = state.hot; if (h.includes('barrel') && (state.barrel.scoops > 0 || !state.valve.found)) return 'barrel'; return h.includes('valve') ? 'valve' : h.includes('barrel') ? 'barrel' : null; };
  // the idle hint: the thing to tap next. Until a pot has been tried, the nearest dry pot (so a first player learns the
  // pots answer); after that, a dry pot while the cup has water and the water while it has none
  function hintTarget() {
    const j = J(), dry = dryPots().filter((p) => state.hot.includes(p.id));
    if (j.cup > 0 || (!triedPot && dry.length)) {
      if (!dry.length) return null;
      dry.sort((p, q) => Math.hypot(p.pos.x - j.pos.x, p.pos.z - j.pos.z) - Math.hypot(q.pos.x - j.pos.x, q.pos.z - j.pos.z));
      return dry[0].id;
    }
    return waterSource();
  }
  const cut = (shot) => { Object.assign(state.camera, { shot, yaw: 0, pitch: 0, zoom: 1 }); render.snap(); };   // only ever under a fade

  // ---- the one verb -------------------------------------------------------------------------------
  function tap(id) {
    const a = ANCHORS[id]; if (!a || !state.hot.includes(id)) return false;
    ui.ripple(id); lastInput = state.time; showWater = 0;
    if (a.kind === 'look' || (id === 'sensor' && state.beat !== 'choice')) {
      state.counts.looks++; lastLook = state.beatTime; bus.emit(EV.LOOK, { id });
      // a look taken while she sits out the quiet on the kerb. The night after, by sensor, this is what brings her up.
      if (state.beat === 'n1_quiet' || state.beat === 'n2_quiet') state.counts.lingered = (state.counts.lingered || 0) + 1;
      say('look', id === 'city' && state.night >= 2 ? TEXT.look.cityLate : id === 'chair' && state.night >= 3 ? TEXT.look.chairJar : TEXT.look[id]);
      return true;
    }
    if (a.kind === 'choice') return choose(id);
    if (jo.busy()) { queued = id; return true; }          // exactly one tap waits its turn
    const j = J();
    if (a.kind === 'pot') triedPot = true;
    if ((id === 'barrel' || id === 'valve') && j.cup >= (id === 'valve' ? Math.min(3, cupCap(state.night)) : cupCap(state.night))) { say('jo', TEXT.jo.full, 2.2); return true; }
    queued = null; bus.emit(EV.TAP, { id }); j.target = id; lastUse = state.time;
    if (id === 'barrel' || id === 'valve') fill(id, a); else if (a.kind === 'pot') pour(id, a); else if (id === 'tray') handoff(a);
    return true;
  }
  function fill(id, a) {
    jo.walkTo(a.stand, () => act('scoop', id === 'valve' ? 2.6 : 1.7, null, () => {
      const j = J(), b = state.barrel;
      if (id === 'barrel' && b.scoops <= 0) {             // night three: the cup scrapes the bottom
        bus.emit(EV.JO_SCOOP, { source: 'dry' }); say('jo', TEXT.jo.dry); state.valve.found = true; refreshHot();
        // the picture goes to the brass tap and she turns to look at it while her line plays: no hunting
        showValve = 8.5;
        at(2.4, () => jo.whenFree(() => jo.turnTo(headingTo(ANCHORS.valve.pos))));
        at(4.6, () => { if (!state.valve.fills && state.beat === 'n3_water') say('jo', TEXT.jo.valve); });
        return;
      }
      if (id === 'barrel') {
        // the barrel only runs out on the night it is meant to. Before that a wasted cup lowers it and no more.
        b.scoops = state.night >= 3 ? b.scoops - 1 : Math.max(1, b.scoops - 1);
        b.level = Math.max(state.night >= 3 ? 0.03 : 0.08, b.level - 0.13);
      } else {
        const n = Math.min(3, ++state.valve.fills); state.marlow.leak = true;
        at(1.9, () => { bus.emit(EV.MARLOW_LEAK, { count: n }); marlow('leak' + n); });
      }
      // Marlow's tap runs slow: three at most, as it always did, so a player who keeps going hears all three of its leak lines
      j.cup = id === 'valve' ? Math.min(3, cupCap(state.night)) : cupCap(state.night); state.counts.scoops++; bus.emit(EV.JO_SCOOP, { source: id }); refreshHot();
    }));
  }
  // she stands to the RIGHT of a pot and a little back, facing it, so the cup is in her right hand on the near side
  // of her body and the water falls in the open, beside her, not across her face
  // (the two pots nearest the shelf's end post are poured from its other side, so her arm never crosses the post)
  const potStand = (a) => { const x = a.pos.x + (a.pos.x > -0.85 ? -0.62 : 0.62), z = 3.3; return { x, z, heading: Math.atan2(a.pos.x - x, a.pos.z - z) }; };
  // the next dry pot along the shelf from this one (nearest first), for the cup to carry on to
  const nextAlong = (id) => { const a = ANCHORS[id], c = dryPots().filter((p) => p.id !== id && (state.hot.includes(p.id) || epi));
    c.sort((p, q) => Math.hypot(p.pos.x - a.pos.x, (p.pos.z - a.pos.z) * 2) - Math.hypot(q.pos.x - a.pos.x, (q.pos.z - a.pos.z) * 2)); return c.length ? c[0].id : null; };
  function pour(id, a) {
    const p = state.pots[a.index];
    jo.walkTo(potStand(a), () => {
      const j = J();
      if (p.watered) return next();
      if (j.cup <= 0) {
        bus.emit(EV.JO_POUR_EMPTY, { pot: id }); say('jo', TEXT.jo.empty, 2.2);
        // then she looks round at the water, and the picture goes with her for a moment: the barrel (or, once it is
        // dry, the brass tap) is the thing on the screen, ringed, so nobody is left hunting for an arrow
        return act('pourEmpty', 1.0, () => { if (!isWaterBeat(state.beat)) return; const w = waterSource(); if (!w) return;
          waterAt = w; showWater = 3.4; jo.turnTo(headingTo(ANCHORS[w].stand || ANCHORS[w].pos));
          at(1.0, () => { if (showWater > 0) { ui.ripple(w); ui.nudge(w); } }); at(2.2, () => { if (showWater > 0) ui.ripple(w); }); });
      }
      bus.emit(EV.JO_POUR_START, { pot: id, index: a.index, dur: POUR });
      firstPour = state.nightPours === 0;
      act('pour', POUR, () => {
        bus.emit(EV.JO_POUR_END, { pot: id, index: a.index }); firstPour = false;
        // from night two the cup goes on along the row by itself while it has water: the ritual, with fewer taps
        if (chain && !queued && (isWaterBeat(state.beat) || epi) && J().cup > 0) { const c = chain; chain = null; J().target = c; pour(c, ANCHORS[c]); return 'hold'; }
        chain = null;
      }, () => {
        j.cup--; p.watered = true; p.wet = 1; state.counts.pours++; state.nightPours++;
        bus.emit(EV.POT_WATERED, { pot: id, index: a.index, note: p.note });
        const n = Math.min(3, Math.max(1, state.night)), line = state.night > 3 ? null : TEXT.tags[a.index][n - 1];
        // night one, and the new tray on night two, is the handwriting on the tag. After that it is what she notices.
        if (line) say(n === 1 || (p.tray === 1 && n === 2) ? 'tag' : 'look', line);
        if (epi) epi.poured = (epi.poured || 0) + 1;
        // (on night two the chain stops at the third pot: that is when the footsteps come, and the rest is the cup's)
        chain = state.night >= 2 && j.cup > 0 && !(state.beat === 'n2_water' && state.nightPours >= 3) ? nextAlong(id) : null;
        refreshHot();
      }, 0.5);
    });
  }
  // the tray changes hands. Four hands on it for a moment, then two.
  function handoff(a) {
    state.hot = []; state.focus = null;
    jo.walkTo(HANDOFF, () => {
      J().cupHeld = false; tam.look('tray');
      act('take', 2.0, () => {
        const j = J(); j.carrying = true; tam.look('jo'); state.camera.shot = 'talk';
        // the pots go out onto the lower tier, and the empty tray goes back to whoever brought it: it leaves with them,
        // so nothing is left leaning in among the pots
        jo.walkTo({ x: -1.2, z: 3.15, heading: 0.1 }, () => act('place', 2.0, () => {
          // a step back from the shelf first, so the empty tray never swings through the plant tops
          jo.walkTo({ x: -1.35, z: 2.8 }, () => jo.walkTo(HANDOFF, () => { tam.look('jo'); act('give', 1.8, () => { const k = J(); k.carrying = false; k.cupHeld = true; afterHandoff(); },
            () => { J().carrying = false; T().hasTray = true; bus.emit(EV.TAM_HANDOFF, { back: true }); }, 0.6); }, 'carry'), 'carry');
          return 'hold';
        }, () => {
          state.pots.forEach((p) => { if (p.tray === 1) p.present = true; }); bus.emit(EV.TRAY_SET, {});
        }, 0.42), 'carry');
      }, () => { T().hasTray = false; tam.setStage('top'); bus.emit(EV.TAM_HANDOFF, {}); }, 0.55);
    });
  }
  function talk(lines, t0, done) {
    let t = t0;
    for (const [who, text, hold, look] of lines) { at(t, () => { say(who, text, hold - 0.25); if (look) tam.look(look); }); t += hold; }
    at(t, done);
  }
  function afterHandoff() {
    state.camera.shot = 'talk';
    at(0.5, () => jo.whenFree(() => jo.turnTo(TO_HATCH)));
    talk(TEXT.turnB, 1.0, () => {
      // the pots are hers again the moment the neighbour turns to go: no dead air with a full cup and nine dry pots
      tam.leave(); enter('n2_more'); ui.clearLine();
      at(1.4, () => jo.whenFree(() => jo.turnTo(TO_SHELF)));
      at(7.4, () => bus.emit(EV.DOOR_CLOSE, {}));
    });
  }
  // the choice. The sensor goes from its crate into the bean pot and wakes up green. Or the cup is tipped over
  // the same pot with nothing left in it, and the spare sensor's light goes out.
  function choose(id) {
    if (state.ending) return false;
    const sensor = id === 'sensor';
    state.ending = sensor ? 'sensor' : 'hand'; state.hot = []; state.focus = null; queued = null;
    bus.emit(EV.CHOICE_MADE, { ending: state.ending }); ui.clearLine();
    // the fade takes 1.8 s; the next night comes up the moment the picture is dark, with its title already on it
    const done = () => { at(2.0, () => fade(0)); at(3.9, () => enter('epilogue')); };
    jo.whenFree(() => {
      if (sensor) {
        J().target = 'sensor';
        jo.walkTo(ANCHORS.sensor.stand, () => act('plant', 2.2, done, () => { state.marlow.shelfSensor = true; bus.emit(EV.SENSOR_SET, {}); }, 0.55));
      } else {
        J().target = 'p5';
        jo.walkTo(ANCHORS.cup.stand, () => { bus.emit(EV.JO_POUR_EMPTY, { pot: 'p5' }); act('pourEmpty', 2.0, done, () => { state.stakeAsProp = true; }, 0.55); });
      }
    });
    return true;
  }

  // ---- what can be tapped right now ---------------------------------------------------------------
  function refreshHot() {
    // night two: after the third pot the footsteps are coming, and the rest of the shelf waits for them
    const b = state.beat, pots = b === 'n2_water' && state.nightPours >= 3 ? [] : dryPots().map((p) => p.id);
    if (isWaterBeat(b)) {
      // the barrel stops being offered once it is dry and the tap has been found: nothing left there to do
      const barrel = !(state.valve.found && state.barrel.scoops <= 0);
      state.hot = [...(barrel ? ['barrel'] : []), ...(state.valve.found ? ['valve'] : []), ...pots, ...LOOKS];
    } else if (b === 'n1_quiet' || b === 'n2_quiet') state.hot = [...LOOKS];
    else if (b === 'firstlight') state.hot = [...LOOKS];
    else if (b === 'choice') state.hot = state.ending ? [] : ['sensor', 'cup'];
    else if (b === 'epilogue') state.hot = [];
    else if (b !== 'turn') state.hot = [];
    if (!state.hot.includes(state.focus)) state.focus = null;
  }

  // ---- the nights ---------------------------------------------------------------------------------
  // Marlow's ritual. Three relays, then mist. The same every night.
  const ritual = (shelf, mistFor = 5.0) => {
    [2.0, 2.5, 3.0].forEach((t, i) => at(t, () => { state.marlow.beds[i] = true; bus.emit(EV.MARLOW_TICK, {}); }));
    at(3.6, () => { state.marlow.misting = true; bus.emit(EV.MARLOW_MIST, { on: true, shelf }); });
    at(3.6 + mistFor, () => { state.marlow.misting = false; bus.emit(EV.MARLOW_MIST, { on: false, shelf }); });
  };
  function openNight(n, then) {
    state.night = n; state.nightPours = 0; state.marlow.beds = [false, false, false]; state.marlow.leak = false; state.sky.dawn = 0;
    state.pots.forEach((p) => { p.watered = false; p.wet = 0; p.lift = Math.min(p.lift, 0.15); p.growth = Math.max(0, p.tray ? n - 2 : n - 1); });
    Object.assign(state.barrel, [{ scoops: 3, level: 0.8 }, { scoops: 4, level: 0.56 }, { scoops: 1, level: 0.14 }][n - 1]);
    // she is already awake, at the foot of the stairs, when the night comes up. Nobody appears out of nothing.
    cut(n === 1 ? 'beds' : n === 2 ? 'hatch' : 'barrel'); jo.place({ present: true, action: 'idle', cup: 0, cupHeld: true, carrying: false, noCup: false, book: false, page: 0, hatOff: false, hatAt: null, target: null, heading: Math.PI / 2, y: stairPoint(1).y, pos: LANDING });
    fade(1); ui.clearLine(); ritual(false);
    if (n > 1) at(0.1, () => say('time', TEXT['night' + n], 3.4));   // the title is on the dark before the roof comes up
    at(n === 1 ? 3.6 : 5.0, () => marlow('open'));
    // night one used to hold on the beds for most of twenty seconds before anyone was seen: now the camera finds her
    // in the stairwell while Marlow is still misting
    // (a tall screen goes straight to the stairwell, since its shelf shot cannot hold the stairs)
    at(n === 1 ? 3.4 : 7.5, () => { state.camera.shot = n === 1 && state.viewport.portrait ? 'hatch' : 'shelf'; });
    // she comes up out of the warm stairwell, seen in the cut section long before she is on the roof.
    // On a tall screen the shelf shot cannot hold the stairs too, so the camera goes to her while she climbs.
    if (n === 1) at(6.4, () => { if (state.viewport.portrait && J().action === 'climb') state.camera.shot = 'hatch'; });
    at(n === 1 ? 3.6 : 3.2, () => jo.climb(1, () => { if (state.camera.shot === 'hatch') state.camera.shot = 'shelf'; jo.walkTo(JO_START); }));
    if (n === 1) at(13.1, () => say('jo', TEXT.jo.open));
    if (n === 3) at(10.6, () => say('look', TEXT.look.chairJar));
    at(n === 1 ? 14.9 : 12.5, () => enter(then));
  }
  // the end of a night: Marlow's line, she goes down, the roof fades
  function closeNight(then) {
    return () => { jo.whenFree(() => jo.descend()); at(7.9, () => fade(0)); at(9.8, () => enter(then)); };
  }
  const ENTER = {
    n1_open() { openNight(1, 'n1_water'); },
    n1_water() {},
    n1_quiet() {
      state.camera.shot = 'wide'; jo.whenFree(() => jo.walkTo(JO_SIT, () => jo.sit()));
      at(1.8, () => { bus.emit(EV.MARLOW_TICK, {}); marlow('quiet1'); });
      leave = closeNight('n2_open'); lastLook = -99;
    },
    n2_open() { openNight(2, 'n2_water'); },
    n2_water() {},
    turn() {
      // footsteps below, long before Jo could see anyone. The player sees them first, in the cut section.
      tam.comeUp({ hasTray: true, bucket: false }); state.camera.shot = 'hatch'; state.hot = []; state.focus = null;
      at(2.4, () => jo.whenFree(() => jo.turnTo(TO_HATCH)));
      at(6.4, () => jo.whenFree(() => jo.walkTo({ x: -2.5, z: 3.62, heading: -1.25 })));
    },
    n2_more() {},
    n2_quiet() {
      // the same minute on the kerb as the first night, so that by the night after it is hers
      state.camera.shot = 'wide'; jo.whenFree(() => jo.walkTo(JO_SIT, () => jo.sit()));
      at(1.8, () => { bus.emit(EV.MARLOW_TICK, {}); marlow('quiet2'); });
      at(9.0, closeNight('n3_open'));
    },
    n3_open() { openNight(3, 'n3_water'); },
    n3_water() {},
    firstlight() {
      ui.clearLine(); state.camera.shot = 'choice'; jo.whenFree(() => jo.walkTo({ x: 0.98, z: 3.6, heading: -1.05 }));
      at(2.0, () => { bus.emit(EV.MARLOW_TICK, {}); marlow('sum', 5.6); });
      at(8.5, () => enter('choice'));
    },
    choice() { ui.clearLine(); bus.emit(EV.CHOICE_OPEN, {}); },
    epilogue() {
      const sensor = state.ending === 'sensor';
      state.night = 4; state.nightPours = 0; state.sky.dawn = 0; state.marlow.beds = [false, false, false]; state.marlow.leak = false;
      cut(sensor ? 'epilogueRead' : 'epilogueHand'); fade(1); ui.clearLine(); epi = { open: false, poured: 0 };
      say('time', TEXT.nextNight, 3.6);
      state.pots.forEach((p) => { p.present = true; p.growth = 2; p.watered = false; p.wet = 0; p.lift = Math.min(p.lift, 0.3); });
      if (sensor) {
        // the lid is shut, the one warm light is off, and the shelf has a dot of its own. The roof runs itself.
        // Then she comes up anyway. Three nights of watering are what bring her: no cup tonight, a book, and the
        // neighbour's folding chair already carried over to the end of the shelf, in the stair light.
        state.epilogue = 'read'; state.chairAt = { ...CHAIR_READ };
        Object.assign(state, { hatchOpen: false, lampOn: false });
        jo.place({ present: false, action: 'below', cup: 0, cupHeld: false, noCup: true, book: false, page: 0, lookUp: 0, leaf: 0, seat: null, sitK: 0, hatOff: false, hatAt: null, target: null, pos: LANDING });
        ritual(true, 6.8);
        at(4.8, () => state.pots.forEach((p) => { p.watered = true; p.wet = 0.7; }));   // the mist reaches them, and they stand
        at(5.0, () => marlow('epSensor'));
        // the lamp comes on below, the lid lifts, and she comes up: no cup, a book in her hand. She stops at the shelf,
        // looks, touches nothing, and sits in the chair. Nothing is said. The rest (the hat, the book, a page, her hand
        // on a leaf, first light, a bird, her face lifting) is in update().
        at(10.4, () => { state.lampOn = true; });
        at(11.6, () => { state.hatchOpen = true; });
        at(12.6, () => jo.climb(1, () => jo.walkTo({ x: -1.95, z: 3.25, heading: TO_SHELF }, () => {
          at(2.2, () => jo.whenFree(() => jo.walkTo(CHAIR_FRONT, () => { const j = J(); j.seat = 'chair'; j.sitK = 0; jo.sit(); epi.sitFrom = state.beatTime; })));
        })));
      } else {
        Object.assign(state, { hatchOpen: true, lampOn: true, secondCup: true }); state.valve.sealed = true; state.barrel.level = 0.03; state.barrel.scoops = 0;
        // she has kept this up. The shelf stands, except the three nearest the stairs, which are tonight's.
        state.pots.forEach((p, i) => { const done = i >= 3; p.watered = done; p.wet = done ? 0.6 : 0; p.lift = done ? 1 : Math.min(p.lift, 0.2); });
        jo.place({ present: true, action: 'idle', cup: 0, cupHeld: true, carrying: false, target: null, heading: TO_SHELF, pos: { x: -2.2, z: 3.2 } });
        ritual(false);
        at(5.0, () => marlow('epHand')); at(9.2, () => marlow('epHand2', 3.2));
        at(4.0, () => tam.comeUp({ hasTray: false, bucket: true }));
        at(7.4, () => jo.whenFree(() => jo.turnTo(TO_HATCH)));
      }
    },
    end() { state.hot = []; bus.emit(EV.END, { ending: state.ending }); ui.showEnd(true, state.ending === 'sensor' ? state.epilogue || 'read' : 'hand'); },
  };
  // the neighbour reaches the top of the stairs. On night two that is the turn; the night after, it is the bucket.
  bus.on(EV.TAM_ARRIVE, () => {
    if (state.beat === 'turn') talk(TEXT.turnA, 0.7, () => { tam.setStage('handoff'); tam.look('jo'); state.hot = ['tray']; });
    else if (state.beat === 'epilogue' && state.ending === 'hand') {
      tam.look('jo');
      at(0.5, () => say('tam', TEXT.epHandTam, 3.6));
      at(2.2, () => jo.whenFree(() => jo.walkTo(BUCKET, () => {
        // she dips the cup in the bucket the neighbour is holding. jo.dip runs 0..1..0 for world to pose, if it wants to.
        epi.dip = 0;
      })));
    }
  });

  function enter(beat) {
    const from = state.beat; state.beat = beat; state.beatTime = 0; cues = []; waiting = false; lastInput = state.time; showWater = 0;
    ENTER[beat] && ENTER[beat](); refreshHot(); bus.emit(EV.BEAT_ENTER, { beat, from });
  }
  const after = (t, beat) => { if (!waiting) { waiting = true; at(t, () => enter(beat)); } };

  function update(dt) {
    cues.sort((a, b) => a.t - b.t);
    while (cues.length && cues[0].t <= state.beatTime) cues.shift().fn();
    const b = state.beat, j = J(), done = !dryPots().length && free();
    if (isWaterBeat(b)) {
      // the camera leans in while she works the shelf and steps back when she goes for water
      const atShelf = j.pos.z > 2.5 && j.pos.x < 1.2, forWater = j.target === 'barrel' || j.target === 'valve';
      if (showValve > 0 && (!j.target || j.target === 'valve' || j.target === 'barrel')) { showValve -= dt; state.camera.shot = 'valve'; }
      else if (showWater > 0 && waterAt) { showWater -= dt; state.camera.shot = waterAt === 'valve' ? 'valve' : 'barrel'; }
      else {
        showValve = 0;
        // and closes in on the barrel once she is there, so the scoop is not a speck in the dark; leans in for the pour
        const close = state.viewport.portrait || firstPour;
        state.camera.shot = atShelf && !forWater ? (j.action === 'pour' ? (close ? 'pourClose' : 'pour') : 'shelf') : j.target === 'barrel' && j.pos.x > 2.4 ? 'barrel' : j.target === 'valve' && j.pos.z < 0.6 ? 'valve' : 'follow';
      }
    }
    // the neighbour lifts the tray toward her about seven seconds in, then every eleven: between lifts they hold it still,
    // so the tray's slow breath is the thing on the screen that says take it
    // the neighbour lifts the tray toward her two seconds in, then every six; from four seconds a chalk ring marks it, and
    // if nobody takes it by twelve, she does: the hand-off is never a wait
    // nobody has touched anything for a while: a quiet chalk ring on the next thing to tap, and its edge arrow, if it
    // has one, swells once. The same ring as the tray's. Touch screens get it too: there is no hover on a phone.
    if (isWaterBeat(b) && state.fade > 0.9 && free() && j.action === 'idle' && showValve <= 0 && showWater <= 0
      && state.time - lastInput > HINT_AFTER && state.time - lastHint > HINT_EVERY) {
      const id = hintTarget(); lastHint = state.time;
      if (id) { ui.ripple(id); ui.nudge(id); state.hint = { id, at: state.time }; }
    }
    if (b === 'turn' && state.hot.includes('tray')) {
      trayWait += dt; const c = (trayWait + 3.6) % 6; T().nudge = trayWait > 2 && c > 5.6 - 2.4 && c < 5.6 ? Math.sin(Math.PI * (c - 3.2) / 2.4) : 0;
      if (trayWait > 4 && trayWait - trayHint > 2.4) { trayHint = trayWait; ui.ripple('tray'); }
      if (trayWait > 12 && free()) tap('tray');
    }
    else { trayWait = 0; trayHint = 0; if (T().nudge) T().nudge = 0; }
    if (b === 'n1_water' && done) after(2.5, 'n1_quiet');
    // the quiet lasts as long as she is looking at things, within reason
    if (b === 'n1_quiet' && leave && ((state.beatTime > 12 && state.beatTime - lastLook > 4.5) || state.beatTime > 30)) { leave(); leave = null; }
    if (b === 'n2_water' && state.nightPours >= 3 && free()) after(1.2, 'turn');
    if (b === 'n2_more' && done) after(2.5, 'n2_quiet');
    if (b === 'n3_water') { const goal = Math.min(0.6, state.nightPours / 12 * 0.6); state.sky.dawn += Math.max(-dt * 0.03, Math.min(dt * 0.03, goal - state.sky.dawn)); 
      // dawn does not wait for every pot: once she has had a cup from the tap and poured it out (or the player has
      // stopped for a while after that), first light comes. The pots left dry are tomorrow's.
      // (she has to be standing free the whole 2.5 s: a tap in that time puts dawn back, so nobody is cut off mid-walk)
      const tapped = state.valve.fills >= 1, resting = tapped && free() && (j.cup <= 0 || state.time - lastUse > 10);
      dawnWait = resting ? dawnWait + dt : 0;
      if (done) after(2.5, 'firstlight'); else if (dawnWait > 2.5) after(0.01, 'firstlight'); }
    if (b === 'firstlight' || b === 'choice') state.sky.dawn = Math.min(0.85, state.sky.dawn + dt * 0.02);
    if (b === 'epilogue' && epi) {
      // by sensor: she lowers herself into the chair, backing the last step onto the seat
      if (epi.sitFrom != null && epi.sat == null && j.action === 'sit') {
        const k = smooth(0, 1.3, state.beatTime - epi.sitFrom); j.sitK = k;
        j.pos.x = CHAIR_FRONT.x + (CHAIR_READ.x - CHAIR_FRONT.x) * k; j.pos.z = CHAIR_FRONT.z + (CHAIR_READ.z - CHAIR_FRONT.z) * k;
        if (k >= 1) { epi.sat = state.beatTime; if (!state.reducedMotion) state.camera.shot = 'readClose'; }
      }
      // then the book opens; a little later one page turns, and her free hand goes out to the nearest leaf
      if (epi.sat != null && j.action === 'sit') {
        const since = state.beatTime - epi.sat;
        // the hat comes off and goes on the kerb beside her: not working tonight. Then the book, then one page.
        if (!j.hatOff && since > 1.0) { j.hatOff = true; j.hatAt = { x: CHAIR_READ.x + Math.cos(CHAIR_READ.heading) * 0.48, y: 0.012, z: CHAIR_READ.z - Math.sin(CHAIR_READ.heading) * 0.48, ry: 0.6 }; }   // on the deck by the chair
        if (!j.book && since > 4.0) j.book = true;
        if (since > 9.0 && (epi.pages || 0) < 1) { epi.pages = 1; epi.pageT = 0; bus.emit(EV.JO_PAGE, {}); }
        if (since > 25.0 && epi.pages < 2) { epi.pages = 2; epi.pageT = 0; bus.emit(EV.JO_PAGE, {}); }
        if (epi.pageT != null && epi.pageT < 1) { epi.pageT = Math.min(1, epi.pageT + dt / 1.8); j.page = Math.sin(Math.PI * epi.pageT); }
        // the one gesture: the page down, her right hand goes out to the basil in front of her (big enough now) and rests on a
        // leaf, the way you would touch someone's shoulder going past. Then back to the book.
        j.leaf = smooth(11.0, 12.6, since) * (1 - smooth(15.4, 17.0, since));
        if (since > 12.4 && !epi.touched) { epi.touched = true; bus.emit(EV.LEAF_TOUCH, { pot: 'p1' }); }
        // the held beat: the sky starts to pale behind the lamp, a first bird, and she looks up from the page for a while
        if (since > 13.0) state.sky.dawn = Math.min(0.4, state.sky.dawn + dt * 0.03);
        j.lookUp = smooth(17.5, 19.5, since) * (1 - smooth(22.5, 24.5, since));
        if (since > 31.0 && !epi.ended) { epi.ended = true; enter('end'); }
      }
      if (epi.dip != null && epi.dip < 1) {
        const was = epi.dip; epi.dip = Math.min(1, epi.dip + dt / 1.7); j.dip = Math.sin(Math.PI * epi.dip);
        if (was < 0.5 && epi.dip >= 0.5) { j.cup = cupCap(4); state.counts.scoops++; bus.emit(EV.JO_SCOOP, { source: 'bucket' }); }
        if (epi.dip >= 1) {
          // then the three pots, one cup, on her own. The player watches: the night after is not theirs to play.
          j.dip = 0; tam.look('pots');
          at(1.2, () => { const d = dryPots(); if (d.length && jo.free()) { j.target = d[0].id; pour(d[0].id, ANCHORS[d[0].id]); } });
        }
      }
      if (epi.poured && !epi.closing && jo.free() && !chain) {
        // the last of it: back to the stair head, close in. She holds the cup out between them, and the neighbour's hand
        // comes up under it, the way four hands were on the tray. Then the card.
        epi.closing = true; tam.look('jo');
        jo.walkTo(OFFER, () => { state.camera.shot = 'handClose'; epi.offerAt = state.beatTime; });
      }
      if (epi.offerAt != null) {
        const s = state.beatTime - epi.offerAt;
        j.offer = smooth(0.4, 1.8, s) * (1 - smooth(6.6, 7.8, s)); T().touch = smooth(1.6, 2.8, s) * (1 - smooth(5.6, 6.6, s));
        if (s > 2.4 && !epi.said) { epi.said = true; say('look', TEXT.epHandLast, 4.0); }
        if (s > 10.0 && !epi.ended) { epi.ended = true; state.pots.forEach((p) => { p.watered = true; }); j.offer = 0; T().touch = 0; enter('end'); }
      }
    }
  }
  // The canonical player. Tests and __game.goto use it; it only ever calls tap(), like a person would.
  function autopilot() {
    const b = state.beat, j = J();
    if (!free()) return;
    if (isWaterBeat(b)) {
      const dry = dryPots(); if (!dry.length || !state.hot.includes(dry[0].id)) return;
      if (j.cup > 0) tap(dry[0].id); else if (state.barrel.scoops > 0 || !state.valve.found) tap('barrel'); else tap('valve');
    } else if (b === 'n1_quiet') { if (state.beatTime - lastLook > 3.5 && state.beatTime > 5 && state.beatTime < 10) tap(lastLook < 0 ? 'marlow' : 'city'); }
    else if (b === 'turn') { if (state.hot.includes('tray')) tap('tray'); }
    else if (b === 'choice' && !state.ending) tap(opts.ending === 'sensor' ? 'sensor' : 'cup');
  }
  return {
    enter, tap, update, autopilot, refreshHot, at,
    setOptions(o) { Object.assign(opts, o); },
    reset() { cues = []; queued = null; waiting = false; leave = null; lastLook = -99; epi = null; showValve = 0; trayWait = 0; trayHint = 0; chain = null; firstPour = false; lastUse = 0; dawnWait = 0; lastInput = 0; lastHint = -99; showWater = 0; waterAt = null; triedPot = false; },
  };
}
