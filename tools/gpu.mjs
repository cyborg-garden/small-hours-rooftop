// Real-GPU frame time probe: headless=new Chrome with hardware ANGLE, both screens, each quality tier.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const html = process.argv[2];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--headless=new', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=metal', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
for (const v of [{ w: 1440, h: 900, dpr: 1 }, { w: 390, h: 844, dpr: 3 }]) {
  const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.dpr > 1, isMobile: v.dpr > 1 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pathToFileURL(html).href); await p.waitForFunction(() => window.__game && window.__game.ready);
  const gpu = await p.evaluate(() => { const gl = window.__game && document.querySelector('canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
  const out = { view: `${v.w}x${v.h}@${v.dpr}`, gpu, tiers: [] };
  await p.evaluate(() => { window.__game.auto(false); window.__game.goto('n2_more', { ending: 'hand', settle: 3 }); window.__game.auto(true); });
  for (const q of [3, 2, 1, 0]) {
    await p.evaluate((q) => { window.__game.setQuality(q, true); }, q);
    await p.waitForTimeout(2500);
    const m = await p.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 90) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res({ median: +t[45].toFixed(1), p90: +t[81].toFixed(1), dpr: +window.__game.state.perf.frameMs.toFixed(1) }); } }; requestAnimationFrame(f); }));
    out.tiers.push({ q, ...m });
  }
  console.log(JSON.stringify(out), errs.length ? errs : '');
  await ctx.close();
}
await b.close();
