// Gate: the choice cannot be skipped and cannot be picked by accident, and the reading ending is short.
//   opens    the two labels appear within 0.5 s of the 4:31 line having been read
//   stray    six seconds of stray taps all over the picture (on the cup in her hand, on her, on the shelf, a finger
//            already coming down as the labels appear) choose nothing
//   chooses  a real tap on each label picks that label
//   length   from the tap on "Put a sensor on the gift shelf" to the end card: 25 to 45 seconds of game time
// SH_BREAK=stray lets a tap on the cup in her hand choose (as it once could); the gate goes red.
//   node tools/choice.mjs [--html=path]      SH_GPU=1 is faster
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { VIEWS, GL, htmlPath } from './gates/drive.mjs';
const dist = htmlPath(); if (!existsSync(dist)) { console.error('no build'); process.exit(1); }
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
let failed = false;
for (const v of VIEWS) for (const pick of ['sensor', 'cup']) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate((brk) => { const G = window.__game; G.setQuality(1, true); G.auto(false); if (brk === 'stray') G.state.breakStray = true;
    window.__ch = { sum: null, open: null }; G.bus.on('marlow:line', (p) => { if (p.key === 'sum') window.__ch.sum = G.state.time; }); G.bus.on('choice:open', () => { window.__ch.open = G.state.time; });
    G.goto('firstlight', { ending: 'sensor' });
    for (let i = 0; i < 30 * 12 && G.state.beat !== 'choice'; i++) G.step(1 / 30);
  }, process.env.SH_BREAK);
  const ch = await page.evaluate(() => window.__ch), fails = [];
  const late = ch.open - (ch.sum + 4.2);   // the line holds 4.2 s
  if (ch.sum == null || ch.open == null || late > 0.5) fails.push(`opens: line at ${ch.sum}, labels at ${ch.open} (${late.toFixed(2)} s after it was read)`);
  // a finger already coming down where the "by hand" label appears, released once it can be pressed
  const tapAt = (x, y) => (v.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  let rng = 7; const rnd = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const cupLabel = async () => (await page.evaluate(() => window.__game.ui())).find((r) => r.name === 'choice:cup');
  { const r = await cupLabel(); if (r) { await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await page.mouse.down(); await page.evaluate(() => window.__game.step(2.0)); await page.mouse.up(); } }
  for (let k = 0; k < 60; k++) {
    const st = await page.evaluate(() => { const G = window.__game, c = G.screenOf('cup'), s = G.screenOf('sensor'); return { c, s, rects: G.ui().filter((r) => r.name.startsWith('choice:')) }; });
    const pts = [[st.c.x, st.c.y], [st.c.x, st.c.y - 40], [st.s.x, st.s.y], [rnd() * v.w, 60 + rnd() * (v.h - 120)]];
    for (const [x, y] of pts) { if (st.rects.some((r) => x > r.x - 6 && x < r.x + r.w + 6 && y > r.y - 6 && y < r.y + r.h + 6)) continue; await tapAt(x, y); }
    await page.evaluate(() => window.__game.step(0.1));
  }
  const stray = await page.evaluate(() => window.__game.state.ending);
  if (stray) fails.push(`stray: a stray tap chose "${stray}"`);
  // now a real tap on the label
  let len = null, chose = null;
  if (!stray) {
    const r = (await page.evaluate(() => window.__game.ui())).find((x) => x.name === 'choice:' + pick);
    if (!r) fails.push('chooses: no label ' + pick); else {
      await tapAt(r.x + r.w / 2, r.y + r.h / 2);
      const res = await page.evaluate(() => { const G = window.__game, t0 = G.state.time, e = G.state.ending; for (let i = 0; i < 30 * 120 && G.state.beat !== 'end'; i++) G.step(1 / 30); return { e, len: G.state.time - t0, beat: G.state.beat }; });
      chose = res.e; len = res.len;
      const want = pick === 'cup' ? 'hand' : 'sensor';
      if (chose !== want) fails.push(`chooses: tapping ${pick} gave ${chose}`);
      if (pick === 'sensor' && (len < 25 || len > 45)) fails.push(`length: the reading ending runs ${len.toFixed(1)} s`);
    }
  }
  if (errors.length) fails.push(...errors);
  failed = failed || fails.length > 0;
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${v.name}-${pick}  labels ${late.toFixed(2)} s after the line; stray taps chose ${stray || 'nothing'}; ${chose ? chose + ' ending runs ' + len.toFixed(1) + ' s to the card' : ''}`);
  for (const f of fails) console.log('     - ' + f);
  await ctx.close();
}
await browser.close();
console.log(failed ? 'CHOICE FAILED' : 'CHOICE OK');
process.exit(failed ? 1 : 0);
