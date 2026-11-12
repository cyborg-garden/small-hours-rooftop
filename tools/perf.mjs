// Simulation cost per tick (game + world + audio, no drawing) across the whole arc, and draw cost per frame
// at each quality tier. Software GL here, so the draw numbers are a ceiling, not a laptop.
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(pathToFileURL(join(root, 'dist/small-hours.html')).href);
await p.waitForFunction(() => window.__game && window.__game.ready);
const r = await p.evaluate(() => {
  const g = window.__game; g.auto(false); g.setOptions && 0; g.begin();
  const per = {}; let worst = 0, worstAt = '';
  for (let i = 0; i < 30 * 600 && g.state.beat !== 'end'; i++) {
    const t0 = performance.now(); g.step(1 / 30, true); const ms = performance.now() - t0;
    const k = g.state.beat; (per[k] = per[k] || { n: 0, sum: 0, max: 0 }); per[k].n++; per[k].sum += ms; per[k].max = Math.max(per[k].max, ms);
    if (ms > worst) { worst = ms; worstAt = k + '@' + g.state.beatTime.toFixed(1) + ' ' + g.state.jo.action; }
  }
  const out = {}; for (const k in per) out[k] = { mean: +(per[k].sum / per[k].n).toFixed(2), max: +per[k].max.toFixed(1) };
  const draw = [];
  for (const q of [0, 1, 2]) { g.setQuality(q, true); g.frameStats(); const t0 = performance.now(); for (let i = 0; i < 10; i++) g.frameStats(); draw.push({ q, ms: +((performance.now() - t0) / 10).toFixed(1) }); }
  return { sim: out, worst: +worst.toFixed(1), worstAt, draw, gameSeconds: +g.state.time.toFixed(1) };
});
console.log(JSON.stringify(r, null, 1)); await b.close();
