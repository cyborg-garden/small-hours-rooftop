// Gate: the blind player. A robot that knows nothing about the script tries to finish the game using only what is
// on the screen: the pixels of the picture and the visible paper buttons. It never reads game state or the beat
// list. It finds things the way a person does: the roof is still, something breathes (the slow brightening of
// what can be tapped), a paper arrow stands at the edge, a label hangs on a string. It taps the most salient
// candidate it has not tried lately, and watches whether anything answers (a line of text, the picture moving).
//
// The referee (this script, outside the robot) reads state only to measure: which beats were reached, and how
// long each search took. A search is the game time from the moment something new can be tapped while Jo is free
// until the robot taps a thing that answers. The gate fails if any search in a beat takes more than SEARCH_CAP
// seconds, if the robot cannot reach the end within the time cap, or if the two runs do not reach both endings.
//   SH_GPU=1 node tools/blind.mjs [--only=desk-0] [--html=path]      frames into shots/gates/blind/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (process.argv.find((a) => a.startsWith('--html=')) || '').slice(7) || join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const out = join(root, 'shots/gates/blind'); mkdirSync(out, { recursive: true });
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const SEARCH_CAP = 20, GAME_CAP = 25 * 60, STEP = 0.4, WINDOW = 16, CELL = 10;   // two breaths of pictures: a swing at that period stands out from a sway at another
const VIEWS = [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }];
// two runs per screen: at the choice, the robot takes the first label it sees, then (second run) the other one
const RUNS = VIEWS.flatMap((v) => [0, 1].map((pick) => ({ ...v, pick }))).filter((r) => !only || `${r.name}-${r.pick}` === only);

const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const report = { when: new Date().toISOString(), runs: [] }; let failed = false;
for (const run of RUNS) {
  const tag = `${run.name}-${run.pick}`, t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: run.dpr, hasTouch: run.touch, isMobile: run.touch });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
  const press = (x, y) => (run.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

  // ---- the referee: steps time, measures searches, never tells the robot anything ------------------------------
  await page.evaluate(() => {
    const G = window.__game, s = G.state, R = { beats: [], search: {}, pending: null, taps: 0, hits: 0 };
    const LOOK = new Set(['marlow', 'city', 'chair', 'hatch']);
    G.bus.on('beat:enter', (p) => { R.beats.push(p.beat); R.pending = null; });
    G.bus.on('input:tap', () => { R.hits++; R.pending = null; });
    R.tick = () => {
      const free = ['idle', 'sit', 'read'].includes(s.jo.action), todo = s.hot.some((id) => !LOOK.has(id) && !(id === 'sensor' && s.beat !== 'choice'));
      if (free && todo && s.begun && s.beat !== 'end') { if (R.pending == null) R.pending = s.time; const t = s.time - R.pending; R.search[s.beat] = Math.max(R.search[s.beat] || 0, t); }
      else R.pending = null;
    };
    window.__ref = R;
  });
  const stepGame = (sec) => page.evaluate((sec) => { const G = window.__game; for (let t = 0; t < sec - 1e-6; t += 0.1) { G.step(0.1); window.__ref.tick(); } }, sec);
  const referee = () => page.evaluate(() => { const s = window.__game.state, R = window.__ref; return { beat: s.beat, time: s.time, ending: s.ending, search: R.search, beats: R.beats, taps: R.taps, hits: R.hits, action: s.jo.action }; });

  // ---- what the robot can see ---------------------------------------------------------------------------------
  // the picture, as a grid of cell luminances (readPixels of the canvas is what a screenshot would give)
  const see = () => page.evaluate((CELL) => {
    const G = window.__game, gl = G.debug().render.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, s = G.state.viewport;
    const cell = Math.round(CELL * W / s.w), cw = Math.floor(W / cell), ch = Math.floor(H / cell), px = new Uint8Array(W * H * 4);
    G.frameStats(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const v = new Array(cw * ch);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { let a = 0, k = 0;
      for (let y = cy * cell; y < (cy + 1) * cell; y += 3) for (let x = cx * cell; x < (cx + 1) * cell; x += 3) { const o = (y * W + x) * 4; a += 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]; k++; }
      v[(ch - 1 - cy) * cw + cx] = a / k / 255; }   // row 0 at the top, like a screenshot
    return { cw, ch, v, cssCell: s.w / cw };
  }, CELL);
  // the paper buttons that are showing (visible chrome, as a person sees it), and the line of text
  const chrome = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.2 && !el.disabled; };
    const B = [...document.querySelectorAll('#sh-ui button')].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { kind: b.classList.contains('begin') ? 'begin' : b.classList.contains('again') ? 'again' : b.classList.contains('choice') ? 'choice' : b.classList.contains('arrow') ? 'arrow' : b.classList.contains('snd') ? 'sound' : 'other', x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.textContent.trim() }; });
    const line = [...document.querySelectorAll('#sh-ui .line.on, #sh-ui .timecard.on')].map((l) => l.textContent).join('|');
    return { buttons: B, line };
  });

  // ---- the robot ------------------------------------------------------------------------------------------------
  const frames = [];                      // the last WINDOW pictures (3.2 s), for the breath
  const dead = new Map();                 // cells tapped lately that did not answer: key -> game time it may be tried again
  const log = [];
  let lastLine = '', lastTapAt = -99, waitingResponse = null, shotsTaken = 0;
  const shot = async (name) => { if (shotsTaken++ > 40) return; await page.screenshot({ path: join(out, `${tag}-${String(shotsTaken).padStart(2, '0')}-${name}.png`) }); };
  const candidates = (F) => {
    // detrend each cell over the window, then project onto one period of the 3.2 s breath; the amplitude is salience.
    const n = F.length, { cw, ch } = F[0], N = cw * ch, amp = new Float32Array(N), motion = new Float32Array(N), coh = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { const y = F[i].v[c]; sx += i; sy += y; sxx += i * i; sxy += i * y; }
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
      let cc = 0, ss = 0, mv = 0, vv = 0;
      for (let i = 0; i < n; i++) { const r = F[i].v[c] - (a + b * i), ph = (i / 8) * Math.PI * 2; cc += r * Math.cos(ph); ss += r * Math.sin(ph); vv += r * r; if (i) mv += Math.abs(F[i].v[c] - F[i - 1].v[c]); }
      amp[c] = Math.hypot(cc, ss) * 2 / n; motion[c] = mv / (n - 1);
      // coherence: how much of the cell's change is that one slow swing. A breath is nearly all of it; a walk is not.
      const power = (cc * cc + ss * ss) * 2 / n; coh[c] = vv > 1e-9 ? Math.min(1, power / vv) : 0;
    }
    // cells that breathe (a clear slow swing, not a jittering one), grown into blobs
    const on = new Uint8Array(N); for (let c = 0; c < N; c++) if (amp[c] > 0.005 && coh[c] > 0.7 && motion[c] < amp[c] * 1.6) on[c] = 1;
    const seen = new Uint8Array(N), blobs = [];
    for (let c = 0; c < N; c++) { if (!on[c] || seen[c]) continue; const st = [c], cells = []; seen[c] = 1;
      while (st.length) { const q = st.pop(); cells.push(q); const qx = q % cw, qy = (q / cw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const x = qx + dx, y = qy + dy; if (x < 0 || y < 0 || x >= cw || y >= ch) continue; const k = y * cw + x; if (on[k] && !seen[k]) { seen[k] = 1; st.push(k); } } }
      let bx = 0, by = 0, ba = 0; for (const q of cells) { const w = amp[q] * coh[q] * coh[q]; bx += (q % cw) * w; by += ((q / cw) | 0) * w; ba += w; }
      blobs.push({ x: (bx / ba + 0.5) * F[0].cssCell, y: (by / ba + 0.5) * F[0].cssCell, score: ba, cells: cells.length }); }
    blobs.sort((a, b) => b.score - a.score);
    let busy = 0; for (let c = 0; c < N; c++) if (motion[c] > 0.03) busy++;
    return { blobs, busy: busy / N };
  };
  const key = (x, y) => Math.round(x / 40) + ',' + Math.round(y / 40);

  // Begin: a paper button with a word on it. The robot presses it.
  let ch0 = await chrome(); const begin = ch0.buttons.find((b) => b.kind === 'begin');
  if (!begin) { failed = true; console.log(`FAIL ${tag}: no Begin button to see`); await ctx.close(); continue; }
  await press(begin.x, begin.y); await shot('begin');
  let ref = await referee(), done = false, reason = '';
  while (!done) {
    await stepGame(STEP);
    ref = await referee();
    if (ref.beat === 'end') { done = true; reason = 'end'; break; }
    if (ref.time > GAME_CAP) { done = true; reason = 'time cap'; break; }
    const C = await chrome();
    // something answered the last tap? a new line of text, or the picture busy (someone moving)
    const F = await see(); frames.push(F); if (frames.length > WINDOW) frames.shift();
    const lineNew = C.line && C.line !== lastLine; lastLine = C.line || lastLine;
    const { blobs, busy } = frames.length >= WINDOW ? candidates(frames) : { blobs: [], busy: 1 };
    if (waitingResponse) {
      if (lineNew || busy > 0.004 || ref.hits > waitingResponse.hits) { waitingResponse = null; }
      else if (ref.time - waitingResponse.at > 0.7) { dead.set(waitingResponse.key, ref.time + 20); log.push({ t: +ref.time.toFixed(1), miss: waitingResponse.key }); waitingResponse = null; }
      else continue;
    }
    // 1. paper buttons: a label (the choice), an arrow at the edge, Begin again
    const labels = C.buttons.filter((b) => b.kind === 'choice'), arrows = C.buttons.filter((b) => b.kind === 'arrow'), again = C.buttons.find((b) => b.kind === 'again');
    if (again) { await press(again.x, again.y); continue; }
    if (labels.length >= 2) { const b = labels[Math.min(run.pick, labels.length - 1)]; await press(b.x, b.y); await stepGame(0.3); log.push({ t: +ref.time.toFixed(1), label: b.text }); await shot('label'); continue; }
    if (labels.length === 1) { await press(labels[0].x, labels[0].y); continue; }
    if (arrows.length && ref.time - lastTapAt > 1.5) { const a = arrows[0]; const k = 'arrow' + key(a.x, a.y); if (!(dead.get(k) > ref.time)) { await press(a.x, a.y); lastTapAt = ref.time; waitingResponse = { at: ref.time, key: k, hits: ref.hits }; log.push({ t: +ref.time.toFixed(1), arrow: [Math.round(a.x), Math.round(a.y)] }); continue; } }
    // 2. the picture: wait while it is busy (someone is doing something), then tap what breathes
    if (busy > 0.012 || frames.length < WINDOW) continue;
    if (ref.time - lastTapAt < 1.2) continue;
    let pick = null;
    for (const b of blobs.filter((b) => !(dead.get(key(b.x, b.y)) > ref.time) && b.y > 40 && b.y < run.h - 40).slice(0, 6)) {
      if (!run.touch) {   // a mouse: pass over it and see whether the hand appears. No hand, no tap, and the spot is left alone a while
        await page.mouse.move(b.x, b.y); const hand = await page.evaluate(() => document.getElementById('c').style.cursor === 'pointer');
        if (!hand) { dead.set(key(b.x, b.y), ref.time + 12); continue; }
      }
      pick = b; break;
    }
    if (process.env.BLIND_DEBUG && blobs.length) log.push({ t: +ref.time.toFixed(1), top: blobs.slice(0, 4).map((b) => [Math.round(b.x), Math.round(b.y), +b.score.toFixed(3), b.cells]) });
    if (!pick) continue;
    await press(pick.x, pick.y); lastTapAt = ref.time; waitingResponse = { at: ref.time, key: key(pick.x, pick.y), hits: ref.hits };
    log.push({ t: +ref.time.toFixed(1), tap: [Math.round(pick.x), Math.round(pick.y)], score: +pick.score.toFixed(3), beat: ref.beat });
    if (log.filter((l) => l.tap).length <= 12) await shot('tap');
  }
  ref = await referee(); await shot('final');
  const slow = Object.entries(ref.search).filter(([, t]) => t > SEARCH_CAP);
  const r = { tag, reason, ending: ref.ending, gameSeconds: +ref.time.toFixed(1), realSeconds: Math.round((Date.now() - t0) / 1000), beats: ref.beats, search: Object.fromEntries(Object.entries(ref.search).map(([k, v]) => [k, +v.toFixed(1)])), taps: log.filter((l) => l.tap || l.arrow).length, hits: ref.hits, misses: log.filter((l) => l.miss).length, slow, errors, log: log.slice(0, 400) };
  const ok = reason === 'end' && !slow.length && !errors.length;
  failed = failed || !ok; report.runs.push(r);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${tag}  ${reason}  ending ${ref.ending}  ${r.gameSeconds}s game / ${r.realSeconds}s real  taps ${r.taps} (hits ${r.hits}, misses ${r.misses})  longest search per beat: ${Object.entries(r.search).map(([k, v]) => k + ' ' + v + 's').join(', ')}`);
  for (const [b, t] of slow) console.log(`     - ${b}: the robot searched ${t.toFixed(1)} s for the next thing (cap ${SEARCH_CAP} s)`);
  if (reason !== 'end') console.log(`     - stopped in ${ref.beat} after ${r.gameSeconds} s`);
  for (const e of errors.slice(0, 2)) console.log('     ! ' + e);
  await ctx.close();
}
await browser.close();
const endings = new Set(report.runs.filter((r) => r.reason === 'end').map((r) => r.ending));
if (!only && (!endings.has('sensor') || !endings.has('hand'))) { failed = true; console.log('     - the two runs did not reach both endings: ' + [...endings].join(', ')); }
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(failed ? 'BLIND FAILED -> shots/gates/blind/report.json' : 'BLIND OK -> shots/gates/blind/report.json');
process.exit(failed ? 1 : 0);
