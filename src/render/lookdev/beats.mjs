// LOOK-DEV (render). Photographs the real game build at named beats, both screens, without the nine minute run.
//   node src/render/lookdev/beats.mjs [--html=dist/small-hours-render.html] [--beats=n1_water,turn] [--views=desk,phone]
//   [--settle=6] [--ending=hand|sensor] [--out=beats]
// Uses window.__game.goto (the canonical player), then lets the scene settle and takes one frame.
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const html = resolve(root, arg('html', 'dist/small-hours-render.html'));
if (!existsSync(html)) { console.error('no build at', html); process.exit(1); }
const VIEWS = { desk: { w: 1440, h: 900, dpr: 1 }, phone: { w: 390, h: 844, dpr: 2, touch: true }, wide: { w: 844, h: 390, dpr: 2, touch: true }, tablet: { w: 1024, h: 768, dpr: 1 } };
const beats = arg('beats', 'n1_open,n1_water,n1_quiet,turn,n2_more,n3_water,firstlight,choice,epilogue').split(',');
const settle = arg('settle', '6').split(',').map(Number), ending = arg('ending', 'hand');
const outDir = join(root, 'shots', arg('out', 'beats')); mkdirSync(outDir, { recursive: true });
const gl = process.argv.includes('--gpu') ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--mute-audio', ...gl] });
for (const vn of arg('views', 'desk,phone').split(',')) {
  const V = VIEWS[vn], ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
  for (const beat of beats) {
    await page.evaluate(([b, e]) => window.__game.goto(b, { ending: e }), [beat, ending]);
    for (const s of settle) {
      await page.evaluate((t) => { window.__game.step(t, true); window.__game.frameStats(); }, s);
      const st = await page.evaluate(() => { const s = window.__game.state; return { beat: s.beat, shot: s.camera.shot, action: s.jo.action }; });
      await page.screenshot({ path: join(outDir, `${vn}-${beat}${settle.length > 1 ? '-' + s : ''}.png`) });
      console.log(vn, beat, s, JSON.stringify(st));
    }
  }
  if (errs.length) console.log('  errors:', [...new Set(errs)].slice(0, 5).join('\n  '));
  await ctx.close();
}
await browser.close();
