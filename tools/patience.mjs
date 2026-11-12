// Gate: the patient player, and the faces. Round five's blind review found things the canonical player can never
// see, because it taps the next thing the moment it can: a tray nobody takes, a dawn that waits for every pot, a black
// screen between scenes, a toast that names the wrong thing, a barrel that does not answer the mouse, an arrow that
// sometimes does nothing, an ending that explains itself, and faces with nothing in them. Each check plays the real
// build and measures; none reads the script.
//   tray      left alone at the hand-off: a mark on the tray within 6 s, and it changes hands by itself within 15 s
//   dawn      night three, a player who stops after one cup from the tap: the choice comes within 14 s, pots still dry
//   dark      both endings, every screen: never more than 0.8 s of a near-black picture with no words on it (a slow
//             machine plays game time at half speed or less, so 0.8 s here was the reviewer's 6 s), and no cut hangs
//   toast     pouring from an empty cup says the cup is empty
//   barrel    the mouse over any part of the barrel (stand to rim) shows a hand, in three shots
//   arrows    every edge arrow that shows, pressed, sends her there (or says why not); a spent arrow is gone at once
//   reading   the sensor ending, with no look ever taken: she comes up and sits, says nothing, holds at least 25 s, and
//             ends on its own card
//   opening   from Begin: she is on screen within 8 s, and the roof is the player's within 18 s
//   faces     both people: pale eyes with dark irises, brows, a mouth, each a clear value step from the skin, and in the
//             reading close-up the camera sees her eyes, not hair
//   node tools/patience.mjs [--only=tray,dawn] [--html=path]      SH_GPU=1 for a real GPU
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (process.argv.find((a) => a.startsWith('--html=')) || '').slice(7) || join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const only = ((process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const VIEWS = [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }];
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
let failed = 0;
const report = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

async function open(v) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.setQuality(0, true); window.__game.auto(false); });
  return { ctx, page, errors };
}

for (const v of VIEWS) {
  // ---- tray: nobody takes it ------------------------------------------------------------------------------------
  if (want('tray')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state; G.goto('turn');
      for (let i = 0; i < 30 * 60 && !s.hot.includes('tray'); i++) G.step(1 / 30, true);
      let mark = null, taken = null, t = 0;
      for (let i = 0; i < 30 * 20 && taken == null; i++) {
        G.step(1 / 30, false); t += 1 / 30;   // no player at all
        if (mark == null && [...document.querySelectorAll('#sh-ui svg.fx circle.ring')].some((c) => +c.getAttribute('opacity') > 0.05)) mark = t;
        if (!s.tam.hasTray) taken = t;
      }
      return { mark, taken };
    });
    report(r.mark != null && r.mark <= 6, `${v.name} tray: a mark on the tray at ${r.mark == null ? 'never' : r.mark.toFixed(1) + ' s'} (cap 6 s)`);
    report(r.taken != null && r.taken <= 15, `${v.name} tray: changes hands by itself at ${r.taken == null ? 'never' : r.taken.toFixed(1) + ' s'} (cap 15 s)`);
    await ctx.close();
  }
  // ---- dawn: one cup from the tap, then the player stops ----------------------------------------------------------
  if (want('dawn')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state; G.goto('n3_water');
      const free = () => ['idle', 'sit'].includes(s.jo.action) && !s.jo.moving;
      let stopAt = null;
      for (let i = 0; i < 30 * 240 && s.beat === 'n3_water'; i++) {
        if (stopAt == null) {
          if (s.valve.fills >= 1 && s.jo.cup <= 0 && s.jo.action === 'idle') stopAt = s.time;
          else if (s.jo.action === 'idle' && G.step && true) {
            const dry = s.pots.filter((p) => p.present && !p.watered && s.hot.includes(p.id));
            if (s.jo.cup > 0 && dry.length) G.tap(dry[0].id); else if (s.jo.cup <= 0) G.tap(s.barrel.scoops > 0 || !s.valve.found ? 'barrel' : 'valve');
          }
        }
        G.step(1 / 30, false);
      }
      const t0 = stopAt; for (let i = 0; i < 30 * 30 && s.beat !== 'choice'; i++) G.step(1 / 30, false);
      return { stopAt: t0, wait: t0 == null ? null : s.time - t0, beat: s.beat, dry: s.pots.filter((p) => p.present && !p.watered).length };
    });
    report(r.wait != null && r.beat === 'choice' && r.wait <= 14, `${v.name} dawn: the choice ${r.beat === 'choice' ? 'came ' + r.wait.toFixed(1) + ' s' : 'never came'} after the player stopped (cap 14 s)`);
    report(r.dry > 0, `${v.name} dawn: ${r.dry} pots still dry at the choice (you never have to water them all)`);
    await ctx.close();
  }
  // ---- opening: from Begin, how long until she is on screen, and until the roof is the player's ------------------
  if (want('opening')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state, D = G.debug(), M = new D.T.Matrix4(), p = new D.T.Vector3(); G.begin();
      let seen = null, control = null, t = 0;
      for (let i = 0; i < 30 * 60 && control == null; i++) {
        G.step(1 / 30, false); t += 1 / 30;
        if (seen == null && s.jo.present && s.fade > 0.5) { D.jo.fig.boneMatrix('head', M); p.set(0, 0.1, 0).applyMatrix4(M); const q = G.project(p);
          if (q.on && !q.behind && q.x > 0 && q.y > 0 && q.x < innerWidth && q.y < innerHeight) seen = t; }
        if (s.beat === 'n1_water') control = t;
      }
      return { seen, control };
    });
    report(r.seen != null && r.seen <= 8, `${v.name} opening: she is on screen ${r.seen == null ? 'never' : r.seen.toFixed(1) + ' s'} after Begin (cap 8 s)`);
    report(r.control != null && r.control <= 18, `${v.name} opening: the roof is the player's at ${r.control == null ? 'never' : r.control.toFixed(1) + ' s'} (cap 18 s)`);
    await ctx.close();
  }
  // ---- dark: a near-black picture with nothing on it ---------------------------------------------------------------
  if (want('dark')) for (const ending of ['hand', 'sensor']) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate((e) => {
      const G = window.__game, s = G.state, D = G.debug(); G.goto('n1_open', { ending: e });
      // blank: the fade is down, or the picture itself is near black (a dark scene coming up counts), and no words on it.
      // A cut can also hang: the first frame after one is timed on the clock, picture and all.
      let run = 0, worst = 0, where = null, hang = 0, hangAt = null; const dt = 0.1;
      for (let i = 0; i < 12000 && s.beat !== 'end'; i++) {
        const b0 = s.beat, t0 = performance.now();
        G.step(dt, true);
        if (s.beat !== b0) { D.render.frame(D.scene); const ms = performance.now() - t0; if (ms > hang) { hang = ms; hangAt = s.beat; } }
        const words = G.ui().some((r) => r.name === 'timecard' || r.name === 'line');
        const dim = s.fade < 0.15 || (s.fade < 0.7 && G.frameStats().mean < 0.11);
        if (dim && !words) { run += dt; if (run > worst) { worst = run; where = `${s.beat} +${s.beatTime.toFixed(1)}`; } } else run = 0;
      }
      return { worst, where, beat: s.beat, hang, hangAt };
    }, ending);
    report(r.beat === 'end' && r.worst <= 0.8, `${v.name}-${ending} dark: longest blank black ${r.worst.toFixed(1)} s at ${r.where} (cap 0.8 s: on a slow machine game time runs at half speed or less)`);
    report(r.hang <= 1500, `${v.name}-${ending} dark: slowest cut ${Math.round(r.hang)} ms, into ${r.hangAt} (cap 1500 ms)`);
    await ctx.close();
  }
}

// ---- desk-only checks: toast, barrel hover, arrows, reading, faces ------------------------------------------------
const v = VIEWS[0];
if (want('toast')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state; G.goto('n1_water'); G.step(8, false); G.tap('p0');
    for (let i = 0; i < 30 * 12 && s.jo.action !== 'pourEmpty'; i++) G.step(1 / 30, false);
    G.step(0.3, false); return s.text.line;
  });
  report(/\bcup\b/i.test(r || '') && /empty/i.test(r || ''), `toast: an empty pour says "${r}" (must name the cup)`);
  await ctx.close();
}
if (want('barrel')) {
  // she walks to the barrel with an empty cup and the camera goes with her (follow, then the barrel's own shot); at
  // every half second the barrel is on screen, the mouse goes to four heights up its body (stand to rim)
  const { ctx, page } = await open(v);
  await page.evaluate(() => { const G = window.__game; G.goto('n1_water'); G.step(8, false); G.tap('barrel'); });
  const shots = {};
  for (let k = 0; k < 24; k++) {
    const pts = await page.evaluate(() => { const G = window.__game, s = G.state; G.step(0.5, false);
      return { shot: s.camera.shot, cup: s.jo.cup, p: [0.35, 0.65, 0.95, 1.25].map((y) => G.project({ x: 4.7, y, z: 2.5 + 0.4 })) }; });
    if (pts.cup >= 3) break;   // full: the barrel says so instead of offering itself (the toast covers that)
    for (const p of pts.p) {
      if (!p.on || p.behind || p.x < 4 || p.y < 4 || p.x > v.w - 4 || p.y > v.h - 4) continue;
      await page.mouse.move(p.x, p.y); await page.evaluate(() => window.__game.step(1 / 30, false));
      const cur = await page.evaluate(() => document.getElementById('c').style.cursor);
      const o = shots[pts.shot] || (shots[pts.shot] = { n: 0, ok: 0 }); o.n++; if (cur === 'pointer') o.ok++;
    }
  }
  const names = Object.keys(shots);
  report(names.length >= 2, `barrel: tried in ${names.length} shots (${names.join(', ')})`);
  for (const k of names) report(shots[k].ok === shots[k].n, `barrel (${k} shot): a hand at ${shots[k].ok}/${shots[k].n} points up the barrel`);
  await ctx.close();
}
if (want('arrows')) {
  const { ctx, page } = await open(v);
  await page.evaluate(() => { window.__game.goto('n1_water'); });
  let shown = 0, bad = [], ghosts = 0;
  for (let k = 0; k < 400; k++) {
    const st = await page.evaluate(() => { const G = window.__game, s = G.state; G.step(0.5, false);
      const on = [...document.querySelectorAll('#sh-ui button.arrow.on')].map((b) => ({ id: b.getAttribute('aria-label'), r: b.getBoundingClientRect().toJSON() }));
      const ghosts = [...document.querySelectorAll('#sh-ui button.arrow.off')].filter((b) => getComputedStyle(b).visibility !== 'hidden').length;
      return { beat: s.beat, on, ghosts, free: s.jo.action === 'idle' && !s.jo.moving, cup: s.jo.cup, dry: s.pots.filter((p) => p.present && !p.watered && s.hot.includes(p.id)).map((p) => p.id), found: s.valve.found, scoops: s.barrel.scoops }; });
    ghosts += st.ghosts;
    if (!['n1_water', 'n2_water', 'n2_more', 'n3_water', 'turn'].includes(st.beat)) { if (st.beat === 'firstlight') break; await page.evaluate(() => window.__game.step(1, true)); continue; }
    if (st.free && st.on.length) {
      const a = st.on[0]; shown++;
      await page.mouse.click(a.r.x + a.r.width / 2, a.r.y + a.r.height / 2);
      const after = await page.evaluate(() => { const s = window.__game.state; window.__game.step(0.3, false); return { target: s.jo.target, line: s.text.line }; });
      const ok = after.target === a.id || (a.id && ANCHOR_OK(a.id, after.target)) || /full/i.test(after.line || '');
      if (!ok) bad.push(`${a.id} -> target ${after.target}`);
      continue;
    }
    // otherwise play on like a person: an empty cup goes for water, a full one to a dry pot in view
    await page.evaluate(() => { const G = window.__game, s = G.state; if (!(s.jo.action === 'idle' && !s.jo.moving)) return;
      const dry = s.pots.filter((p) => p.present && !p.watered && s.hot.includes(p.id));
      if (s.beat === 'turn') { if (s.hot.includes('tray')) G.tap('tray'); return; }
      if (s.jo.cup > 0 && dry.length) G.tap(dry[dry.length - 1].id); else if (s.jo.cup <= 0) G.tap(s.barrel.scoops > 0 || !s.valve.found ? 'barrel' : 'valve'); });
  }
  function ANCHOR_OK(id, t) { return /^p\d+$/.test(id) && /^p\d+$/.test(t || ''); }   // the shelf's one arrow goes to the nearest dry pot
  report(shown > 0 && !bad.length, `arrows: ${shown} pressed, ${bad.length} did nothing${bad.length ? ' (' + bad.slice(0, 4).join('; ') + ')' : ''}`);
  report(ghosts === 0, `arrows: ${ghosts} spent arrows still drawn`);
  await ctx.close();
}
if (want('reading')) {
  // round six: the reading ending is the sensor ending. It is earned by the three nights of watering every player has
  // done to reach the choice, never by a hidden look, so a player who took no look at all still sees it.
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state; G.goto('choice', { ending: 'sensor' }); s.counts.lingered = 0; s.counts.looks = 0;
    G.goto('epilogue', { ending: 'sensor' });
    let sat = null, lines = [];
    for (let i = 0; i < 30 * 120 && s.beat !== 'end'; i++) {
      G.step(1 / 30, false);
      if (sat == null && s.jo.action === 'sit' && (s.jo.sitK == null || s.jo.sitK >= 1)) sat = s.time;
      if (sat != null && s.text.line && s.text.kind !== 'marlow' && !lines.includes(s.text.line)) lines.push(s.text.line);
    }
    for (let i = 0; i < 90; i++) G.step(1 / 30, false);
    const card = document.querySelector('#sh-ui .card.end'), rows = card.querySelectorAll('.ledger p').length;
    return { beat: s.beat, sat, held: sat == null ? null : s.time - sat, lines, kept: card.classList.contains('kept'), rows, ledger: card.querySelector('.ledger').textContent };
  });
  report(r.beat === 'end' && r.sat != null, `reading: she came up and sat, with no look taken`);
  report(!r.lines.length, `reading: nothing said once she sits${r.lines.length ? ' (said: ' + r.lines.join(' / ') + ')' : ''}`);
  report(r.held != null && r.held >= 25, `reading: holds ${r.held == null ? '-' : r.held.toFixed(1)} s from sitting to the card (at least 25 s)`);
  report(r.kept && r.rows === 1, `reading: its own card (warm: ${r.kept}, ${r.rows} ledger row${r.rows === 1 ? '' : 's'}: "${r.ledger}")`);
  await ctx.close();
}
if (want('faces')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T;
    const lum = (c) => { const g = c.map((v) => Math.pow(Math.max(0, v), 1 / 2.2)); return 0.299 * g[0] + 0.587 * g[1] + 0.114 * g[2]; };   // vertex colours are linear: compare them as seen
    const partColour = (f, tag) => { const p = f.parts.find((q) => q.tag === tag); if (!p) return null; const ix = f.mesh.geometry.index.array[p.start], c = f.mesh.geometry.attributes.color.array; return [c[ix * 3], c[ix * 3 + 1], c[ix * 3 + 2]]; };
    const out = {};
    for (const who of ['jo', 'tam']) {
      const f = D[who].fig, skin = partColour(f, 'head'), o = {};
      for (const tag of ['eye', 'iris', 'brow', 'mouth']) { const c = partColour(f, tag); o[tag] = c ? +Math.abs(lum(c) - lum(skin)).toFixed(3) : null; }
      out[who] = o;
    }
    // the reading close-up: rays from the camera to each iris must meet the eye first, not hair
    G.goto('choice', { ending: 'sensor' }); G.goto('epilogue', { ending: 'sensor' });
    for (let i = 0; i < 30 * 90 && !(s.jo.action === 'sit' && s.jo.book); i++) G.step(1 / 30, false);
    const seen = [];
    for (const extra of [4, 12]) {   // reading, then looking up from the page
      G.step(extra, false); D.render.frame(D.scene);
      const f = D.jo.fig; f.root.updateMatrixWorld(true); f.mesh.geometry.computeBoundingSphere();
      const pos = f.mesh.geometry.attributes.position.array, idx = f.mesh.geometry.index.array, M = f.mesh.matrixWorld, cam = D.camera, ray = new T.Raycaster();
      const irises = f.parts.filter((p) => p.tag === 'iris'); let met = 0;
      for (const p of irises) {
        const c = new T.Vector3(); let n = 0;
        for (let k = p.start; k < p.start + p.count; k++) { c.x += pos[idx[k] * 3]; c.y += pos[idx[k] * 3 + 1]; c.z += pos[idx[k] * 3 + 2]; n++; }
        c.multiplyScalar(1 / n).applyMatrix4(M);
        ray.set(cam.position, c.clone().sub(cam.position).normalize()); ray.far = cam.position.distanceTo(c) + 0.02;
        const h = ray.intersectObject(f.mesh, false)[0]; if (!h) continue;
        const o = h.faceIndex * 3, part = f.parts.find((q) => o >= q.start && o < q.start + q.count);
        if (part && /^(eye|iris|lid|lash|glint|brow)$/.test(part.tag)) met++; else seen.push(part ? part.tag : '?');
      }
      out['read+' + extra] = { met, of: irises.length, shot: s.camera.shot, hit: seen.slice() };
    }
    return out;
  });
  for (const who of ['jo', 'tam']) {
    const o = r[who], miss = ['eye', 'iris', 'brow', 'mouth'].filter((k) => o[k] == null), weak = ['eye', 'iris', 'brow', 'mouth'].filter((k) => o[k] != null && o[k] < 0.15);
    report(!miss.length && !weak.length, `faces ${who}: ${miss.length ? 'missing ' + miss.join(', ') : 'eyes, irises, brows, mouth'}${weak.length ? '; too close to the skin: ' + weak.join(', ') : ''} (value steps ${JSON.stringify(o)})`);
  }
  for (const k of ['read+4', 'read+12']) { const o = r[k]; report(o.of > 0 && o.met >= 1, `faces: in the reading close-up (${k}, ${o.shot}) the camera meets ${o.met}/${o.of} eyes${o.hit.length ? '; blocked by ' + o.hit.join(', ') : ''}`); }
  await ctx.close();
}
await browser.close();
console.log(failed ? `PATIENCE FAILED (${failed})` : 'PATIENCE OK');
process.exit(failed ? 1 : 0);
