// Final delivery gate: a full playthrough in the sandboxed, CSP-locked, network-blocked iframe, with hands only.
//   node tools/sandbox/play.mjs --touch|--mouse [--ending=hand|sensor] [--live] [--w=390 --h=844] [--tag=name]
// --live: the game's own clock (auto on), no stepping. Otherwise time is stepped through the bridge but every
// action is a real press on the screen.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openSandboxed, hands, shotDir, here } from './lib.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const touch = !process.argv.includes('--mouse'), live = process.argv.includes('--live');
const ending = arg('ending', touch ? 'sensor' : 'hand'), W = +arg('w', touch ? 390 : 1440), H = +arg('h', touch ? 844 : 900);
const tag = arg('tag', `${touch ? 'touch' : 'mouse'}-${ending}${live ? '-live' : ''}-${W}x${H}`);
const dir = shotDir(tag);
const browser = await launch();
const { page, frame, log } = await openSandboxed(browser, { width: W, height: H, touch, dpr: +arg('dpr', touch ? 2 : 1), guards: {} });
const P = hands(page, frame, { touch });
const out = { tag, beats: [], taps: {}, fails: [] };
let n = 0;
const shot = async (name) => { await page.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${name}.png`) }); };

await page.waitForTimeout(1500);
await shot('title');
if (!live) await P.g(() => window.__game.auto(false));
if (!(await P.tapUI('begin'))) out.fails.push('no Begin button');
await page.waitForTimeout(100);
if (!(await P.g(() => window.__game.state.begun))) out.fails.push('Begin press did not begin');

let last = '', t0 = Date.now(), steps = 0, stuckSince = Date.now(), lastSig = '';
while (Date.now() - t0 < (live ? 20 * 60e3 : 12 * 60e3)) {
  if (!live) await P.g(() => window.__game.step(0.2)); else await page.waitForTimeout(250);
  steps++;
  const s = await P.g(() => { const s = window.__game.state; return { beat: s.beat, bt: s.beatTime, time: s.time, ending: s.ending, fade: s.fade, cup: s.jo.cup, act: s.jo.action, hot: s.hot.join(',') }; });
  if (s.beat !== last) { out.beats.push({ beat: s.beat, at: +s.time.toFixed(1) }); last = s.beat; if (s.beat !== 'title') { if (!live) await P.g(() => window.__game.step(1.2)); else await page.waitForTimeout(1200); await shot(s.beat); } }
  if (s.beat === 'choice' && !s.ending) { await shot('choice-labels'); }
  if (s.beat === 'end') { if (!live) await P.g(() => window.__game.step(3)); else await page.waitForTimeout(3000); await shot('end-card'); break; }
  const id = await P.decide(ending);
  if (id) { const via = await P.tapId(id); out.taps[via || 'none'] = (out.taps[via || 'none'] || 0) + 1; if (!via) out.fails.push('could not find ' + id + ' in ' + s.beat); }
  const sig = s.beat + s.act + s.cup + s.hot;
  if (sig !== lastSig) { lastSig = sig; stuckSince = Date.now(); } else if (Date.now() - stuckSince > (live ? 120e3 : 60e3)) { out.fails.push('no progress in ' + s.beat + ' for a long time: ' + JSON.stringify(s)); break; }
}
const fin = await P.g(() => ({ beat: window.__game.state.beat, ending: window.__game.state.ending, time: window.__game.state.time, guard: window.__guard || {}, ui: window.__game.ui(), quality: window.__game.state.quality, perf: window.__game.perf(), audio: (() => { try { return null; } catch (_) { return null; } })() }));
out.final = fin; out.log = log; out.realSeconds = Math.round((Date.now() - t0) / 1000);
if (fin.beat !== 'end') out.fails.push('did not reach end: ' + fin.beat);
if (fin.ending !== ending) out.fails.push('ending ' + fin.ending + ' != ' + ending);
if (!fin.ui.some((u) => u.name === 'again')) out.fails.push('no Again button on end card');
// Again, with a real press: the roof goes dark and comes back on night one
if (fin.beat === 'end') {
  if (!live) await P.g(() => window.__game.step(1)); else await page.waitForTimeout(1000);
  await P.tapUI('again');
  if (!live) await P.g(() => window.__game.step(8)); else await page.waitForTimeout(8000);
  out.afterAgain = await P.g(() => ({ beat: window.__game.state.beat, begun: window.__game.state.begun, fade: window.__game.state.fade }));
  await shot('after-again');
  if (out.afterAgain.beat !== 'n1_open') out.fails.push('Again did not restart into n1_open: ' + JSON.stringify(out.afterAgain));
}
const bad = [...log.errors, ...log.console.filter((c) => !/GPU stall|swiftshader|WebGL-|GL Driver Message|Automatic fallback to software/i.test(c))];
if (bad.length) out.fails.push('console/page errors: ' + bad.slice(0, 5).join(' | '));
if (log.blocked.length) out.fails.push('requests attempted: ' + log.blocked.slice(0, 5).join(', '));
for (const k of Object.keys(fin.guard)) out.fails.push('guard tripped: ' + k + ' x' + fin.guard[k]);
writeFileSync(join(here, '../../shots/sandbox', tag + '.json'), JSON.stringify(out, null, 1));
console.log(tag, out.fails.length ? 'FAIL' : 'PASS', JSON.stringify({ beats: out.beats.map((b) => b.beat).join(' '), taps: out.taps, fails: out.fails, realSeconds: out.realSeconds, console: log.console.slice(0, 6) }));
await browser.close();
