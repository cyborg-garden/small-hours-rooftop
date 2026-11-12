// LOOK-DEV (render). Builds the look-dev page and photographs every test scene on both screens.
//   node src/render/lookdev/shoot.mjs                 all poses, desk 1440x900 and phone 390x844, into shots/lookdev/
//   --live            use the live world module instead of the frozen grey-box fixture
//   --only=pour,dry   some poses      --views=desk    one screen      --q=1   quality tier
//   --stab            camera stability test: consecutive frames during a slow move, paper pinned and unpinned
//   --gpu             hardware GL (for frame time); default is software GL
//   --ab=uBand:0      a second set of frames with one paint uniform changed, saved with an -ab suffix
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const live = flag('live'), outDir = join(root, 'shots', arg('out', live ? 'lookdev-live' : 'lookdev'));
const out = await build({ entryPoints: [join(here, 'page.js')], bundle: true, format: 'iife', write: false, logLevel: 'warning', target: 'es2020',
  alias: { 'lookdev-world': live ? join(root, 'src/world/index.js') : join(here, 'greybox.js') } });
const html = `<!doctype html><meta charset="utf-8"><title>Small Hours look-dev</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#171925;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
<canvas id="c"></canvas><script>${out.outputFiles[0].text}</script>`;
mkdirSync(join(root, 'dist'), { recursive: true }); mkdirSync(outDir, { recursive: true });
const page0 = join(root, 'dist', live ? 'lookdev-render-live.html' : 'lookdev-render.html'); writeFileSync(page0, html);

const VIEWS = { desk: { w: 1440, h: 900, dpr: 1 }, phone: { w: 390, h: 844, dpr: 2, touch: true }, wide: { w: 844, h: 390, dpr: 2 }, tablet: { w: 1024, h: 768, dpr: 1 } };
const views = arg('views', 'desk,phone').split(',');
const SHOT_FOR = { dry: 'beds', pour: 'shelf', walk: 'follow', barrel: 'barrel', handoff: 'hatch', climbing: 'hatch', dawn: 'follow', sensor: 'epilogue', hand: 'epilogue' };
const only = arg('only', Object.keys(SHOT_FOR).join(',')).split(',');
const gl = flag('gpu') ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--mute-audio', ...gl] });
const q = arg('q', null), ab = arg('ab', null);
for (const vn of views) {
  const V = VIEWS[vn], ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(pathToFileURL(page0).href);
  await page.waitForFunction(() => window.__look && window.__look.ready, null, { timeout: 30000 });
  await page.evaluate((qq) => { window.__look.manual = true; if (qq !== null) window.__look.quality(+qq); }, q);
  if (flag('stability')) {
    const a = await page.evaluate(() => window.__look.stability(true)), b = await page.evaluate(() => window.__look.stability(false));
    console.log(vn, 'stability', JSON.stringify(a), JSON.stringify(b), a.crawl < b.crawl * 0.75 && a.stillFrameDiff === 0 ? 'OK' : 'FAIL');
  } else if (flag('stab')) {
    // a slow drift: the breath of sway plus a gentle orbit, 12 frames at 30 per second. Pinned, then unpinned.
    for (const pinned of [true, false]) {
      await page.evaluate((p) => { const L = window.__look; L.pose('pour', 'shelf'); L.post({ anchor: p }); }, pinned);
      for (let i = 0; i < 12; i++) {
        await page.evaluate((k) => { const L = window.__look; L.orbit(0.004 * k, 0.001 * k, 1, true); L.frame(); }, i);
        await page.screenshot({ path: join(outDir, `stab-${vn}-${pinned ? 'pinned' : 'loose'}-${String(i).padStart(2, '0')}.png`) });
      }
    }
    await page.evaluate(() => window.__look.post({ anchor: true }));
  } else {
    for (const pose of only) {
      const shots = arg('shot', SHOT_FOR[pose] || 'wide').split(',');
      for (const shot of shots) {
        await page.evaluate(([p, s]) => { window.__look.pose(p, s); window.__look.frame(); }, [pose, shot]);
        const f = `${vn}-${pose}${shots.length > 1 ? '-' + shot : ''}.png`;
        await page.screenshot({ path: join(outDir, f) });
        if (ab) { const [k, val] = ab.split(':');
          await page.evaluate(([kk, vv]) => { const L = window.__look; if (kk in L.render.post.options) L.post({ [kk]: !!+vv }); else L.uniform(kk, +vv); L.frame(); }, [k, val]);
          await page.screenshot({ path: join(outDir, f.replace('.png', '-ab.png')) });
          await page.evaluate(() => location.reload()); await page.waitForFunction(() => window.__look && window.__look.ready);
          await page.evaluate((qq) => { window.__look.manual = true; if (qq !== null) window.__look.quality(+qq); }, q); }
      }
    }
  }
  if (flag('breakdown')) console.log(vn, 'breakdown ms', JSON.stringify(await page.evaluate(() => { window.__look.pose('pour', 'shelf'); window.__look.bench(3); return window.__look.breakdown(); })));
  if (flag('bench')) { const ms = await page.evaluate(() => { window.__look.pose('pour', 'shelf'); window.__look.bench(4); return window.__look.bench(+(new URLSearchParams(location.search).get("n") || 24)); });
    console.log(vn, 'bench ms/frame', ms.toFixed(2), JSON.stringify(await page.evaluate(() => window.__look.info()))); }
  const info = await page.evaluate(() => ({ ...window.__look.info(), errors: window.__look.errors }));
  console.log(vn, JSON.stringify(info), errs.length ? '\n  console: ' + [...new Set(errs)].slice(0, 6).join('\n  ') : '');
  await ctx.close();
}
await browser.close();
console.log('frames in', outDir.replace(root + '/', ''));
