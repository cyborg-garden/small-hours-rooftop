// Gate: light stability. No visible flicker on a large surface unless something motivates it (the water, the
// mist, a body crossing the lamp), and no whole-frame brightness swing over the game's own limit (0.06 in 0.25 s).
// The picture is read back at 15 frames a second in several shots on both screens; every 8 px cell's luminance
// is followed through time. A cell flickers when it swings more than FLICK within a second AND changes direction
// at least CROSS times in that second (a slow drift, a breath, a fade and a walking figure all fail that test; a
// shimmer, a shadow-map crawl and a light that jitters pass it). Flickering cells are grown into regions; a region
// larger than AREA of the frame that is not inside a motivated zone is a failure.
//   node tools/light.mjs [--only=desk] [--html=path] [--save]      frames and heat maps go to shots/gates/light/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (process.argv.find((a) => a.startsWith('--html=')) || '').slice(7) || join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const out = join(root, 'shots/gates/light'); mkdirSync(out, { recursive: true });
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const FPS = 15, SECONDS = 3, FLICK = 0.035, CROSS = 4, AREA = 0.004, MEAN_STEP = 0.06;
// where to look: a beat to play to, seconds to settle, and what motivates change there (zones are named; the page resolves them)
const SITUATIONS = [
  { name: 'n1-open', beat: 'n1_open', settle: 3, zones: ['mist'] },
  { name: 'n1-pour', beat: 'n1_water', until: (s) => s.jo.action === 'pour' && s.jo.actionT > 0.5, zones: ['water'] },
  { name: 'n1-quiet', beat: 'n1_quiet', settle: 4, zones: [] },
  { name: 'turn-climb', beat: 'turn', settle: 5, zones: ['stairs'] },
  { name: 'n3-pour', beat: 'n3_water', until: (s) => s.jo.action === 'pour' && s.jo.actionT > 0.5, zones: ['water'] },
  { name: 'choice', beat: 'choice', settle: 2, zones: [] },
  { name: 'epilogue-sensor', beat: 'epilogue', ending: 'sensor', settle: 6, zones: ['mist'] },
  { name: 'epilogue-read', beat: 'epilogue', ending: 'sensor', settle: 32, zones: [] },   // she reads by the stair light: it must hold steady
  { name: 'epilogue-hand', beat: 'epilogue', ending: 'hand', settle: 24, zones: ['water', 'stairs'] },
];
const VIEWS = [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }].filter((v) => !only || v.name === only);

const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const report = { when: new Date().toISOString(), views: [] }; let failed = false;
for (const V of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dpr, hasTouch: V.touch, isMobile: V.touch });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
  const rv = { view: V.name, situations: [], errors };
  for (const S of SITUATIONS) {
    const r = await page.evaluate(async ([S, FPS, SECONDS, FLICK, CROSS]) => {
      const G = window.__game, st = G.state;
      G.goto('title'); G.goto(S.beat, { ending: S.ending || 'hand' });
      if (S.until) { const f = new Function('s', 'return (' + S.until + ')(s)'); for (let i = 0; i < 30 * 60 && !f(st); i++) G.step(1 / 30, true); } else G.step(S.settle || 2, true);
      // wait for the camera to come to rest (a shot change is a move, not a flicker); the breath of sway is under a millimetre a frame
      const cam = G.debug().camera, last = cam.position.clone(); let still = 0, waited = 0;
      while (still < 6 && waited < 30) { G.step(1 / FPS, false); waited += 1 / FPS; if (cam.position.distanceTo(last) < 0.0012) still++; else still = 0; last.copy(cam.position); }
      const gl = G.debug().render.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, cell = Math.max(4, Math.round(8 * (W / st.viewport.w)));
      const cw = Math.floor(W / cell), ch = Math.floor(H / cell), n = cw * ch, N = FPS * SECONDS, means = [];
      const px = new Uint8Array(W * H * 4);
      // capture up to twice the window, remembering how far the camera moved each frame, then analyse the longest still stretch
      const frames = [], moved = [], trail = [];
      for (let f = 0; f < 2 * N; f++) {
        G.step(1 / FPS, false); G.frameStats();
        moved.push(cam.position.distanceTo(last)); last.copy(cam.position);
        if (f % 5 === 0) for (const P of [st.jo, st.tam]) if (P.present) trail.push({ x: P.pos.x, y: P.y || 0, z: P.pos.z });   // where people were while the window ran
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const cells = new Float32Array(n); let tot = 0;
        for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
          let s = 0, k = 0;
          for (let y = cy * cell; y < (cy + 1) * cell; y += 2) for (let x = cx * cell; x < (cx + 1) * cell; x += 2) { const o = (y * W + x) * 4; s += 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]; k++; }
          const v = s / k / 255; cells[cy * cw + cx] = v; tot += v;
        }
        frames.push(cells); means.push(tot / n);
        if (f >= N - 1 && moved.slice(f - N + 1, f + 1).every((d) => d < 0.0015)) break;   // a whole still window is in hand
      }
      let f0 = 0, best = -1; for (let a = 0; a + N <= frames.length; a++) { const run = moved.slice(a, a + N).filter((d) => d < 0.0015).length; if (run > best) { best = run; f0 = a; } }
      const cameraMoved = best < N;
      const series = new Float32Array(n * N); for (let f = 0; f < N; f++) { const src = frames[Math.min(frames.length - 1, f0 + f)]; for (let c = 0; c < n; c++) series[c * N + f] = src[c]; }
      // per cell: the biggest swing inside any one-second window, and the direction changes inside it
      const flick = new Uint8Array(n), amp = new Float32Array(n); const win = FPS;
      for (let c = 0; c < n; c++) {
        let worstAmp = 0, worstCross = 0;
        for (let f0 = 0; f0 + win <= N; f0 += Math.max(1, win >> 1)) {
          let lo = 9, hi = -9, cross = 0, lastDir = 0;
          for (let f = f0; f < f0 + win; f++) { const v = series[c * N + f]; if (v < lo) lo = v; if (v > hi) hi = v;
            if (f > f0) { const d = v - series[c * N + f - 1]; if (Math.abs(d) > 0.004) { const dir = Math.sign(d); if (lastDir && dir !== lastDir) cross++; lastDir = dir; } } }
          if (hi - lo > worstAmp) worstAmp = hi - lo; if (cross > worstCross) worstCross = cross;
        }
        amp[c] = worstAmp; if (worstAmp > FLICK && worstCross >= CROSS) flick[c] = 1;
      }
      // motivated zones, in buffer pixels (y up, as readPixels gives them)
      const sx = W / st.viewport.w, sy = H / st.viewport.h, zones = [];
      const box = (pts, m) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { const q = G.project(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
        return { x0: (x0 - m) * sx, x1: (x1 + m) * sx, y0: H - (y1 + m) * sy, y1: H - (y0 - m) * sy }; };
      // people move; a moving person is never flicker. Their boxes are always motivated zones.
      // (round six: every place they stood during the window, not only the last: someone walking across a still shot
      // left their earlier box unmotivated)
      for (const [who, P] of [['jo', st.jo], ['tam', st.tam], ...trail.map((t) => ['trail', { present: true, pos: t, y: t.y }])]) if (P.present) zones.push({ z: who, ...box([{ x: P.pos.x - 0.7, y: (P.y || 0) - 0.1, z: P.pos.z - 0.7 }, { x: P.pos.x + 0.7, y: (P.y || 0) + 2.1, z: P.pos.z + 0.7 }, { x: P.pos.x - 0.7, y: (P.y || 0) + 2.1, z: P.pos.z + 0.7 }, { x: P.pos.x + 0.7, y: (P.y || 0) - 0.1, z: P.pos.z - 0.7 }], 36) });
      for (const z of S.zones) {
        if (z === 'water') {   // the ribbon, the splash, and the person pouring it
          const j = st.jo, a = st.pots.find((p) => p.id === j.target);
          if (a) zones.push({ z, ...box([{ x: a.pos.x, y: a.pos.y - 0.1, z: a.pos.z }, { x: a.pos.x, y: a.pos.y + 0.9, z: a.pos.z }], 70) });
          if (j.present) zones.push({ z, ...box([{ x: j.pos.x - 0.6, y: 0, z: j.pos.z - 0.6 }, { x: j.pos.x + 0.6, y: 1.95, z: j.pos.z + 0.6 }, { x: j.pos.x - 0.6, y: 1.95, z: j.pos.z + 0.6 }, { x: j.pos.x + 0.6, y: 0, z: j.pos.z - 0.6 }], 30) }); }
        if (z === 'mist') for (const b of [[-4.1, -1.9], [-0.4, -1.9], [3.3, -1.9]]) zones.push({ z, ...box([{ x: b[0] - 1.6, y: 0.3, z: b[1] - 0.6 }, { x: b[0] + 1.6, y: 1.4, z: b[1] + 0.6 }], 20) });
        if (z === 'mist' && st.marlow.shelfSensor) zones.push({ z, ...box([{ x: -2.6, y: 0.2, z: 3.6 }, { x: 0.3, y: 1.3, z: 4.3 }], 20) });
        if (z === 'stairs') zones.push({ z, ...box([{ x: -6.3, y: -2.7, z: 3.4 }, { x: -2.6, y: 0.4, z: 5.0 }], 24) });
      }
      const inZone = (cx, cy) => { const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell; return zones.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1); };
      // regions of flickering cells (4-connected), skipping motivated zones
      const seen = new Uint8Array(n), regions = [];
      for (let c = 0; c < n; c++) {
        if (!flick[c] || seen[c]) continue;
        const stack = [c], cells = []; seen[c] = 1;
        while (stack.length) { const q = stack.pop(); cells.push(q); const qx = q % cw, qy = (q / cw) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = qx + dx, y = qy + dy; if (x < 0 || y < 0 || x >= cw || y >= ch) continue; const k = y * cw + x; if (flick[k] && !seen[k]) { seen[k] = 1; stack.push(k); } } }
        const motivated = cells.filter((q) => inZone(q % cw, (q / cw) | 0)).length / cells.length > 0.5;
        let ax = 0, ay = 0, am = 0; for (const q of cells) { ax += q % cw; ay += (q / cw) | 0; am = Math.max(am, amp[q]); }
        regions.push({ cells: cells.length, area: +(cells.length / n).toFixed(4), motivated, amp: +am.toFixed(3), x: Math.round((ax / cells.length + 0.5) * cell / sx), y: Math.round(st.viewport.h - (ay / cells.length + 0.5) * cell / sy) });
      }
      regions.sort((a, b) => b.cells - a.cells);
      // the heat map, as a data URL: amplitude in red, flicker in white, zones outlined in green
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const c2 = cv.getContext('2d'), img = c2.createImageData(cw, ch);
      for (let c = 0; c < n; c++) { const cx = c % cw, cy = (c / cw) | 0, o = ((ch - 1 - cy) * cw + cx) * 4, a = Math.min(1, amp[c] / 0.12);
        img.data[o] = flick[c] ? 255 : Math.round(a * 255); img.data[o + 1] = flick[c] ? 255 : Math.round(series[c * N] * 90); img.data[o + 2] = flick[c] ? 255 : Math.round(series[c * N] * 90); img.data[o + 3] = 255; }
      c2.putImageData(img, 0, 0); c2.strokeStyle = '#3f3'; c2.lineWidth = 1;
      for (const b of zones) c2.strokeRect(b.x0 / cell, ch - b.y1 / cell, (b.x1 - b.x0) / cell, (b.y1 - b.y0) / cell);
      let meanStep = 0; const per = Math.round(FPS * 0.25); for (let f = per; f < means.length; f++) meanStep = Math.max(meanStep, Math.abs(means[f] - means[f - per]));
      return { shot: st.camera.shot, beat: st.beat, action: st.jo.action, waited: +waited.toFixed(2), cameraMoved, cells: n, flicking: flick.reduce((a, b) => a + b, 0), regions: regions.slice(0, 8), zones: zones.map((z) => z.z), meanStep: +meanStep.toFixed(4), map: cv.toDataURL('image/png') };
    }, [{ ...S, until: S.until ? S.until.toString() : null }, FPS, SECONDS, FLICK, CROSS]);
    const bad = r.regions.filter((g) => !g.motivated && g.area >= AREA);
    const ok = bad.length === 0 && r.meanStep <= MEAN_STEP && !r.cameraMoved;
    const tag = `${V.name}-${S.name}`;
    writeFileSync(join(out, tag + '-map.png'), Buffer.from(r.map.split(',')[1], 'base64'));
    if (!ok || process.argv.includes('--save')) await page.screenshot({ path: join(out, tag + '.png') });
    delete r.map;
    rv.situations.push({ name: S.name, ok, bad, ...r });
    failed = failed || !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${tag}  shot ${r.shot} (${r.action}, still after ${r.waited}s)  flicker cells ${r.flicking}/${r.cells}  regions ${r.regions.length}  meanStep ${r.meanStep}`);
    for (const g of bad.slice(0, 4)) console.log(`     - unmotivated flicker: ${(g.area * 100).toFixed(2)}% of the frame, swing ${g.amp}, around ${g.x},${g.y} css px`);
    if (r.cameraMoved) console.log('     - the camera never held still for 3 s here: pick a calmer moment for this situation');
    if (r.meanStep > MEAN_STEP) console.log(`     - whole frame brightness moved ${r.meanStep} in 0.25 s (limit ${MEAN_STEP})`);
  }
  if (errors.length) { failed = true; console.log('     ! ' + errors[0]); }
  report.views.push(rv);
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(failed ? 'LIGHT FAILED -> shots/gates/light/report.json' : 'LIGHT OK -> shots/gates/light/report.json');
process.exit(failed ? 1 : 0);
