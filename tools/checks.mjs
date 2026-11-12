// Small delivery checks that the playthrough does not cover:
//   the export shape (title, no doctype/html/body, size), reduced motion is honoured, the game pauses when the
//   tab is hidden and resumes when it is shown, and nothing but the one file is ever requested.
import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlArg = process.argv.find((a) => a.startsWith('--html='));
const dist = htmlArg ? htmlArg.slice(7) : join(root, 'dist/small-hours.html');
const html = readFileSync(dist, 'utf8'), fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
check(/^<title>Small Hours<\/title>/.test(html), 'export starts with <title>Small Hours</title>');
check(!/<!doctype|<html|<head|<body/i.test(html), 'export has no doctype, html, head or body of its own');
check(statSync(dist).size < 6 * 1048576, `export under 6 MB (${(statSync(dist).size / 1048576).toFixed(2)} MB)`);
check(!/https?:\/\/(?!www\.w3\.org|threejs\.org|github\.com|mrdoob|creativecommons|khronos|opensource\.org)/i.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'no runtime URLs outside three.js doc comments');

const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
// 1. reduced motion: the flag is read, the camera does not sway, the UI drops its breathing
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); const req = []; p.on('request', (q) => { if (!q.url().startsWith('file:')) req.push(q.url()); });
  await p.goto(pathToFileURL(dist).href); await p.waitForFunction(() => window.__game && window.__game.ready);
  const r = await p.evaluate(() => { const g = window.__game; g.auto(false); g.begin(); g.step(25, true);
    const yaw = []; for (let i = 0; i < 60; i++) { g.step(0.5); g.frameStats(); yaw.push(g.state.camera.yaw); }
    return { flag: g.state.reducedMotion, yawMoved: Math.max(...yaw) - Math.min(...yaw) }; });
  check(r.flag === true, 'prefers-reduced-motion is read into state');
  check(r.yawMoved === 0, 'no orbit drift under reduced motion');
  check(req.length === 0, 'no network requests');
  await ctx.close();
}
// 2. hidden tab: the clock stops; shown again: it runs
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(dist).href); await p.waitForFunction(() => window.__game && window.__game.ready);
  await p.evaluate(() => { window.__game.begin(); });
  await p.waitForTimeout(1500);
  const hide = (hidden) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await hide(true); const t0 = await p.evaluate(() => window.__game.state.time); await p.waitForTimeout(1500); const t1 = await p.evaluate(() => window.__game.state.time);
  check(await p.evaluate(() => window.__game.state.paused), 'state.paused while the tab is hidden');
  check(t1 === t0, `game time holds while hidden (${t0.toFixed(2)} -> ${t1.toFixed(2)})`);
  await hide(false); await p.waitForTimeout(1500); const t2 = await p.evaluate(() => window.__game.state.time);
  check(t2 > t1, `game time runs again when shown (${t1.toFixed(2)} -> ${t2.toFixed(2)})`);
  // the sound toggle is the only button during play, and every button is at least 44 px
  const ui = await p.evaluate(() => window.__game.ui());
  check(ui.every((r) => !['begin', 'again', 'sound'].includes(r.name) && !r.name.startsWith('choice') && !r.name.startsWith('arrow') || (r.w >= 44 && r.h >= 44)), 'every button is at least 44 px: ' + JSON.stringify(ui.map((r) => `${r.name} ${r.w}x${r.h}`)));
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `CHECKS FAILED (${fails.length})` : 'CHECKS OK');
process.exit(fails.length ? 1 : 0);
