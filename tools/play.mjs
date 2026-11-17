// Headless playthrough. Real pointer and touch input, real frames, both endings.
//   node tools/play.mjs            desktop 1440x900 (by hand) + phone 390x844 (sensor)
//   node tools/play.mjs --all      both endings on both screens
//   node tools/play.mjs --verbose  print failures as they happen
// Writes shots/<view>-<ending>/NN-name.png and shots/report.json. Exit code 1 on any failure.
// A frame nobody has looked at is not done: open the PNGs.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlArg = process.argv.find((a) => a.startsWith('--html='));   // test another build, e.g. a deliberately broken one
const dist = htmlArg ? htmlArg.slice(7) : join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no dist/small-hours.html. Run: node tools/build.mjs'); process.exit(1); }
const all = process.argv.includes('--all');
const VIEWS = [
  { name: 'desk', w: 1440, h: 900, dpr: 1, touch: false },
  { name: 'phone', w: 390, h: 844, dpr: 2, touch: true },
];
const RUNS = all ? VIEWS.flatMap((v) => ['hand', 'sensor'].map((ending) => ({ ...v, ending })))
  : [{ ...VIEWS[0], ending: 'hand' }, { ...VIEWS[1], ending: 'sensor' }];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));   // e.g. --only=desk-hand
if (onlyArg) RUNS.splice(0, RUNS.length, ...VIEWS.flatMap((v) => ['hand', 'sensor'].map((ending) => ({ ...v, ending }))).filter((r) => `${r.name}-${r.ending}` === onlyArg.slice(7)));
const EXPECT_BEATS = ['n1_open', 'n1_water', 'n1_quiet', 'n2_open', 'n2_water', 'turn', 'n2_more', 'n2_quiet', 'n3_open', 'n3_water', 'firstlight', 'choice', 'epilogue', 'end'];
const WATER = ['n1_water', 'n2_water', 'n2_more', 'n3_water'];

// SH_GPU=1 uses the machine's GPU through Metal or GL (about 30x faster here); the default is software GL, the floor.
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const report = { when: new Date().toISOString(), runs: [] };
let failed = false;

for (const run of RUNS) {
  const tag = `${run.name}-${run.ending}`, dir = join(root, 'shots', tag);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: run.dpr, hasTouch: run.touch, isMobile: run.touch });
  const page = await ctx.newPage();
  const r = { tag, errors: [], requests: [], fails: [], shots: [], lines: [], beats: [], maxLumaStep: 0 };
  page.on('console', (m) => { if (m.type() === 'error') r.errors.push(m.text()); });
  page.on('pageerror', (e) => r.errors.push(String(e)));
  page.on('request', (q) => { if (!q.url().startsWith('file:')) r.requests.push(q.url()); });
  await page.goto(pathToFileURL(dist).href);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 20000 });
  if (process.argv.includes("--verbose")) await page.evaluate(() => { window.__tl = []; const G = window.__game; G.bus.on("input:tap", (e) => window.__tl.push(G.state.beat + ":" + e.id + "@" + G.state.time.toFixed(1))); G.bus.on("jo:pour:start", (e) => window.__tl.push("pour " + e.pot + "@" + G.state.time.toFixed(1))); });
  const g = (fn, arg) => page.evaluate(fn, arg);
  let n = 0;
  const shot = async (name) => { const f = `${String(++n).padStart(2, '0')}-${name}.png`; await g(() => window.__game.frameStats()); await page.screenshot({ path: join(dir, f) }); r.shots.push(f); };
  const fail = (m) => { r.fails.push(m); if (process.argv.includes('--verbose')) console.log('     - ' + m); };

  // 1. live frame time before anything is locked (software GL here, so this is a floor, not the laptop number)
  await page.waitForTimeout(2500);
  r.perfLive = await g(() => window.__game.perf());
  await g(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
  await g(() => { window.__lines = []; window.__beats = []; window.__game.bus.on('text:show', (p) => window.__lines.push(p.kind + ': ' + p.text)); window.__game.bus.on('beat:enter', (p) => { window.__beats.push(p.beat); if (p.beat === 'epilogue') { const s = window.__game.state; window.__epiOpen = { hatchOpen: s.hatchOpen, lampOn: s.lampOn, jo: s.jo.present }; } }); });
  await shot('title');

  // 2. Begin, with a real click or a real finger
  const press = async (x, y) => (run.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const bb = await page.locator('#sh-ui button.begin').boundingBox();
  await press(bb.x + bb.width / 2, bb.y + bb.height / 2);
  if (!(await g(() => window.__game.state.begun))) fail('Begin did not start the game');

  // step the game, watching for sudden changes in brightness the whole way (mean frame luminance, sampled every 0.25 s)
  let lastMean = null;
  const step = async (sec) => {
    const m = await g((s) => { let worst = 0, prev = window.__lm ?? null; const k = Math.max(1, Math.round(s / 0.25));
      for (let i = 0; i < k; i++) { window.__game.step(0.25); const f = window.__game.frameStats().mean; if (prev !== null) worst = Math.max(worst, Math.abs(f - prev)); prev = f; }
      window.__lm = prev; return worst; }, sec);
    r.maxLumaStep = Math.max(r.maxLumaStep, m);
  };
  const S = () => g(() => { const s = window.__game.state; return { beat: s.beat, bt: s.beatTime, cup: s.jo.cup, action: s.jo.action, target: s.jo.target, at: s.jo.actionT,
    dry: s.pots.filter((p) => p.present && !p.watered).map((p) => p.id), hot: s.hot, scoops: s.barrel.scoops, found: !!s.valve.found, fills: s.valve.fills, ending: s.ending, leak: s.marlow.leak,
    watered: s.pots.filter((p) => p.watered).length, tam: s.tam.stage, tray: s.tam.hasTray }; });
  const until = async (cond, max, what) => { for (let t = 0; t < max; t += 0.25) { if (cond(await S())) return true; await step(0.25); } const st = await S(); if (process.argv.includes("--verbose")) console.log(JSON.stringify(await g(() => window.__tl.slice(-20)))); fail(`timeout waiting for ${what}` + (process.argv.includes('--verbose') ? ' ' + JSON.stringify(st) : '')); return false; };
  const tapThing = async (id, optional = false) => {
    let p = await g((i) => window.__game.screenOf(i), id);
    const arrow = page.locator(`#sh-ui button.arrow.on[aria-label="${id}"]`);
    if (!(p.on && !p.behind) && !(await arrow.count())) { await step(0.4); p = await g((i) => window.__game.screenOf(i), id); }   // the camera may still be panning
    if (p.on && !p.behind) {
      const hit = await g(([x, y]) => window.__game.pick(x, y), [p.x, p.y]);
      if (hit !== id) fail(`pick at ${id} hit ${hit}`);
      await press(p.x, p.y);
    } else if (await arrow.count()) { const b = await arrow.boundingBox(); await press(b.x + b.width / 2, b.y + b.height / 2); }
    else if (!optional) { fail(`${id} is off screen and has no edge arrow`); await g((i) => window.__game.tap(i), id); }
  };
  const idle = (s) => ['idle', 'sit'].includes(s.action);
  const water = async (label) => {
    let guard = 0, shotPour = false, shotScoop = false;
    // only what can be tapped now: on night two the shelf waits after the third pot, for the footsteps
    const open = (s) => s.dry.filter((i) => s.hot.includes(i));
    for (let s = await S(); open(s).length && WATER.includes(s.beat) && guard++ < 60; s = await S()) {
      if (!idle(s)) { await step(0.25); continue; }
      if (s.cup > 0) {
        // like a person: go for a dry pot you can see; if none is in frame, use the shelf's edge arrow
        const seen = await g((ids) => ids.find((i) => { const q = window.__game.screenOf(i); return q.on && !q.behind && q.x > 24 && q.x < window.innerWidth - 24; }), open(s));
        const aim = seen || open(s)[0]; await tapThing(aim); await step(0.1); const id = (await S()).target || aim;   // (a paper chevron over another dry pot may take the press: then that pot is the one she goes to)
        if (!shotPour) { await until((q) => q.action === 'pour' && q.at > 1.1, 12, `pour on ${id}`); await shot(`${label}-pour`); shotPour = true;
          const f = await g(() => window.__game.facts()); if (!f || !f.jo || !f.cup || !f.water) fail(`${label} pour: nothing drawn pouring (${JSON.stringify(f)})`); }
        await until((q) => !q.dry.includes(id), 14, `${id} watered`); await until(idle, 30, `free after the row from ${id}`);   // (round eleven: a full cup of six carries on along the row, and on the realistic body's walk the row takes longer than 14 s; the pot itself must still be watered within 14)
      } else {
        const src = s.scoops > 0 || !s.found ? 'barrel' : 'valve', dry = src === 'barrel' && s.scoops === 0; await tapThing(src);
        if (!shotScoop || dry || (src === 'valve' && s.fills === 0)) { await until((q) => q.action === 'scoop' && q.at > 0.6, 14, `scoop at ${src}`); await shot(`${label}-${dry ? 'dry-barrel' : src}`); shotScoop = true; }
        await until((q) => idle(q) && (q.cup >= 3 || (dry && q.found)), 14, `scoop at ${src}`);   // the cup holds 3 on night one, more after
      }
    }
  };

  // 3. the arc: three nights, a choice, the night after
  await step(6.2); await shot('n1-marlow-waters');
  await until((s) => s.beat === 'n1_water', 30, 'n1_water'); await step(1.0); await shot('n1-jo-is-up');
  const t30 = await g(() => window.__game.state.time); if (t30 > 30) fail(`control arrives at ${t30.toFixed(1)} s, later than 30 s`);
  await water('n1');
  await until((s) => s.beat === 'n1_quiet', 10, 'n1_quiet'); await step(5); await shot('n1-quiet');
  await tapThing('marlow'); await step(3.5); await tapThing('city', true); await step(1);
  await until((s) => s.beat === 'n2_open', 60, 'n2_open'); await step(6); await shot('n2-open');
  await until((s) => s.beat === 'n2_water', 30, 'n2_water');
  await water('n2');
  await until((s) => s.beat === 'turn', 10, 'turn'); await step(6); await shot('turn-climbing');
  await until((s) => s.hot.includes('tray'), 60, 'tray offered'); await shot('turn-offer');
  { const f = await g(() => window.__game.facts()); if (!f || !f.tam || !f.tray || !f.jo) fail(`hand-off: neighbour, tray or Jo not drawn (${JSON.stringify(f)})`); }
  await tapThing('tray'); await until((s) => !s.tray, 12, 'hand-off'); await shot('turn-handoff');
  await until((s) => s.beat === 'n2_more', 60, 'n2_more'); await step(1); await shot('n2-twelve-pots');
  await water('n2more');
  await until((s) => s.beat === 'n3_open', 60, 'n3_open'); await step(6); await shot('n3-open');
  await until((s) => s.beat === 'n3_water', 30, 'n3_water');
  await water('n3');
  await until((s) => s.beat === 'choice', 30, 'choice'); await step(2.5); await shot('choice');
  const mid = await S(); if (mid.watered !== 12) fail(`expected 12 pots watered, got ${mid.watered}`); if (mid.fills !== 3) fail(`expected 3 fills at the valve, got ${mid.fills}`);   // the tap gives three a cup: barrel five, then 3 + 3 + the last
  const cl = page.locator('#sh-ui button.choice.on').nth(run.ending === 'sensor' ? 0 : 1);
  if (!(await cl.count())) { fail('choice labels not visible'); await g((i) => window.__game.tap(i), run.ending === 'sensor' ? 'sensor' : 'cup'); }
  else { const cb = await cl.boundingBox(); await press(cb.x + cb.width / 2, cb.y + cb.height / 2); }
  if ((await S()).ending !== run.ending) fail(`chose ${run.ending}, state says ${(await S()).ending}`);
  await step(3); await shot('choice-made');
  await until((s) => s.beat === 'epilogue', 20, 'epilogue'); await step(run.ending === 'sensor' ? 6 : 22); await shot('epilogue');   // by sensor, the roof is still empty at six seconds: she comes up at eight
  { const f = await g(() => window.__game.facts()); if (!f || (run.ending === 'hand' ? !(f.jo && f.tam && f.bucket) : (f.jo || f.tam))) fail(`epilogue picture wrong for ${run.ending} (${JSON.stringify(f)})`); }
  await until((s) => s.beat === 'end', 70, 'end'); await step(3.5); await page.waitForTimeout(2800); await shot('end');
  r.gameSeconds = +(await g(() => window.__game.state.time)).toFixed(1);

  // 4. checks
  r.final = await g(() => { const s = window.__game.state; return { ending: s.ending, shelfSensor: s.marlow.shelfSensor, stakeAsProp: s.stakeAsProp, hatchOpen: s.hatchOpen, secondCup: s.secondCup, book: s.jo.book, epiOpen: window.__epiOpen || null }; });
  r.lines = await g(() => window.__lines); r.beats = await g(() => window.__beats);
  r.stats = await g(() => window.__game.frameStats());
  if (JSON.stringify(r.beats) !== JSON.stringify(EXPECT_BEATS)) fail('beats visited: ' + r.beats.join(' > '));
  if (r.final.ending !== run.ending) fail('wrong ending');
  // sensor: the shelf has its sensor, the night opens on a shut lid with the lamp off and nobody up; then she comes up anyway, with a book
  if (run.ending === 'sensor' && (!r.final.shelfSensor || !r.final.epiOpen || r.final.epiOpen.hatchOpen || r.final.epiOpen.lampOn || r.final.epiOpen.jo)) fail('sensor ending did not change the roof');
  if (run.ending === 'sensor' && !(r.final.book && r.final.hatchOpen)) fail('sensor ending: she did not come up and read');
  if (run.ending === 'hand' && (!r.final.stakeAsProp || !r.final.secondCup || !r.final.hatchOpen)) fail('by-hand ending did not change the roof');
  if (r.gameSeconds < 300 || r.gameSeconds > 600) fail(`length ${r.gameSeconds} s is outside 5 to 10 minutes`);
  for (const l of r.lines) if (/[—–]/.test(l)) fail('dash in text: ' + l);
  if (r.maxLumaStep > 0.06) fail(`brightness jumped ${r.maxLumaStep.toFixed(3)} in 0.25 s (limit 0.06)`);
  if (r.stats.colours < 3) fail('end frame looks blank');
  if (r.errors.length) fail(`${r.errors.length} console errors`);
  if (r.requests.length) fail(`${r.requests.length} network requests`);
  // 5. live again, unlocked: does it hold frame rate, and how far does quality fall
  await g(() => { window.__game.goto('n1_water'); window.__game.setQuality(2, false); window.__game.auto(true); });
  await page.waitForTimeout(4000);
  r.perfPlay = await g(() => window.__game.perf());
  failed = failed || r.fails.length > 0;
  report.runs.push(r);
  console.log(`${r.fails.length ? 'FAIL' : 'ok  '} ${tag}  ${r.gameSeconds}s  shots ${r.shots.length}  lines ${r.lines.length}  maxLumaStep ${r.maxLumaStep.toFixed(4)}  frame ${r.perfPlay.frameMs.toFixed(1)}ms q${r.perfPlay.quality}`);
  for (const f of r.fails) console.log('     - ' + f);
  for (const e of r.errors.slice(0, 5)) console.log('     ! ' + e);
  await ctx.close();
}
await browser.close();
writeFileSync(join(root, 'shots/report.json'), JSON.stringify(report, null, 2));
console.log(failed ? 'PLAYTHROUGH FAILED' : 'PLAYTHROUGH OK', '-> shots/report.json');
process.exit(failed ? 1 : 0);
