// LOOK-DEV (render). The render module's own checks, run in headless Chromium against the look-dev page.
//   node src/render/lookdev/check.mjs                  every check, both screens. Exit 1 on any failure.
//   node src/render/lookdev/check.mjs --sabotage       breaks each thing on purpose and expects each check to go red
// Checks: paper stays pinned during a pan (and a still picture does not change at all), quality steps down when
// frames run long and not otherwise, reduced motion stops the sway, a shot change starts gently, the lamp never
// pops, the sensor ending has no warm paint, every material writes the ink channel and water is not outlined.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
const sab = process.argv.includes('--sabotage');
const out = await build({ entryPoints: [join(here, 'page.js')], bundle: true, format: 'iife', write: false, logLevel: 'warning', target: 'es2020', alias: { 'lookdev-world': join(here, 'greybox.js') } });
mkdirSync(join(root, 'dist'), { recursive: true });
const file = join(root, 'dist/lookdev-render-check.html');
writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>check</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#171925;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas id="c"></canvas><script>${out.outputFiles[0].text}</script>`);
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const V of [{ name: 'desk', w: 1440, h: 900, dpr: 1 }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => window.__look && window.__look.ready);
  await page.evaluate(() => { window.__look.manual = true; });
  const report = (name, r, expectRed) => { const good = expectRed ? !r.ok : r.ok; if (!good) bad++;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${V.name} ${name}${expectRed ? ' (sabotaged, went red as it should)'.replace('went red as it should', r.ok ? 'STAYED GREEN' : 'went red') : ''}  ${JSON.stringify(r)}`); };
  // stability: pinned paper against loose paper during a pan
  const pin = await page.evaluate(() => window.__look.stability(true)), loose = await page.evaluate(() => window.__look.stability(false));
  const st = sab ? loose : pin;
  report('stability', { ok: st.crawl < loose.crawl * 0.75 && st.stillFrameDiff === 0, crawl: st.crawl, crawlIfLoose: loose.crawl, stillFrameDiff: st.stillFrameDiff }, sab);
  for (const name of ['quality', 'reducedMotion', 'softCamera', 'lamp', 'warm', 'ink']) report(name, await page.evaluate(([n, s]) => window.__look.checks[n](s), [name, sab]), sab);
  if (!sab) report('tiers', await page.evaluate(() => window.__look.checks.tiers()), false);
  if (errs.length) { bad++; console.log('FAIL', V.name, 'console errors:', [...new Set(errs)].slice(0, 4).join(' | ')); }
  await ctx.close();
}
await browser.close();
console.log(bad ? `RENDER CHECKS FAILED (${bad})` : sab ? 'SABOTAGE RUN OK: every check went red' : 'RENDER CHECKS OK');
process.exit(bad ? 1 : 0);
