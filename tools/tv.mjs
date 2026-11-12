// Gate: the console. The page is served the way the xbox50 serves it (under /cart/, 1920 x 1080 and 1280 x 720) and
// played to both endings with nothing but the keys the console's stick and button send: arrows and Enter, made the
// way its shell makes them (synthetic events, which cannot press an HTML button). No pointer, no bridge taps.
// The clock is stepped so a whole game takes seconds; everything the player does goes in through the keys.
//   the button alone plays the three nights: pressing it never goes 20 s without water taken or poured
//   at the choice the button alone chooses nothing; the stick picks a label, then the button takes it
//   a press as the choice opens chooses nothing
//   the button on the end card begins again
//   words are big enough for a TV (a line is at least 3% of the screen's height) and stay inside the middle 90%
//   node tools/tv.mjs [--site=dir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { root, GL } from './gates/drive.mjs';

const siteArg = process.argv.find((a) => a.startsWith('--site='));
const site = siteArg ? siteArg.slice(7) : join(root, 'site');
if (!existsSync(join(site, 'index.html'))) { console.error('no site build. Run: node tools/build.mjs --site'); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const PREFIX = '/cart/games/small-hours/';
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
  const rel = normalize(url.slice(PREFIX.length) || 'index.html'), file = join(site, rel);
  if (rel.startsWith('..') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}index.html`;

const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
let failed = false;
const report = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

for (const screen of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }]) for (const ending of ['hand', 'sensor']) {
  const tag = `${screen.w}x${screen.h} ${ending}`;
  const page = await (await browser.newContext({ viewport: { width: screen.w, height: screen.h } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  const r = await page.evaluate(([ending]) => {
    const G = window.__game, s = G.state, H = innerHeight, W = innerWidth, out = { notes: [], presses: 0, useful: 0, wasted: [], small: [], outside: [], ringMissing: 0, ringChecks: 0 };
    G.setQuality(0, true); G.auto(false);
    // the console's shell: a key goes to the focused element (or the document), and to the window if nobody took it
    const key = (k) => { for (const type of ['keydown', 'keyup']) { const init = { code: k, key: k, bubbles: true, cancelable: true, composed: true }, ev = new KeyboardEvent(type, init);
      (document.activeElement || document).dispatchEvent(ev); if (!ev.defaultPrevented) window.dispatchEvent(new KeyboardEvent(type, init)); } };
    const ui = document.getElementById('sh-ui'); out.tvClass = ui.classList.contains('tv'); out.hint = ui.querySelector('.card.title .small').textContent;
    out.soundToggle = getComputedStyle(ui.querySelector('.snd')).display;
    const look = () => {   // every word on screen: big enough, and inside the middle 90%
      for (const n of ui.querySelectorAll('.line.on, .timecard.on, .card.on .sub, .card.on .small, .card.on .ptag, .choice.on, .card.on .ledger')) {
        const b = n.getBoundingClientRect(), fs = parseFloat(getComputedStyle(n).fontSize), cls = n.className.split(' ').slice(0, 2).join('.');
        if (!b.width) continue;
        const least = /small/.test(cls) ? 0.02 : /marlow|choice|ledger/.test(n.className) ? 0.026 : 0.03;
        if (fs < H * least - 0.01) out.small.push(`${cls} ${fs.toFixed(1)}px`);
        if (b.left < W * 0.05 - 1 || b.right > W * 0.95 + 1 || b.top < H * 0.05 - 1 || b.bottom > H * 0.95 + 1) out.outside.push(`${cls} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`);
      }
    };
    look();
    key('Enter'); out.begun = s.begun;
    let stray = null, alone = null, chosen = null, guard = 0, strayDone = false, aloneDone = false, mark = '', markAt = 0, stall = 0, stallAt = '';
    while (s.beat !== 'end' && guard++ < 30 * 900) {
      G.step(1 / 30, false);
      if (guard % 15 === 0) look();
      if (guard % 15 === 0) { const now = [s.beat, s.jo.action, s.jo.target, s.jo.cup, s.focus, s.text.line].join(' | '); if (now !== out.last) { out.trace = out.trace || []; out.trace.push(Math.round(s.time) + ' ' + now); out.last = now; } }
      const usable = s.hot.filter((id) => !['marlow', 'city', 'chair', 'hatch'].includes(id) && !(id === 'sensor' && s.beat !== 'choice'));
      if (s.beat === 'choice' && !s.ending) {
        if (!strayDone && s.beatTime < 0.2) { strayDone = true; key('ArrowLeft'); key('Enter'); stray = s.ending; s.focus = null; }   // even with a label picked, too early is too early
        if (s.beatTime > 2 && !aloneDone) { aloneDone = true; key('Enter'); alone = s.ending; }                                  // the button alone
        if (s.beatTime > 3 && aloneDone && !chosen) { key(ending === 'sensor' ? 'ArrowRight' : 'ArrowLeft'); out.focusAtChoice = s.focus; key('Enter'); chosen = s.ending; }
        continue;
      }
      // the ring is on whatever the button would use
      if (usable.length && s.fade > 0.9 && guard % 10 === 0) { out.ringChecks++; if (!(s.focus && document.querySelector('#sh-ui .fx .focus.on'))) out.ringMissing++; }
      // one press a second while there is something to use and she is free to use it
      if (usable.length && guard % 30 === 0 && s.fade > 0.9 && s.jo.action === 'idle') {
        key('Enter'); out.presses++;
        // the longest the button was pressed with nothing coming of it: no water taken, none poured, no tray taken
        const now = JSON.stringify([s.beat, s.jo.cup, s.counts.scoops, s.nightPours, s.pots.filter((p) => p.watered).length, s.tam.hasTray]);
        if (now !== mark) { mark = now; markAt = s.time; } else if (s.time - markAt > stall) { stall = s.time - markAt; stallAt = `${s.beat}, ring on ${s.focus}`; }
      } else if (!usable.length) markAt = s.time;
    }
    Object.assign(out, { stall: Math.round(stall), stallAt, beat: s.beat, ending: s.ending, stray, alone, chosen, time: Math.round(s.time), pours: s.counts.pours ?? null, scoops: s.counts.scoops });
    for (let i = 0; i < 90; i++) G.step(1 / 30, false);
    look(); out.endCard = !!document.querySelector('#sh-ui .card.end.on');
    key('Enter'); for (let i = 0; i < 30 * 8; i++) G.step(1 / 30, false);
    out.again = s.beat;
    return out;
  }, [ending]);
  if (process.env.SH_TRACE) console.log(r.trace.join('\n'));
  report(r.tvClass && r.soundToggle === 'none', `${tag}: the page knows it is on the console (${JSON.stringify(r.hint)})`);
  report(r.begun, `${tag}: the button begins`);
  report(r.beat === 'end' && r.ending === ending, `${tag}: reached the ${r.ending} ending in ${r.time}s of game with ${r.presses} presses, by keys alone`);
  report(r.stall <= 20, `${tag}: pressing the button always gets somewhere (longest wait for water taken or poured: ${r.stall}s${r.stallAt ? ', in ' + r.stallAt : ''})`);
  report(r.stray === null && r.alone === null, `${tag}: at the choice the button alone chooses nothing (as it opens: ${r.stray}; later, no stick: ${r.alone})`);
  report(r.chosen === ending && r.focusAtChoice === (ending === 'sensor' ? 'sensor' : 'cup'), `${tag}: stick ${ending === 'sensor' ? 'right' : 'left'} then the button chose "${r.chosen}"`);
  report(r.ringChecks > 20 && r.ringMissing === 0, `${tag}: the focus ring was on the next thing to use (${r.ringChecks - r.ringMissing}/${r.ringChecks} looks)`);
  report(r.small.length === 0, `${tag}: words are big enough for a TV${r.small.length ? ': too small: ' + [...new Set(r.small)].slice(0, 5).join('; ') : ''}`);
  report(r.outside.length === 0, `${tag}: words keep inside the middle 90%${r.outside.length ? ': outside: ' + [...new Set(r.outside)].slice(0, 5).join('; ') : ''}`);
  report(r.endCard && r.again !== 'end', `${tag}: the button on the end card begins again (now in ${r.again})`);
  report(errors.length === 0, `${tag}: no page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  await page.close();
}
await browser.close(); server.close();
console.log(failed ? 'TV FAILED' : 'TV OK');
process.exit(failed ? 1 : 0);
