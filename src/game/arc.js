// OWNER: D (game). The arc: three nights and the night after, exactly as BIBLE.md section 2, and the one
// verb. Everything here advances by dt and by what the player taps, never by wall clock, so a test can
// step it and get the same game. This file decides; jo.js and tam.js move people; ui.js shows words.
import { EV } from '../core/events.js';
import { isWaterBeat } from '../core/beats.js';
import { ANCHORS, JO_START, JO_SIT, HATCH, TAM_ROOF, stairPoint } from '../core/layout.js';
import { TEXT } from './script.js';
import { TV } from '../core/surface.js';

const POUR = 1.8;                                   // the pose the game is named for, held this long
const LOOKS = ['marlow', 'city', 'chair', 'hatch', 'sensor'];
const CHOICE_ARM = 1.6;                             // the choice hears nothing until its labels can be pressed (ui.js): a press left over from the watering, or the console's button, cannot choose
const TO_HATCH = -0.9, TO_SHELF = 0.3;              // headings: toward the stair head, toward the pots
// where Jo stands to take the tray: on the open deck behind the shelf, facing the neighbour, the tray's width between
// them. Nothing is handed over a stairwell or past a post any more.
const HANDOFF = { x: TAM_ROOF.x + 1.05, z: TAM_ROOF.z, heading: -Math.PI / 2 };
// where she carries the full tray to before the picture dips: away from the shelf and back across the deck, so
// the shelf's rail post is never between the camera and the pots, lit or fading (tools/pose.mjs: carry)
const CARRY_TO = { x: HANDOFF.x + 0.4, z: HANDOFF.z - 0.6 };
const OPEN = -Math.PI / 2 + 0.85;   // talking, she stands a little open to the picture, so her face is seen under the hat
const MEET = { x: HANDOFF.x + 0.3, z: HANDOFF.z, heading: OPEN };   // where she waits for them, a step further back
const BUCKET = { x: -1.76, z: 2.18, heading: 0.12 };     // the night after: where she kneels to fill from the bucket, facing it, on its far side from the shelf; seen side on
// the night after, by sensor: the neighbour's folding chair has been carried over from the barrel to the shelf's end,
// into the stair light, turned a little toward the pots. She sits in it. (World moves the chair to state.chairAt.)
export const CHAIR_READ = { x: -1.82, z: 2.82, heading: -1.3 };   // (round ten: a step out from the shelf's end, clear of its near pot and the feed-line hoop: tools/scene.mjs readsit) turned to face the stair light (and the picture): the shelf is at her left hand
const CHAIR_FRONT = { x: CHAIR_READ.x + Math.sin(CHAIR_READ.heading) * 0.36, z: CHAIR_READ.z + Math.cos(CHAIR_READ.heading) * 0.36, heading: CHAIR_READ.heading };
// how much the cup holds: three on the first night, while the player learns the barrel; after that she brings the
// bigger pour, so a night of twelve pots is two trips, not four. Not every pot every time still holds.
const CAP = [3, 3, 6, 5, 3];   // night three: five, so a barrel cup and a tap cup still leave a pot or two for tomorrow
export const cupCap = (night) => CAP[Math.max(0, Math.min(4, night | 0))];
const HINT_AFTER = 8.5, HINT_EMPTY = 4.0, HINT_EVERY = 3.2, HINT_NEW = 2.5;
// round eleven: nobody is left standing. With an empty cup and nothing useful done for this long she goes for water
// herself; with water in the cup, she pours the nearest dry pot herself (tools/guide.mjs: stall)
const SELF_EMPTY = 6, SELF_FULL = 8.5;   // (round thirteen: 7 and 12 left a still player 13.5 s with nothing moving: tools/guide.mjs stall, cap 12)   // (HINT_NEW: once the neighbour has gone, the new pots are pointed at almost at once)
   // (with an empty cup the hint comes sooner: nobody should sit wondering where the water is)          // seconds with no input before a quiet ring says what can be tapped
const LANDING = { x: stairPoint(1).x, z: stairPoint(1).z };
// the night after, by hand: back at the stair head, close to the neighbour, for the cup held out between them
const OFFER = { x: -1.5, z: 2.2, heading: -0.75 };
const OFFER_WAY = { x: -0.95, z: 2.35, heading: -2.4 };   // the way she comes to it from the shelf: out on the open deck first (tools/scene.mjs hatface)   // (on the bucket's far side from the shelf: from the open side of the roof the two of them stand apart in the picture, the cup between them and the bucket at their feet)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createArc({ state, bus, render, ui, jo, tam, say, fade }) {
  let cues = [], queued = null, waiting = false, leave = null, lastLook = -99, opts = { ending: 'hand' }, epi = null;
  let showValve = 0, trayWait = 0, chain = null, firstPour = false, lastUse = 0, trayHint = 0, dawnWait = 0;   // the camera on the tap; the neighbour's patience; the next pot along; the night's first pour
  let lastInput = 0, lastHint = -99, triedPot = false;   // the idle hint
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
    const j = J(), dry0 = dryPots().filter((p) => state.hot.includes(p.id)), src = waterSource();
    // after the hand-over, the six new pots are the news: they are pointed at before the old ones
    const fresh = state.beat === 'n2_more' ? dry0.filter((p) => p.tray) : [], dry = fresh.length ? fresh : dry0;
    // standing by the water with an empty cup, the water is what is pointed at, first night or not
    const byWater = src && ANCHORS[src] && Math.hypot(ANCHORS[src].pos.x - j.pos.x, ANCHORS[src].pos.z - j.pos.z) < 1.8;
    if (j.cup > 0 || (!triedPot && dry.length && !byWater)) {
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
    if (a.kind === 'choice' && state.beat === 'choice' && state.beatTime < CHOICE_ARM) return false;
    // (no chalk ring on the tray: drawn in screen space it sat on the tray as it moved, a faint circle over the pots.
    // state.__trayRing puts it back, for tools/scene.mjs: ring)
    if (id !== 'tray' || state.__trayRing) ui.ripple(id); lastInput = state.time; state.hint = null; state.focusByStick = false;
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
    if (id === 'barrel' || id === 'valve') fill(id, a); else if (a.kind === 'pot') pour(id, a); else if (id === 'tray') handoff();
    return true;
  }
  function fill(id, a, shown) {
    lastUse = state.time;   // (any water moving counts as the player's night going on: tools/guide.mjs stall)
    // (when she has gone for water by herself, a ring lands on it as she gets there: next time the player knows what to tap)
    jo.walkTo(a.stand, () => { if (shown) ui.ripple(id); act('scoop', id === 'valve' ? 2.6 : 2.1, null, () => {
      const j = J(), b = state.barrel;
      if (id === 'barrel' && b.scoops <= 0) {             // night three: the cup scrapes the bottom
        bus.emit(EV.JO_SCOOP, { source: 'dry' }); say('jo', TEXT.jo.dry); state.valve.found = true; refreshHot();
        j.skyUntil = state.time + 2.8;   // (and she looks up at the sky that has not rained: her face comes out from under the brim)
        // the picture goes to the brass tap and she turns to look at it while her line plays: no hunting
        showValve = 7.0;   // (round thirteen: 8.5, and with nothing touched the night stood 13 s before water moved: tools/guide.mjs stall)
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
        at(1.9, () => { if (n === 3 && state.valve.said3) return; if (n === 3) state.valve.said3 = true; bus.emit(EV.MARLOW_LEAK, { count: n }); marlow('leak' + n); });
        // (the second cup from the tap brings the last line too, a little later: two trips hear all three)
        if (n === 2) at(5.6, () => { if ((state.beat === 'n3_water' || state.beat === 'firstlight') && !state.valve.said3) { state.valve.said3 = true; bus.emit(EV.MARLOW_LEAK, { count: 3 }); marlow('leak3'); } });
      }
      // Marlow's tap runs slow: three at most, as it always did, so a player who keeps going hears all three of its leak lines
      j.cup = id === 'valve' ? Math.min(3, cupCap(state.night)) : cupCap(state.night); state.counts.scoops++; bus.emit(EV.JO_SCOOP, { source: id }); refreshHot();
    }); });
  }
  // she stands to the RIGHT of a pot and a little back, facing it, so the cup is in her right hand on the near side
  // of her body and the water falls in the open, beside her, not across her face
  // (the two pots nearest the shelf's end post are poured from its other side, so her arm never crosses the post)
  // (half a metre along from it: near enough that she pours standing upright, not leaning out over the row)
  const potStand = (a) => { const x = a.pos.x + (a.pos.x > -0.85 ? -0.5 : 0.5), z = 3.3; return { x, z, heading: Math.atan2(a.pos.x - x, a.pos.z - z) }; };
  // the next dry pot along the shelf from this one (nearest first), for the cup to carry on to
  const nextAlong = (id) => { const a = ANCHORS[id], c = dryPots().filter((p) => p.id !== id && (state.hot.includes(p.id) || epi));
    c.sort((p, q) => Math.hypot(p.pos.x - a.pos.x, (p.pos.z - a.pos.z) * 2) - Math.hypot(q.pos.x - a.pos.x, (q.pos.z - a.pos.z) * 2)); return c.length ? c[0].id : null; };
  function pour(id, a) {
    lastUse = state.time;
    const p = state.pots[a.index];
    jo.walkTo(potStand(a), () => {
      const j = J();
      if (p.watered) return next();
      if (j.cup <= 0) {
        bus.emit(EV.JO_POUR_EMPTY, { pot: id }); say('jo', TEXT.jo.empty, 2.2);
        // she tips it, sees it is empty, and goes for water herself: to the barrel, or the brass tap once the barrel is
        // dry. Nobody is left standing with an empty cup, hunting for an arrow.
        return act('pourEmpty', 1.0, () => { if (!isWaterBeat(state.beat) || queued) return; const w = waterSource(); if (!w) return;
          J().target = w; lastUse = state.time; fill(w, ANCHORS[w], true); return 'hold'; });
      }
      bus.emit(EV.JO_POUR_START, { pot: id, index: a.index, dur: POUR });
      firstPour = state.nightPours === 0;
      act('pour', POUR, () => {
        bus.emit(EV.JO_POUR_END, { pot: id, index: a.index }); firstPour = false;
        // the cup goes on along the row by itself while it has water (from the first night): one tap, two or three pots
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
        chain = j.cup > 0 && !(state.beat === 'n2_water' && state.nightPours >= 3) ? nextAlong(id) : null;
        refreshHot();
      }, 0.5);
    });
  }
  // the tray changes hands, out on the roof. Four hands on it for a moment, then two: hers, open, under it. She turns
  // and carries it along the shelf, and the picture dips to dark for the minutes it takes to set six pots out. When it
  // comes back they are on the lower tier, and the empty tray is back in the neighbour's hands.
  function handoff() {
    state.hot = []; state.focus = null;
    jo.walkTo(HANDOFF, () => {
      tam.look('tray');
      // first the cup goes on her belt, hooked by its handle behind her right hip: both hands are about to be on the tray
      act('hang', 1.0, () => { act('take', 2.6, () => {
        tam.look('jo');
        // she carries the full tray off toward the shelf, all six pots on it in plain sight, and only then does the
        // picture dip. Nothing leaves the tray while it can be seen (tools/pose.mjs: potcount)
        jo.walkTo(CARRY_TO, null, 'carry');
        at(1.0, () => fade(0, 0.9));
        at(2.25, () => {
          state.pots.forEach((p) => { if (p.tray === 1) p.present = true; }); bus.emit(EV.TRAY_SET, {});
          // the tray stays on the roof with the pots (it is under the shelf now): the neighbour goes home with empty
          // hands, so nothing they carry can catch the stair rail or the door frame on the way down
          T().hasTray = false;
          jo.place({ present: true, action: 'idle', carrying: false, cupHeld: true, target: null, heading: OPEN, pos: HANDOFF });
          cut('meet'); fade(1, 1.3); afterHandoff();
        });
        return 'hold';
      }, () => { T().hasTray = false; J().carrying = true; tam.setStage('top'); bus.emit(EV.TAM_HANDOFF, {}); }, 0.55); return 'hold'; }, () => { J().cupHeld = false; }, 0.6);
    });
  }
  function talk(lines, t0, done) {
    let t = t0;
    for (const [who, text, hold0, look] of lines) { const hold = hold0 * 0.86; at(t, () => { say(who, text, hold - 0.25); state.speaking = { who, until: state.time + hold - 0.2 }; if (look) tam.look(look); if (look === 'tray' && state.beat === 'turn') state.camera.shot = 'take'; }); t += hold; }   // (the camera is up over the tray before it turns to her)
    at(t, done);
  }
  function afterHandoff() {
    talk(TEXT.turnB, 1.6, () => {
      // the pots are hers again the moment the neighbour turns to go: no dead air with a full cup and nine dry pots
      tam.leave(); enter('n2_more'); ui.clearLine();
      at(1.4, () => jo.whenFree(() => jo.turnTo(TO_SHELF)));
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
    cut(n === 1 ? 'beds' : n === 2 ? 'hatch' : 'barrel'); jo.place({ present: true, action: 'idle', cup: 0, cupHeld: true, carrying: false, cupGiven: 0, offer: 0, noCup: false, book: false, page: 0, hatOff: false, hatAt: null, target: null, heading: Math.PI / 2, y: stairPoint(1).y, pos: LANDING });
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
    at(n === 1 ? 14.9 : 11.0, () => enter(then));
  }
  // the end of a night: Marlow's line, she goes down, the roof fades
  function closeNight(then) {
    return () => { jo.whenFree(() => jo.descend()); at(6.6, () => fade(0)); at(8.4, () => enter(then)); };
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
      at(6.4, () => jo.whenFree(() => jo.walkTo(MEET)));
    },
    n2_more() {},
    n2_quiet() {
      // the same minute on the kerb as the first night, so that by the night after it is hers
      state.camera.shot = 'wide'; jo.whenFree(() => jo.walkTo(JO_SIT, () => jo.sit()));
      at(1.8, () => { bus.emit(EV.MARLOW_TICK, {}); marlow('quiet2'); });
      at(6.0, closeNight('n3_open'));
    },
    n3_open() { openNight(3, 'n3_water'); },
    n3_water() {},
    firstlight() {
      ui.clearLine(); state.camera.shot = 'choice'; jo.whenFree(() => jo.walkTo({ x: 0.98, z: 3.6, heading: -1.05 }));
      at(0.9, () => { bus.emit(EV.MARLOW_TICK, {}); marlow('sum', 4.2); });
      // the choice opens the moment that line has been read: nothing to tap in between, nothing to wait for
      at(5.1, () => enter('choice'));
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
        ritual(true, 3.6);
        at(4.4, () => state.pots.forEach((p) => { p.watered = true; p.wet = 0.7; }));   // the mist reaches them, and they stand
        at(4.0, () => marlow('epSensor', 3.4));
        // the lamp comes on below, the lid lifts, and she comes up: no cup, a book in her hand. She goes straight to the
        // seat and sits. Nothing is said. The rest (the hat, the book, her hand on a leaf, first light) is in update().
        at(6.0, () => { state.lampOn = true; });
        at(6.6, () => { state.hatchOpen = true; });
        at(6.9, () => jo.climb(0.5, () => { if (!state.reducedMotion) state.camera.shot = 'readClose'; jo.walkTo(CHAIR_FRONT, () => { const j = J(); j.seat = 'chair'; j.sitK = 0; jo.sit(); epi.sitFrom = state.beatTime; }); }));   // (round ten: the push-in starts as she steps off the stairs, so the sit-down itself is seen close, not from behind the shelf)
      } else {
        Object.assign(state, { hatchOpen: true, lampOn: true, secondCup: true }); state.valve.sealed = true; state.barrel.level = 0.03; state.barrel.scoops = 0;
        // she has kept this up. The shelf stands, except three in the middle of the top row, which are tonight's
        // (out of the neighbour's way: she pours them with the room to stand, not in front of him)
        state.pots.forEach((p, i) => { const done = !(i >= 3 && i <= 5); p.watered = done; p.wet = done ? 0.6 : 0; p.lift = done ? 1 : Math.min(p.lift, 0.2); });
        jo.place({ present: true, action: 'idle', cup: 0, cupHeld: true, carrying: false, cupGiven: 0, offer: 0, target: null, heading: TO_SHELF, pos: { x: -0.72, z: 2.45 } });   // (round fourteen: 23 cm further out, so as he bends to set the bucket down her hand at her side is never drawn against him: tools/pose.mjs handclear)   // (round eleven: out on the open deck, off the line from the camera to the stair head, so as he comes up her brim is never across his face: tools/scene.mjs hatface)
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
    // for the hand-over itself the camera rises: from above, all six pots on the tray are seen whichever way it turns
    // (at eye height a tray seen end on hides a row behind the other, and the pots seem to go)
    if (state.beat === 'turn') talk(TEXT.turnA, 0.7, () => { tam.setStage('handoff'); tam.look('jo'); state.hot = ['tray']; state.camera.shot = 'take'; });
    else if (state.beat === 'epilogue' && state.ending === 'hand') {
      tam.look('jo');
      at(0.5, () => { say('tam', TEXT.epHandTam, 3.6); state.speaking = { who: 'tam', until: state.time + 3.4 }; });
      at(2.2, () => jo.whenFree(() => jo.walkTo(BUCKET, () => {
        // she dips the cup in the bucket the neighbour is holding. jo.dip runs 0..1..0 for world to pose, if it wants to.
        epi.dip = 0;
      })));
    }
  });

  function enter(beat) {
    const from = state.beat; state.beat = beat; state.beatTime = 0; cues = []; waiting = false; lastInput = state.time;
    ENTER[beat] && ENTER[beat](); refreshHot(); bus.emit(EV.BEAT_ENTER, { beat, from });
  }
  const after = (t, beat) => { if (!waiting) { waiting = true; at(t, () => enter(beat)); } };

  // the console has one stick and one button. The stick walks the focus; left alone, the focus rests on the next
  // thing worth using, so the button by itself plays the night. Never at the choice: that one has to be picked.
  function restFocus() {
    if (state.beat === 'choice') return;
    if (state.focusByStick && state.hot.includes(state.focus)) return;   // the player put it here: it stays until they use it
    state.focusByStick = false;
    const list = state.hot.filter((id) => ANCHORS[id] && ANCHORS[id].kind !== 'look' && ANCHORS[id].kind !== 'alias' && ANCHORS[id].kind !== 'choice');
    if (!list.length) { state.focus = null; return; }
    // while she is on her way to something, the ring stays on it: a second press must never send her somewhere else
    // (a pot she went to with an empty cup does not count: the water is next)
    const going = J().target, held = list.includes(going) && (ANCHORS[going].kind !== 'pot' || J().cup > 0), h = held ? going : isWaterBeat(state.beat) ? hintTarget() : null;
    state.focus = list.includes(h) ? h : list.includes(state.focus) ? state.focus : list[0];
  }

  function update(dt) {
    cues.sort((a, b) => a.t - b.t);
    while (cues.length && cues[0].t <= state.beatTime) cues.shift().fn();
    if (TV) restFocus();
    const b = state.beat, j = J(), done = !dryPots().length && free();
    if (isWaterBeat(b)) {
      // the camera leans in while she works the shelf and steps back when she goes for water
      const atShelf = j.pos.z > 2.5 && j.pos.x < 1.2, forWater = j.target === 'barrel' || j.target === 'valve';
      if (showValve > 0 && (!j.target || (j.target === 'valve' && j.pos.z >= 0.6) || j.target === 'barrel')) {   // (and once she is nearly at the tap, the tap shot proper)
        showValve -= dt; state.camera.shot = state.viewport.portrait ? 'valve' : 'valveLook'; }   // (round fifteen: on a wide screen the tap shot sat at her back)
      else {
        showValve = 0;
        // and closes in on the barrel once she is there, so the scoop is not a speck in the dark; leans in for the pour
        const close = state.viewport.portrait || firstPour;
        // (on a phone, once the barrel is dry, the tap shot holds while she needs it: from there she stands by the barrel
        // in the near ground and the brass tap is in the middle of the picture. The follow shot lost it off the edge.)
        const needTap = state.viewport.portrait && !atShelf && (j.target === 'valve' || (!j.target && j.cup <= 0 && waterSource() === 'valve'));
        state.camera.shot = atShelf && !forWater ? (j.action === 'pour' ? (close ? 'pourClose' : 'pour') : 'shelf') : j.target === 'barrel' && j.pos.x > 2.4 ? 'barrel' : (j.target === 'valve' && j.pos.z < 0.6) || needTap ? 'valve' : 'follow';
      }
      // with an empty cup, or on her way for water, the following camera holds her AND the water in the picture: on a
      // phone the tap by the beds or the barrel was off the edge, and the player hunted for it (tools/scene.mjs: source)
      const src = forWater ? j.target : j.cup <= 0 && !showValve ? waterSource() : null;
      state.camera.lookTo = src && ANCHORS[src] ? ANCHORS[src].pos : null;
    }
    // the neighbour lifts the tray toward her about seven seconds in, then every eleven: between lifts they hold it still,
    // so the tray's slow breath is the thing on the screen that says take it
    // the neighbour lifts the tray toward her two seconds in, then every six; from four seconds a chalk ring marks it, and
    // if nobody takes it by twelve, she does: the hand-off is never a wait
    // nobody has touched anything for a while: a quiet chalk ring on the next thing to tap, and its edge arrow, if it
    // has one, swells once. The same ring as the tray's. Touch screens get it too: there is no hover on a phone.
    if (isWaterBeat(b) && state.fade > 0.9 && free() && j.action === 'idle' && showValve <= 0
      && state.time - lastInput > (b === 'n2_more' && state.beatTime < 20 ? HINT_NEW : j.cup > 0 ? HINT_AFTER : HINT_EMPTY) && state.time - lastHint > HINT_EVERY) {
      const id = hintTarget(); lastHint = state.time;
      // the ring, and the paper chevron standing over the thing (ui.js: wanted) until the next tap
      if (id) { ui.ripple(id); ui.nudge(id); state.hint = { id, at: state.time }; }
    }
    // and if the hints were not enough (or the player is tapping pots that have had their water), she gets on with it
    if (isWaterBeat(b) && state.fade > 0.9 && free() && j.action === 'idle' && showValve <= 0 && !state.__noSelf && Math.min(state.time - lastUse, state.beatTime) > (j.cup > 0 ? SELF_FULL : SELF_EMPTY)) {
      const id = hintTarget(), a = id && ANCHORS[id];
      if (a && (a.kind === 'pot' ? j.cup > 0 : j.cup <= 0) && dryPots().some((p) => state.hot.includes(p.id))) { lastUse = state.time; j.target = id; if (a.kind === 'pot') pour(id, a); else fill(id, a, true); }
      else lastUse = state.time;
    }
    if (b === 'turn' && state.camera.shot === 'hatch' && T().stage === 'out') state.camera.shot = 'meet';   // the neighbour steps out onto the roof: the picture goes with them
    if (b === 'epilogue' && state.ending === 'hand' && T().present && T().stage === 'out' && state.camera.shot === 'epilogueHand') state.camera.shot = 'bucket';
    if (b === 'turn' && state.hot.includes('tray')) {
      trayWait += dt; const c = (trayWait + 3.6) % 6; T().nudge = trayWait > 2 && c > 5.6 - 2.4 && c < 5.6 ? Math.sin(Math.PI * (c - 3.2) / 2.4) : 0;
      if (trayWait > 4 && trayWait - trayHint > 2.4) { trayHint = trayWait; state.trayHint = true; if (state.__trayRing) ui.ripple('tray'); }   // (the paper chevron over it, not a ring on it: ui.js wanted)
      if (trayWait > 8 && free()) tap('tray');
    }
    else { trayWait = 0; trayHint = 0; state.trayHint = false; if (T().nudge) T().nudge = 0; }
    if (b === 'n1_water' && done) after(2.5, 'n1_quiet');
    // the quiet lasts as long as she is looking at things, within reason
    if (b === 'n1_quiet' && leave && ((state.beatTime > 7 && state.beatTime - lastLook > 3.5) || state.beatTime > 20)) { leave(); leave = null; }
    if (b === 'n2_water' && state.nightPours >= 3 && free()) after(1.2, 'turn');
    if (b === 'n2_more' && done) after(2.5, 'n2_quiet');
    if (b === 'n3_water') { const goal = Math.min(0.6, state.nightPours / 12 * 0.6); state.sky.dawn += Math.max(-dt * 0.03, Math.min(dt * 0.03, goal - state.sky.dawn)); 
      // dawn does not wait for every pot: once she has had a cup from the tap and poured it out (or the player has
      // stopped for a while after that), first light comes. The pots left dry are tomorrow's.
      // (she has to be standing free the whole 2.5 s: a tap in that time puts dawn back, so nobody is cut off mid-walk)
      const tapped = state.valve.fills >= 1, resting = tapped && free() && (j.cup <= 0 || state.time - lastUse > 10);
      dawnWait = resting ? dawnWait + dt : 0;
      if (done) after(2.5, 'firstlight'); else if (dawnWait > 1.2) after(0.01, 'firstlight'); }
    if (b === 'firstlight' || b === 'choice') state.sky.dawn = Math.min(0.85, state.sky.dawn + dt * 0.02);
    if (b === 'epilogue' && epi) {
      // by sensor: she lowers herself into the chair, backing the last step onto the seat
      if (epi.sitFrom != null && epi.sat == null && j.action === 'sit') {
        const k = smooth(0, 1.3, state.beatTime - epi.sitFrom); j.sitK = k;
        j.pos.x = CHAIR_FRONT.x + (CHAIR_READ.x - CHAIR_FRONT.x) * k; j.pos.z = CHAIR_FRONT.z + (CHAIR_READ.z - CHAIR_FRONT.z) * k;
        if (k >= 1) epi.sat = state.beatTime;
      }
      // then the book opens; a little later one page turns, and her free hand goes out to the nearest leaf
      if (epi.sat != null && j.action === 'sit') {
        const since = state.beatTime - epi.sat;
        // the hat comes off and goes on the deck by her right foot, clear of the seat: not working tonight. Then the book opens.
        if (!j.hatOff && since > 0.2) { j.hatOff = true; const h = CHAIR_READ.heading; j.hatAt = { x: CHAIR_READ.x + Math.sin(h) * 0.5 + Math.cos(h) * 0.5, y: 0.012, z: CHAIR_READ.z + Math.cos(h) * 0.5 - Math.sin(h) * 0.5, ry: 0.6 }; }   // (round twelve: 15 cm further forward, past her knee, so her sleeve clears the seat's edge on the way down: tools/clash.mjs)   // (round ten: on the shelf side, so her arm is never behind the open lid)   // (beside the chair, not in front: on its way down it never passes between the camera and the book in her lap)
        if (!j.book && since > 1.6) j.book = true;
        // the one clear beat, and nothing else: the sky pales and a first bird sings; she looks up from the page at it, a
        // long moment, and goes back to her book. Nobody needed her up here tonight. She came anyway.
        if (since > 4.0) state.sky.dawn = Math.min(0.4, state.sky.dawn + dt * 0.08);
        if (since > 6.2 && !epi.touched) { epi.touched = true; bus.emit(EV.LEAF_TOUCH, { pot: 'p1' }); }
        j.leaf = 0; j.lookUp = smooth(7.0, 7.9, since) * (1 - smooth(10.0, 11.0, since));   // one glance, then back to the page
        if (since > 17.0 && !epi.ended) { epi.ended = true; enter('end'); }
      }
      if (epi.dip != null && epi.dip < 1) {
        const was = epi.dip; epi.dip = Math.min(1, epi.dip + dt / 2.6); j.dip = Math.sin(Math.PI * epi.dip);
        if (was < 0.5 && epi.dip >= 0.5) { j.cup = cupCap(4); state.counts.scoops++; bus.emit(EV.JO_SCOOP, { source: 'bucket' }); }
        if (epi.dip >= 1) {
          // then the three pots, one cup, on her own. The player watches: the night after is not theirs to play.
          j.dip = 0; tam.look('pots');
          at(1.2, () => { const d = dryPots(); if (d.length && jo.free()) { j.target = d[0].id; pour(d[0].id, ANCHORS[d[0].id]); } });
        }
      }
      // her three pots: the picture goes in to the shelf with her, so the water is seen, and comes back out for the cup
      if (state.ending === 'hand' && (j.action === 'pour' || (j.action === 'walk' && /^p\d/.test(j.target || ''))) && !epi.closing && state.camera.shot === 'bucket') state.camera.shot = 'pour';   // (round eleven: from the moment she sets off: from the bucket shot her walk to the shelf passes in front of his face)
      if (epi.poured && !epi.closing && jo.free() && !chain) {
        // the last of it: back to the stair head, close in. She holds the cup out between them, and the neighbour's hand
        // comes up under it, the way four hands were on the tray. Then the card.
        epi.closing = true; tam.look('jo');
        state.camera.shot = 'handClose'; jo.walkTo(OFFER_WAY, () => jo.walkTo(OFFER, () => { epi.offerAt = state.beatTime; }));   // (round eleven: round by the open deck, never between the camera and his face)
      }
      if (epi.offerAt != null) {
        // she holds the cup out; the neighbour's open hand comes up under it, and the two of them hold it there, through
        // the last line and under the card. It stays hers (round twelve).
        const s = state.beatTime - epi.offerAt, t = T();
        j.offer = smooth(0.4, 1.8, s); t.touch = smooth(1.6, 2.8, s);
        if (s > 2.4 && !epi.said) { epi.said = true; say('look', TEXT.epHandLast, 4.0); }
        if (s > 7.4 && !epi.ended) { epi.ended = true; state.pots.forEach((p) => { p.watered = true; }); enter('end'); }
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
  // a tap on a pot that has had its water tonight: she says so, and the next thing to tap is pointed at at once
  let spentAt = -99;
  function spent(id) {
    if (!isWaterBeat(state.beat) || state.fade < 0.9) return;
    if (state.time - spentAt > 2.5) say('jo', TEXT.jo.had, 2.0); spentAt = state.time;
    const h = hintTarget(); if (h) { ui.ripple(h); ui.nudge(h); state.hint = { id: h, at: state.time }; lastHint = state.time; }
  }
  return {
    enter, tap, update, autopilot, refreshHot, at, spent,
    setOptions(o) { Object.assign(opts, o); },
    reset() { cues = []; queued = null; waiting = false; leave = null; lastLook = -99; epi = null; showValve = 0; trayWait = 0; trayHint = 0; chain = null; firstPour = false; lastUse = 0; dawnWait = 0; lastInput = 0; lastHint = -99; triedPot = false; spentAt = -99; },
  };
}
