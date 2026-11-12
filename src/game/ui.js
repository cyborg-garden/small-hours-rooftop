// OWNER: D (game). Everything on screen that is not the picture: the title card, one line of text, two
// paper labels at the end, an edge arrow, a sound toggle, the end card. Built by script so the export
// stays title + style + canvas + script. Paper and paint come from brush.js; nothing here is an image file.
import { EV } from '../core/events.js';
import { ANCHORS } from '../core/layout.js';
import { isWaterBeat } from '../core/beats.js';
import { TEXT } from './script.js';
import { drawTitle } from './title.js';
import { paperSheet, washPlate, chevron } from './brush.js';

const el = (tag, cls, text, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (parent) parent.appendChild(e); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// seconds a line stays up, and the least it must be shown before another may replace it
const holdFor = (text) => Math.max(3.2, text.length * 0.078);
const LOCK = { marlow: 3.8, tam: 1.6, jo: 1.6, tag: 1.5, look: 1.2, time: 1.0 };

export function createUI({ state, bus, render, audio, input, onBegin, onAgain, onTap }) {
  const root = el('div'); root.id = 'sh-ui'; document.body.appendChild(root);
  const css = (k, v) => root.style.setProperty(k, v);
  css('--paper', paperSheet('#EFE6D2', 128, 3)); css('--wash', washPlate('#171925', 720, 132, 11, 0.82)); css('--chev', chevron(88, 5));

  // a button pressed with a mouse or a finger must not keep the keyboard: Enter belongs to the roof again
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

  // drawn marks that follow things in the picture: the strings on the two labels, the ring a tap leaves, keyboard focus
  root.insertAdjacentHTML('beforeend', '<svg class="fx" aria-hidden="true"></svg>');
  const fx = root.querySelector('svg.fx');
  const svg = (tag, cls) => { const n = document.createElementNS(fx.namespaceURI, tag); if (cls) n.setAttribute('class', cls); fx.appendChild(n); return n; };
  const strings = { sensor: svg('path', 'string'), cup: svg('path', 'string') }, knots = { sensor: svg('circle', 'knot'), cup: svg('circle', 'knot') };
  for (const k of ['sensor', 'cup']) knots[k].setAttribute('r', '3.4');
  const focusRing = svg('circle', 'focus'), rings = [svg('circle', 'ring'), svg('circle', 'ring'), svg('circle', 'ring')].map((n) => ({ n, t: 9, x: 0, y: 0, r: 20 }));

  // one line at a time, lower third. Two elements so one line can leave while the next arrives.
  const cap = el('div', 'cap', '', root); cap.setAttribute('role', 'status'); cap.setAttribute('aria-live', 'polite');
  const lines = [el('p', 'line', '', cap), el('p', 'line', '', cap)]; let cur = 0, lineTimer = 0, lockTimer = 0, pending = null;
  const timecard = el('p', 'timecard', '', root); let timeTimer = 0;

  // title card
  const title = el('div', 'card title on', '', root);
  const head = el('div', 'head', '', title), lettering = el('canvas', 'lettering', '', head); lettering.setAttribute('role', 'img'); lettering.setAttribute('aria-label', TEXT.title);
  el('p', 'sub', TEXT.sub, head);
  const foot = el('div', 'foot', '', title);
  const begin = el('button', 'begin ptag', '', foot); el('span', '', TEXT.begin, begin); el('p', 'small', TEXT.hint, foot);
  begin.addEventListener('click', () => onBegin());

  // end card: the picture stays, with what the record says and what it does not
  const end = el('div', 'card end', '', root);
  const endHead = el('div', 'head', '', end), endLettering = el('canvas', 'lettering', '', endHead); endLettering.setAttribute('role', 'img'); endLettering.setAttribute('aria-label', TEXT.title);
  const endFoot = el('div', 'foot', '', end), ledger = el('div', 'ledger', '', endFoot);
  const again = el('button', 'again ptag', '', endFoot); el('span', '', TEXT.again, again); el('p', 'small', TEXT.credit, endFoot);
  again.addEventListener('click', () => onAgain()); again.disabled = true;

  // the two labels of the choice. They are the owner's words and the only words in the game that can be pressed.
  const choices = { sensor: el('button', 'choice ptag off', '', root), cup: el('button', 'choice ptag off', '', root) };
  el('span', '', TEXT.choiceSensor, choices.sensor); el('span', '', TEXT.choiceHand, choices.cup);
  for (const id of ['sensor', 'cup']) { choices[id].addEventListener('click', () => onTap(id, null)); choices[id].disabled = true; }
  let choiceSize = null;

  const arrows = new Map();
  const nudges = new Map();   // id -> seconds left of an arrow's one swell
  const snd = el('button', 'snd', '', root); el('i', '', '', snd); const sndText = el('span', '', TEXT.sound, snd);
  const setMuted = (m) => { try { audio.setMuted(m); } catch (_) {} state.muted = m; snd.classList.toggle('off', m); sndText.textContent = m ? TEXT.soundOff : TEXT.sound; snd.setAttribute('aria-pressed', m ? 'false' : 'true'); try { localStorage.setItem('small-hours-muted', m ? '1' : '0'); } catch (_) {} };
  snd.addEventListener('click', () => setMuted(!state.muted));
  try { if (localStorage.getItem('small-hours-muted') === '1') setMuted(true); } catch (_) {}

  function show(kind, text, hold) {
    if (kind === 'time') { timecard.textContent = text; timecard.classList.add('on'); timeTimer = hold || 3; return; }
    lines[cur].classList.remove('on'); cur = 1 - cur;
    const n = lines[cur]; n.textContent = text; n.className = 'line on ' + kind;
    state.text.line = text; state.text.kind = kind;
    lineTimer = hold || holdFor(text); lockTimer = Math.min(lineTimer, LOCK[kind] || 1.4);
  }
  bus.on(EV.TEXT, ({ kind, text, hold }) => {
    if (kind === 'time' || lockTimer <= 0 || !state.text.line) return show(kind, text, hold);
    // the line on screen has not had its time yet. Marlow is never talked over by a plant tag.
    if (pending && pending.kind === 'marlow' && kind !== 'marlow') return;
    pending = { kind, text, hold, beat: state.beat };
  });

  // lettering is repainted to fit whenever the screen changes shape
  let sized = '';
  function layout() {
    const w = window.innerWidth, h = window.innerHeight, key = w + 'x' + h; if (key === sized) return; sized = key;
    const tall = h > w * 1.05; root.classList.toggle('tall', tall); root.classList.toggle('short', h < 480);
    const tw = tall ? Math.min(w * 0.86, 460) : Math.min(w * 0.74, 980, h * 2.6), th = tall ? tw * 0.6 : tw * 0.165;
    drawTitle(lettering, Math.round(tw), Math.round(th), tall ? ['SMALL', 'HOURS'] : ['SMALL HOURS'], { seed: 4 });
    const ew = tall ? Math.min(w * 0.62, 300) : Math.min(w * 0.34, 420);
    drawTitle(endLettering, Math.round(ew), Math.round(ew * 0.165), ['SMALL HOURS'], { seed: 4 });
    choiceSize = null;
  }
  layout(); window.addEventListener('resize', layout);

  const seen = (id, m = 24) => { const p = render.project(input.where(id)); return p.on && !p.behind && p.x > m && p.x < state.viewport.w - m && p.y > m && p.y < state.viewport.h - m; };
  const seenWell = (id) => seen(id, 90);
  // Which things out of frame get an arrow: only the one that applies now. An empty cup points at water,
  // a full one at the shelf. The whole shelf shares one arrow.
  function wanted() {
    const s = state, out = [];
    if (!s.begun || s.beat === 'choice' || s.beat === 'end') return out;
    const pots = s.hot.filter((id) => ANCHORS[id] && ANCHORS[id].kind === 'pot');
    if (isWaterBeat(s.beat) || pots.length) {
      if (s.jo.cup > 0) { if (pots.length && !pots.some(seenWell)) out.push(pots.find(seen) || pots[0]); }
      else {
        const src = s.hot.includes('valve') && s.barrel.scoops <= 0 ? 'valve' : s.hot.includes('barrel') ? 'barrel' : null;
        // the tap is small and the barrel is dry: the one place a first night-three could strand someone. It is
        // always marked (at the edge when out of frame, standing over it when in frame) unless the camera is on it.
        if (src && (!seen(src) || (src === 'valve' && s.camera.shot !== 'valve' && !(s.jo.target === 'valve')))) out.push(src);
      }
    }
    if (s.hot.includes('tray') && !seen('tray')) out.push('tray');
    return out;
  }
  function placeChoices() {
    const W = state.viewport.w, H = state.viewport.h, S = render.project(input.where('sensor')), C = render.project(input.where('cup'));
    if (!choiceSize) choiceSize = { ws: choices.sensor.offsetWidth, hs: choices.sensor.offsetHeight, wc: choices.cup.offsetWidth, hc: choices.cup.offsetHeight };
    const { ws, hs, wc, hc } = choiceSize, m = 12, floor = H - Math.max(96, H * 0.13);
    // by hand: above the cup, leaning left. sensor: below the crate, leaning right. Each on a string to its object.
    // the hand label sits clear above her hat, never over her face
    const lift = Math.max(78, render.pxPerMetre(input.where('cup')) * 0.78 + 26);
    const topFor = (x, w) => (x + w / 2 > W - 160 ? 78 : 58);   // never under the sound toggle
    let cx = clamp(C.x - wc * 0.2, m + wc / 2, W - m - wc / 2), cy = Math.max(topFor(C.x, wc) + hc / 2, C.y - lift - hc / 2);
    let sx = clamp(S.x + ws * 0.24, m + ws / 2, W - m - ws / 2), sy = S.y + 62 + hs / 2, below = true;
    if (sy + hs / 2 > floor) { sy = S.y - 64 - hs / 2; below = false; }
    // never one label on the other: slide them apart sideways if the screen has the room, else up and down
    const ox = (wc + ws) / 2 + 12 - Math.abs(cx - sx), oy = (hc + hs) / 2 + 10 - Math.abs(cy - sy);
    if (ox > 0 && oy > 0) {
      const sgn = cx <= sx ? 1 : -1;
      const roomC = sgn > 0 ? cx - (m + wc / 2) : (W - m - wc / 2) - cx, roomS = sgn > 0 ? (W - m - ws / 2) - sx : sx - (m + ws / 2);
      if (roomC + roomS >= ox) { const a = Math.min(roomC, Math.max(ox / 2, ox - roomS)); cx -= sgn * a; sx += sgn * (ox - a); }
      else { const up = cy <= sy ? 1 : -1, a = Math.min(oy, Math.max(0, up > 0 ? cy - (58 + hc / 2) : floor - hc / 2 - cy)); cy -= up * a; sy += up * (oy - a); }
    }
    const put = (b, x, y) => { b.style.left = x.toFixed(1) + 'px'; b.style.top = y.toFixed(1) + 'px'; };
    put(choices.cup, cx, cy); put(choices.sensor, sx, sy);
    const string = (id, x0, y0, o) => {
      const dx = o.x - x0, dy = o.y - y0, d = Math.hypot(dx, dy) || 1, x1 = o.x - (dx / d) * 9, y1 = o.y - (dy / d) * 9;
      strings[id].setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${((x0 + x1) / 2 + dy * 0.12).toFixed(1)} ${((y0 + y1) / 2 - dx * 0.12).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`);
      knots[id].setAttribute('cx', o.x.toFixed(1)); knots[id].setAttribute('cy', o.y.toFixed(1));
    };
    string('cup', clamp(C.x, cx - wc * 0.4, cx + wc * 0.4), cy + hc / 2 - 2, C);
    string('sensor', clamp(S.x, sx - ws * 0.4, sx + ws * 0.4), below ? sy - hs / 2 + 2 : sy + hs / 2 - 2, S);
  }

  return {
    root, setMuted, layout,
    toggleMute() { setMuted(!state.muted); },
    showTitle(on) { title.classList.toggle('on', on); begin.disabled = !on; },
    showEnd(on, ending) {
      if (on) {
        ledger.textContent = '';
        (TEXT.end[ending] || TEXT.end.hand).forEach((s, i) => { const k = s.indexOf(': '), row = el('p', i ? 'off' : 'rec', '', ledger); el('b', '', s.slice(0, k), row); el('span', '', s.slice(k + 2), row); });
      }
      // she came up anyway: the one card that is warm, the colour of the stair lamp, and slower to arrive
      if (on) end.classList.toggle('kept', ending === 'read');
      end.classList.toggle('on', on); again.disabled = !on;
    },
    clearLine() { lineTimer = 0; lockTimer = 0; pending = null; lines.forEach((l) => l.classList.remove('on')); state.text.line = null; state.text.kind = null; timeTimer = 0; timecard.classList.remove('on'); },
    // a tap leaves a chalk ring on the thing it touched, so a finger knows it landed
    ripple(id, at) {
      const p = id && ANCHORS[id] ? render.project(input.where(id)) : at; if (!p || (p.on === false)) return;
      const r = rings.reduce((a, b) => (b.t > a.t ? b : a)); r.t = 0; r.x = p.x; r.y = p.y; r.r = id && ANCHORS[id] ? Math.min(46, input.radiusOf(id, input.where(id))) : 14;
    },
    // the idle hint and the empty cup: the edge arrow for this thing, if it is showing, swells once and settles
    nudge(id) { nudges.set(id, 1.6); },
    // what is on screen and where, for tests: [{ name, x, y, w, h }]
    rects() {
      const out = [], add = (name, n) => { const b = n.getBoundingClientRect(); if (b.width > 0) out.push({ name, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }); };
      if (lines[cur].classList.contains('on')) add('line', lines[cur]); if (timecard.classList.contains('on')) add('timecard', timecard);
      if (title.classList.contains('on')) { add('title', lettering); add('sub', head.querySelector('.sub')); add('begin', begin); add('hint', foot.querySelector('.small')); }
      if (end.classList.contains('on')) { add('endTitle', endLettering); add('ledger', ledger); add('again', again); add('credit', endFoot.querySelector('.small')); }
      for (const id of ['sensor', 'cup']) if (choices[id].classList.contains('on')) add('choice:' + id, choices[id]);
      for (const [id, b] of arrows) if (b.classList.contains('on')) add('arrow:' + id, b);
      add('sound', snd); return out;
    },
    update(dt) {
      if (lockTimer > 0) lockTimer -= dt;
      if (pending && pending.beat !== state.beat) pending = null;
      if (pending && lockTimer <= 0) { const p = pending; pending = null; show(p.kind, p.text, p.hold); }
      if (lineTimer > 0) { lineTimer -= dt; if (lineTimer <= 0) { lines[cur].classList.remove('on'); state.text.line = null; state.text.kind = null; } }
      if (timeTimer > 0) { timeTimer -= dt; if (timeTimer <= 0) timecard.classList.remove('on'); }

      const choosing = state.beat === 'choice' && !state.ending;
      for (const id of ['sensor', 'cup']) {
        const c = choices[id]; c.classList.toggle('on', choosing); c.classList.toggle('off', !choosing); c.disabled = !choosing;
        c.classList.toggle('focus', choosing && input.keyboard && state.focus === id);
      }
      fx.classList.toggle('choosing', choosing);
      if (choosing) placeChoices();

      const want = wanted(), W = state.viewport.w, H = state.viewport.h;
      for (const id of want) {
        let b = arrows.get(id);
        if (!b) { b = el('button', 'arrow off', '', root); el('i', '', '', b); b.setAttribute('aria-label', id); b.addEventListener('click', () => onTap(id, null)); arrows.set(id, b); }
        const p = render.project(input.where(id)), m = 30, onScreen = p.on && !p.behind && p.x > m && p.x < W - m && p.y > 92 && p.y < H - Math.max(150, H * 0.2);
        const x = clamp(p.x, m, W - m), y = onScreen ? Math.max(92, p.y - 46) : clamp(p.y, 92, H - Math.max(150, H * 0.2));
        b.style.left = x.toFixed(1) + 'px'; b.style.top = y.toFixed(1) + 'px';
        b.firstChild.style.transform = `rotate(${Math.atan2(p.y - y, p.x - x).toFixed(3)}rad)`;
      }
      for (const [id, b] of arrows) { const on = want.includes(id); b.classList.toggle('on', on); b.classList.toggle('off', !on); b.disabled = !on; }
      for (const [id, t] of nudges) { const left = t - dt; if (left <= 0) nudges.delete(id); else nudges.set(id, left); }
      for (const [id, b] of arrows) b.classList.toggle('nudge', nudges.has(id) && want.includes(id));

      // keyboard focus: a dashed chalk ring, only while the keyboard is in use
      const f = input.keyboard && state.focus && state.hot.includes(state.focus) && !choosing ? state.focus : null;
      focusRing.classList.toggle('on', !!f);
      if (f) { const pos = input.where(f), p = render.project(pos); focusRing.setAttribute('cx', p.x.toFixed(1)); focusRing.setAttribute('cy', p.y.toFixed(1)); focusRing.setAttribute('r', (input.radiusOf(f, pos) * 0.8 + 4).toFixed(1)); }
      for (const r of rings) {
        if (r.t > 1) { if (r.on) { r.n.setAttribute('opacity', '0'); r.on = false; } continue; }
        r.t += dt / 0.75; r.on = true; const e = 1 - Math.pow(1 - Math.min(1, r.t), 3), grow = state.reducedMotion ? 1 : 0.45 + 0.55 * e;
        r.n.setAttribute('cx', r.x.toFixed(1)); r.n.setAttribute('cy', r.y.toFixed(1)); r.n.setAttribute('r', (r.r * grow).toFixed(1)); r.n.setAttribute('opacity', (0.6 * (1 - Math.min(1, r.t)) * Math.min(1, r.t * 8)).toFixed(3));
      }
    },
  };
}
