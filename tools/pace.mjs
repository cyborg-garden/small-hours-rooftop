// Gate: pace. A blind reviewer took eleven minutes to reach the choice and walked to the barrel for nearly every
// pot. This plays the real build as a first-time player would, not as the canonical player does: when she is free
// it waits THINK seconds, then taps what the idle hint would point at (a dry pot while the cup has water, the water
// while it has none); in each quiet it looks at one thing; it waits for the ring before taking the tray, and reads
// the choice for a few seconds before tapping. Measured in game time, which is wall time on any machine that draws
// 5 frames a second or more (src/main.js steps the game in pieces).
//   choice    reached within LIMIT seconds (5.5 minutes)
//   taps      at most 40 taps on pots and water in the three nights (a cup carries on along the row)
//   trips     at most 9 walks for water
// SH_BREAK=onecup empties the cup after every pour (one pot per cup, the old fault); the gate goes red.
//   node tools/pace.mjs [--html=path] [--think=3]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlPath } from './gates/drive.mjs';

const LIMIT = 330, MAX_TAPS = 40, MAX_TRIPS = 9;
const THINK = +((process.argv.find((a) => a.startsWith('--think=')) || '').slice(8) || 3);
const dist = htmlPath();
if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 60000 });
const r = await page.evaluate(([THINK, BREAK]) => {
  const G = window.__game, S = G.state, DT = 1 / 30; G.setQuality(0, true); G.auto(false); G.goto('title'); G.begin();
  if (BREAK === 'onecup') G.bus.on('pot:watered', () => { S.jo.cup = 0; });
  const WATER = ['n1_water', 'n2_water', 'n2_more', 'n3_water'], looked = new Set();
  const log = []; let wait = 0, taps = 0, trips = 0, lastBeat = '', beatT = 0;
  const target = () => {
    const j = S.jo, dry = S.pots.filter((p) => p.present && !p.watered && S.hot.includes(p.id));
    if (j.cup > 0) { if (!dry.length) return null; dry.sort((p, q) => Math.hypot(p.pos.x - j.pos.x, p.pos.z - j.pos.z) - Math.hypot(q.pos.x - j.pos.x, q.pos.z - j.pos.z)); return dry[0].id; }
    if (!dry.length) return null;
    if (S.hot.includes('barrel') && (S.barrel.scoops > 0 || !S.valve.found)) return 'barrel';
    return S.hot.includes('valve') ? 'valve' : S.hot.includes('barrel') ? 'barrel' : null;
  };
  const free = () => ['idle', 'sit'].includes(S.jo.action) && !S.jo.target;
  for (let i = 0; i < 30 * 900 && S.beat !== 'choice' && S.beat !== 'end'; i++) {
    if (S.beat !== lastBeat) { lastBeat = S.beat; beatT = 0; wait = 0; log.push(S.beat + '@' + Math.round(S.time)); }
    beatT += DT;
    if (WATER.includes(S.beat)) {
      if (free() && S.fade > 0.9) { wait += DT; if (wait > THINK) { wait = 0; const id = target(); if (id) { if (id === 'barrel' || id === 'valve') trips++; taps++; G.tap(id); } } }
      else wait = 0;
    } else if ((S.beat === 'n1_quiet' || S.beat === 'n2_quiet') && !looked.has(S.beat) && beatT > 4) { looked.add(S.beat); G.tap('city'); }
    else if (S.beat === 'turn' && S.hot.includes('tray') && beatT > 0) { wait += DT; if (wait > THINK + 4) { wait = 0; G.tap('tray'); } }
    G.step(DT, false);
  }
  return { log: log.join(' '), time: Math.round(S.time), beat: S.beat, taps, trips, pours: S.counts.pours };
}, [THINK, process.env.SH_BREAK || '']);
await browser.close();
console.log('     ' + r.log);
let failed = 0; const report = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
report(r.beat === 'choice' && r.time <= LIMIT, `choice reached in ${r.time}s by a first-time player (think ${THINK}s), limit ${LIMIT}s`);
report(r.taps <= MAX_TAPS, `${r.taps} taps on pots and water (${r.pours} pours), limit ${MAX_TAPS}`);
report(r.trips <= MAX_TRIPS, `${r.trips} walks for water, limit ${MAX_TRIPS}`);
for (const e of errors.slice(0, 3)) { console.log('     ! ' + e); failed++; }
console.log(failed ? 'PACE FAILED' : 'PACE OK');
process.exit(failed ? 1 : 0);
