// Checks for the things round one broke on: the tap can be found, the neighbour can be tapped, the pour is seen
// beside Jo and lands, the quality watch notices a slow machine, and the by-hand epilogue ends standing.
//   SH_GPU=1 node tools/round2.mjs        (frames into shots/round2/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = (process.argv.find((a) => a.startsWith('--html=')) || '').slice(7) || join(root, 'dist/small-hours.html');
const out = join(root, 'shots/round2'); mkdirSync(out, { recursive: true });
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

for (const V of [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: V.touch, isMobile: V.touch });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(html).href); await page.waitForFunction(() => window.__game && window.__game.ready);
  await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
  const shot = (n) => page.screenshot({ path: join(out, `${V.name}-${n}.png`) });
  const ev = (fn, a) => page.evaluate(fn, a);

  // 1. the pour: the water starts away from her head and ends in the pot, both on screen
  await ev(() => { const g = window.__game; g.goto('n1_water'); for (let i = 0; i < 30 * 60; i++) { const j = g.state.jo; if (j.action === 'pour' && j.actionT / j.actionDur > 0.5) break; g.step(1 / 30, true); } });
  const pour = await ev(() => ({ water: window.__game.facts().water }));
  check(pour.water, `${V.name}: water is drawn mid-pour`);
  await shot('pour');
  const geo = await ev(() => { const g = window.__game, j = g.state.jo; return { cup: g.screenOf('cup'), pot: g.screenOf(j.target), jo: j.pos, target: j.target }; });
  check(geo.cup.on && geo.pot.on, `${V.name}: cup and pot both on screen during the pour`);
  check(geo.cup.y < geo.pot.y - 30, `${V.name}: the cup is well above the pot (${Math.round(geo.pot.y - geo.cup.y)} px)`);
  check(Math.abs(geo.cup.x - geo.pot.x) < V.w * 0.2, `${V.name}: the cup is over the pot, not across the picture`);

  // 2. night three: the barrel runs dry, the camera goes to the tap, a tap on bed B reaches it, the arrow marks it
  await ev(() => { const g = window.__game; g.goto('n3_water'); for (let i = 0; i < 30 * 90; i++) { if (g.state.valve.found) break; g.step(1 / 30, true); } g.step(3.5); });
  const dry = await ev(() => { const g = window.__game, s = g.state, v = g.screenOf('valve'); return { shot: s.camera.shot, found: s.valve.found, valve: v, hot: s.hot, line: s.text.line,
    pickBed: g.pick(...(() => { const b = g.screenOf('bedB'); return [b.x, b.y]; })()), pickValve: g.pick(v.x, v.y), arrows: g.ui().filter((r) => r.name.startsWith('arrow')).map((r) => r.name) }; });
  await shot('dry-barrel');
  check(dry.found, `${V.name}: the tap is found when the barrel is dry`);
  check(/^valve/.test(dry.shot), `${V.name}: the camera goes to the tap (shot=${dry.shot})`);
  check(dry.valve.on && !dry.valve.behind, `${V.name}: the tap is on screen in that shot`);
  check(dry.pickValve === 'valve', `${V.name}: a tap on the tap picks the tap (${dry.pickValve})`);
  check(dry.pickBed === 'valve', `${V.name}: a tap on kitchen bed B picks the tap (${dry.pickBed})`);
  check(!dry.hot.includes('barrel'), `${V.name}: the dry barrel is no longer offered`);
  // after the look, back at the shelf, the tap is still findable: on screen big enough or marked by the arrow
  await ev(() => { const g = window.__game; g.step(7.5); });
  const later = await ev(() => { const g = window.__game, v = g.screenOf('valve'); return { shot: g.state.camera.shot, on: v.on && !v.behind, arrows: g.ui().filter((r) => r.name.startsWith('arrow')).map((r) => r.name) }; });
  await shot('after-dry');
  check(later.arrows.includes('arrow:valve') || /^valve/.test(later.shot), `${V.name}: once the camera is back, the tap is marked (${later.shot}, ${later.arrows.join(',') || 'no arrows'})`);

  // 3. the hand-off: a tap on the neighbour's body takes the tray; the tray is above the rail
  await ev(() => { const g = window.__game; g.goto('turn'); for (let i = 0; i < 30 * 90; i++) { if (g.state.hot.includes('tray')) break; g.step(1 / 30, false); } g.step(0.5); });
  const offer = await ev(() => { const g = window.__game, t = g.screenOf('tam'), tr = g.screenOf('tray'); const body = g.pick(t.x, t.y + 30); return { body, tray: g.pick(tr.x, tr.y), t, tr, facts: g.facts() }; });
  await shot('offer');
  check(offer.body === 'tray', `${V.name}: a tap on the neighbour takes the tray (${offer.body})`);
  check(offer.tray === 'tray', `${V.name}: a tap on the tray takes the tray (${offer.tray})`);
  check(offer.facts.tray && offer.facts.tam, `${V.name}: neighbour and tray are drawn`);
  await ev(() => { const g = window.__game; g.step(6.5); });   // the neighbour lifts the tray if nobody takes it (peak near 7 s)
  const nudge = await ev(() => window.__game.state.tam.nudge || 0);
  check(nudge > 0.3, `${V.name}: after about seven seconds the neighbour lifts the tray (nudge=${nudge.toFixed(2)})`);
  await shot('offer-nudge');

  // 4. the by-hand epilogue ends with every pot standing and nothing offered
  await ev(() => { const g = window.__game; g.goto('epilogue', { ending: 'hand' }); for (let i = 0; i < 70 && g.state.beat !== 'end'; i++) g.step(1, true); });
  const ep = await ev(() => { const s = window.__game.state; return { beat: s.beat, hot: s.hot, standing: s.pots.filter((p) => p.watered).length, lifted: s.pots.filter((p) => p.lift > 0.8).length, pours: s.counts.pours }; });
  await shot('epilogue-hand');
  check(ep.hot.length === 0, `${V.name}: nothing is offered in the epilogue`);
  check(ep.standing === 12, `${V.name}: all twelve pots stand at the end of the by-hand night (${ep.standing})`);
  await ev(() => { const g = window.__game; g.goto('epilogue', { ending: 'sensor' }); g.step(14, true); });
  const es = await ev(() => { const s = window.__game.state; return { standing: s.pots.filter((p) => p.watered).length }; });
  await shot('epilogue-sensor');
  check(es.standing === 12, `${V.name}: all twelve pots stand in the sensor night (${es.standing})`);
  check(errors.length === 0, `${V.name}: no errors (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}
// 5. the quality watch: a machine where every frame is long drops to tier 0; a lone long frame does not
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(html).href); await page.waitForFunction(() => window.__game && window.__game.ready);
  const r = await page.evaluate(() => { const g = window.__game; g.setQuality(2, false);
    if (!g.feedFrame) return { skipped: true };
    const feed = (ms, n) => { for (let i = 0; i < n; i++) g.feedFrame(ms); };
    feed(16, 60); feed(600, 1); feed(16, 30); const afterLone = g.state.quality;
    feed(590, 6); const afterSlow = g.state.quality;
    return { afterLone, afterSlow, wall: g.perf().wallFps }; });
  if (r.skipped) console.log('skip quality watch (no feed hook)');
  else { check(r.afterLone === 2, `a lone long frame keeps tier 2 (${r.afterLone})`); check(r.afterSlow === 0, `six long frames in a row drop to tier 0 (${r.afterSlow})`); check(r.wall < 10, `perf reports the real wall rate (${r.wall} fps)`); }
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `ROUND2 FAILED (${fails.length})` : 'ROUND2 OK');
process.exit(fails.length ? 1 : 0);
