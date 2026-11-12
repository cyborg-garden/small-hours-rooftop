// Plays the whole game with the canonical player on both screens and both endings, and runs a geometric check on
// the posed figures every few tenths of a second (every frame of every action is sampled at 10 Hz while someone is
// doing something, 2 Hz while they stand or walk). Used by tools/limbs.mjs and tools/clash.mjs.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const inpage = readFileSync(join(root, 'tools/gates/inpage.js'), 'utf8');
export const VIEWS = [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }];
export const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
export const htmlPath = () => { const a = process.argv.find((x) => x.startsWith('--html=')); return a ? a.slice(7) : join(root, 'dist/small-hours.html'); };

// check: 'body' | 'clash'. onFinding(run, finding) decides what is a failure. Returns { fails, report }.
export async function drive({ check, name, classify, shotsOf = 6 }) {
  const dist = htmlPath();
  if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
  const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7);
  const runs = VIEWS.flatMap((v) => ['hand', 'sensor'].map((ending) => ({ ...v, ending }))).filter((r) => !only || `${r.name}-${r.ending}` === only);
  const out = join(root, 'shots/gates', name); mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
  const report = { when: new Date().toISOString(), check, runs: [] };
  let failed = false;
  for (const run of runs) {
    const tag = `${run.name}-${run.ending}`;
    const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: run.dpr, hasTouch: run.touch, isMobile: run.touch });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
    await page.addScriptTag({ content: inpage });
    await page.evaluate((e) => { window.__game.goto('title'); window.__game.goto('n1_open', { ending: e }); }, run.ending);
    // step through the game in chunks, checking inside the page
    const findings = []; let samples = 0, t0 = Date.now();
    for (let guard = 0; guard < 200; guard++) {
      const r = await page.evaluate(([check, chunk]) => {
        const G = window.__game, s = G.state, got = [], ACT = ['scoop', 'pour', 'pourEmpty', 'take', 'carry', 'place', 'plant', 'sit', 'read', 'climb', 'descend'];
        let n = 0, acc = 0; const dt = 0.1;
        for (let t = 0; t < chunk && s.beat !== 'end'; t += dt) {
          G.step(dt, true); acc += dt;
          const busy = ACT.includes(s.jo.action) || (s.tam.present && s.tam.stage !== 'gone') || (s.jo.dip > 0);
          if (!(s.jo.present || s.tam.present) || s.fade < 0.2) continue;
          if (busy ? acc < 0.1 - 1e-6 : acc < 0.5 - 1e-6) continue;
          acc = 0; n++;
          const f = window.__gate[check]();
          const ctxInfo = { time: +s.time.toFixed(2), beat: s.beat, action: s.jo.action, target: s.jo.target, tam: s.tam.present ? s.tam.stage : null, shot: s.camera.shot };
          if (check === 'body') { for (const k of ['caps', 'joints', 'cloth']) for (const x of f[k]) got.push({ kind: k, ...x, ...ctxInfo }); }
          else for (const x of f) got.push({ kind: 'clash', ...x, ...ctxInfo });
        }
        return { got, n, beat: s.beat, time: s.time };
      }, [check, 12]);
      findings.push(...r.got); samples += r.n;
      if (r.beat === 'end') break;
    }
    // group: one row per (kind, who, tag/joint/prop, action), with its count and first sighting
    const groups = new Map();
    for (const f of findings) {
      const key = [f.kind, f.who, f.tag || f.joint || '', f.prop || '', f.action, f.beat].join('|');
      const g = groups.get(key) || { ...f, n: 0, first: f.time }; g.n++; groups.set(key, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.n - a.n);
    const fails = rows.filter((r) => classify(r) === 'fail');
    // a frame of the first few failures, so a person can see what the numbers mean
    let k = 0;
    for (const r of fails.slice(0, shotsOf)) {
      await page.evaluate(([t, e]) => { const G = window.__game; G.goto('title'); G.goto('n1_open', { ending: e }); while (G.state.time < t - 0.05 && G.state.beat !== 'end') G.step(0.1, true); G.frameStats(); }, [r.first, run.ending]);
      const f = `${tag}-${String(++k).padStart(2, '0')}-${(r.tag || r.joint || r.prop || r.kind).replace(/[^a-z0-9]/gi, '_')}.png`;
      await page.screenshot({ path: join(out, f) }); r.shot = f;
    }
    const rr = { tag, samples, seconds: Math.round((Date.now() - t0) / 1000), findings: findings.length, rows, fails: fails.length, errors };
    report.runs.push(rr); failed = failed || fails.length > 0 || errors.length > 0;
    console.log(`${fails.length || errors.length ? 'FAIL' : 'ok  '} ${tag}  ${samples} samples in ${rr.seconds}s  ${rows.length} kinds, ${fails.length} failing`);
    for (const r of fails.slice(0, 14)) console.log(`     - ${r.kind} ${r.who} ${r.tag || r.joint || ''}${r.prop ? ' in ' + r.prop : ''} x${r.n}  during ${r.action}${r.tam ? ' (neighbour ' + r.tam + ')' : ''} in ${r.beat} at ${r.first}s  ${r.px ? r.px + 'px' : ''}${r.gap != null ? ' gap ' + r.gap : ''}${r.pairs ? ' pairs ' + r.pairs : ''} @${r.x},${r.y}${r.at ? ' world ' + r.at.join(',') : ''}${r.hemY ? ' hemY ' + r.hemY + ' vs ' + r.legTag : ''}${r.shot ? '  ' + r.shot : ''}`);
    for (const e of errors.slice(0, 3)) console.log('     ! ' + e);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`${failed ? name.toUpperCase() + ' FAILED' : name.toUpperCase() + ' OK'} -> shots/gates/${name}/report.json`);
  return { failed, report };
}
