// Dead-air probe. Plays both endings on both screens with the canonical player and lists every window
// longer than LIMIT seconds in which the player can do nothing useful and nothing visible is happening:
// no line on screen, Jo still, the neighbour still, no fade in flight. node tools/stall.mjs [limit]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no dist/small-hours.html. Run: node tools/build.mjs'); process.exit(1); }
const LIMIT = +(process.argv[2] || 5);
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const VIEWS = [{ name: 'desk', w: 1440, h: 900 }, { name: 'phone', w: 390, h: 844 }];
let worst = 0;
for (const v of VIEWS) for (const ending of ['hand', 'sensor']) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  await page.goto(pathToFileURL(dist).href);
  await page.waitForFunction(() => window.__game && window.__game.ready);
  const out = await page.evaluate(({ ending, limit }) => {
    const g = window.__game, s = g.state; g.auto(false); g.setQuality(0, true);
    g.goto('n1_open', { ending });
    const USE = new Set(['barrel', 'valve', 'tray', 'sensor', 'cup']);
    const windows = []; let open = null, t = 0, lastBeat = s.beat, beatsAt = [[s.beat, 0]];
    const still = (a) => a === 'idle' || a === 'sit' || a === 'below';
    // small visible gestures count as something happening: the hat coming off, the book opening (1.6 s each), a page turning
    let gestureUntil = -1, hatWas = false, bookWas = false;
    for (let i = 0; i < 30 * 700 && s.beat !== 'end'; i++) {
      g.step(1 / 30, true); t += 1 / 30;
      if (s.beat !== lastBeat) { lastBeat = s.beat; beatsAt.push([s.beat, +t.toFixed(1)]); }
      const canAct = s.hot.some((id) => USE.has(id) || /^p\d/.test(id));
      if (s.jo.hatOff && !hatWas) gestureUntil = t + 1.6; if (s.jo.book && !bookWas) gestureUntil = t + 1.6; hatWas = !!s.jo.hatOff; bookWas = !!s.jo.book;
      // the reading beat's held quiet is carried by the sky paling and her looking up; the by-hand close by the cup held out
      const dawnMoving = s.beat === 'epilogue' && Math.abs(s.sky.dawn - (window.__lastDawn ?? s.sky.dawn)) > 1e-5; window.__lastDawn = s.sky.dawn;
      const busy = t < gestureUntil || (s.jo.page || 0) > 0.001 || dawnMoving || (s.jo.lookUp || 0) > 0.01 || (s.jo.offer || 0) > 0.01 || !!s.text.line || !still(s.jo.action) || (s.tam.present && (s.tam.stage === 'climbing' || s.tam.stage === 'leaving')) || s.fade < 0.98 || (s.jo.dip > 0);
      const dead = !canAct && !busy;
      if (dead && !open) open = { from: t, beat: s.beat, bt: s.beatTime };
      if (!dead && open) { open.to = t; if (open.to - open.from >= limit) windows.push(open); open = null; }
    }
    if (open) { open.to = t; if (open.to - open.from >= limit) windows.push(open); }
    return { windows: windows.map((w) => ({ beat: w.beat, at: +w.bt.toFixed(1), secs: +(w.to - w.from).toFixed(1), t: +w.from.toFixed(1) })), total: +t.toFixed(1), beatsAt, end: s.beat };
  }, { ending, limit: LIMIT });
  console.log(`${v.name}-${ending}  ${out.total}s  reached ${out.end}`);
  console.log('  beats: ' + out.beatsAt.map(([b, t]) => `${b}@${t}`).join('  '));
  for (const w of out.windows) { worst = Math.max(worst, w.secs); console.log(`  dead ${w.secs}s  in ${w.beat} from ${w.at}s (game ${w.t}s)`); }
  await page.close();
}
await browser.close();
console.log(`worst dead air ${worst}s (limit ${LIMIT}s)`);
