// Quick look at named moments: plays forward with the canonical player and photographs.
//   node tools/peek.mjs --out=shots/peek --view=desk|phone --ending=hand|sensor  beat[+seconds] ...
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const out = join(root, arg('out', 'shots/peek')), view = arg('view', 'desk'), ending = arg('ending', 'hand');
const html = arg('html', join(root, 'dist/small-hours.html'));
const marks = process.argv.slice(2).filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const V = view === 'phone' ? { w: 390, h: 844, dpr: 2, touch: true } : { w: 1440, h: 900, dpr: 1, touch: false };
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: V.touch, isMobile: V.touch });
const page = await ctx.newPage(); const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
let n = 0;
for (const m of marks) {
  // beat[+seconds], or @action[:fraction] = keep playing until Jo is that far into that action
  const act = m.startsWith('@') ? m.slice(1).split(':') : null;
  const [beat, sec] = act ? ['', '0'] : m.split('+');
  const info = await page.evaluate(([b, s, e, a]) => { const g = window.__game;
    if (a) { const fr = +(a[1] || 0.5); for (let i = 0; i < 30 * 120; i++) { const j = g.state.jo; if (j.action === a[0] && (!a[2] || j.target === a[2]) && j.actionDur && j.actionT / j.actionDur >= fr) break; g.step(1 / 30, true); } }
    else { const bb = b.replace('~', ''); if (g.state.beat !== bb) g.goto(bb, { ending: e }); if (+s) g.step(+s, !b.endsWith('~'));  }
    const st = g.state; return { beat: st.beat, bt: +st.beatTime.toFixed(1), jo: st.jo.action, tam: st.tam.stage, text: st.text && st.text.line }; }, [beat, sec || '0', ending, act]);
  const f = `${String(++n).padStart(2, '0')}-${(act ? act.join('-') : beat + (sec ? '+' + sec : '')).replace(/[^a-z0-9+.-]/gi, '_')}.png`;
  await page.evaluate(() => window.__game.frameStats());
  await page.screenshot({ path: join(out, f) });
  console.log(f, JSON.stringify(info));
}
console.log('errors', errors.length, errors.slice(0, 5).join('\n'));
await browser.close();
