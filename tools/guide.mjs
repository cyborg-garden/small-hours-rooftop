// Gate: what round six's blind reviewer could not find or could not see. Each check plays the real build and measures
// the picture, the meshes or the clock; none reads the script.
//   hint      night one, no input at all after the roof is the player's: a chalk ring lands on a dry pot within 10.5 s,
//             on the desk and on a touch phone (no hover there)
//   empty     a pour from an empty cup: she goes for water herself, nobody touching anything, and the barrel is on
//             screen and ringed when she dips the cup
//   refill    nights two and three, the canonical player: a full cup holds at least five, and night two takes at most
//             three trips for water, night three four (the barrel once, then the slow tap by the beds)
//   reading   the sensor ending with no look ever taken: the folding chair has been carried to the shelf, she sits IN it
//             (pelvis at chair height, over its seat), a steady warm light is on her, and the one beat is seen: at its
//             peak she looks up from the page (her face turned at least 12 degrees further up than while she reads)
//   tray      after the hand-off the delivered tray is never drawn inside the shelf's footprint or a pot
//   frame     the phone's home shot (390 x 844) holds the shelf's left end, the end post, its sign and the crate
//   marlow    the first line that names Marlow says what Marlow is (it waters, runs, or is the roof's system)
//   newpots   after the neighbour goes, with no input a chevron stands over a NEW dry pot within 4 s (round ten)
//   barrel    by the barrel with an empty cup, the chevron is over it at once (round ten). SH_BREAK=nohint: both red
//   stall     nights two and three, a player who touches nothing, one who taps watered pots and one who keeps tapping
//             the things that only answer with a line: water moves at least every 12 s (20 until round thirteen), the
//             night ends, every tap on a watered pot answered (round eleven). SH_BREAK=noself: red
//   faces     both people: a lash line, two lids and a point of light per eye, eyes at least 3.4 cm wide, and in the talk
//             shot after the tray the camera meets each person's eye, not hair
//   readface the reading ending, while she reads and under the end card: her face is turned to the camera within 62
//             degrees (bowed further, from above, it read as a pale wedge of forehead and nose), and the lower half of her
//             face, mouth to chin, is not heavy with ink (at most 10 percent of it under half the face's own light; drawn
//             as a full outline the chin over the neck read as stubble) (round thirteen; red on the round twelve build)
//   readhand the reading ending, while she reads and under the end card: of each hand's points the camera sees (not behind
//            the book), at most 40 percent sit in solid ink (the pixel and all eight round it near black): a hand drawn
//            small reads as fingers, not a clump of ink
//            (round fourteen; red on the round thirteen build, the 7.6 review's phone close shot)
//   tapswing night three, the barrel runs dry and nobody touches anything: through the whole swing to the brass tap and
//            the hold on it (until she sets off for it), no part of her, her hat or the cup is drawn over the tap (three points on it; hidden for 0.2 s
//            is a fault), from 1.2 s in the tap is in the picture, and any chalk ring that shows is not on her
//            (round fifteen; red on the round fourteen build, desk: the camera settled at her back, the ring on her shoulder)
//   shirtback night three by the dry barrel, the camera put close behind her (where the round fourteen tap shot sat on a
//            wide screen; on a phone, the game's own tap shot): the back of her shirt takes the light in broad planes, at
//            most 15 percent of the edges of the shirt the camera sees cross from one of the three tones to another (the
//            8.1 build: 20, dark blotches); and between the hat and the collar the camera meets her neck, not her
//            ponytail, and it is drawn warm, not grey (round fifteen; red on the round fourteen build)
//   belt     her waist, read off the picture while she reads, under the end card, and (phone) in the night-two talk: of
//            the columns down through it, 80 percent go shirt, one thin dark line, trousers, with no colour between and
//            no bleed (round sixteen; red on the round fifteen build: a ragged, fuzzy band, no line)
//   readlid  the reading ending once the push-in has settled, and under the end card: the open lid is at most 12 percent
//            of the picture, and at most 5 under the title and the "On record" line (round sixteen; red on the round
//            fifteen build, desk: 34 percent, the card's line 30)
//   talkframe the night-two talk on a phone: eyes 12 to 36 percent down, each head at least 6.5 percent of the height,
//            the higher crown at most 22 percent down, the shelf's front in the lower part (round sixteen; red on the
//            round fifteen build: eyes 41 percent down, heads 4.9 percent, crowns 39 percent down)
//   node tools/guide.mjs [--only=hint,empty] [--html=path]      SH_GPU=1 for a real GPU
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
  await page.evaluate((brk) => { window.__game.setQuality(0, true); window.__game.auto(false); if (brk === 'nohint') window.__game.state.__noHint = true; }, process.env.SH_BREAK || '');
  return { ctx, page, errors };
}
// a ring that is showing now, in screen px: [{ x, y, r }]
const RINGS = `[...document.querySelectorAll('#sh-ui svg.fx circle.ring')].filter((c) => +c.getAttribute('opacity') > 0.05).map((c) => ({ x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r') }))`;

for (const v of VIEWS) {
  if (want('hint')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate((RINGS) => {
      const G = window.__game, s = G.state; G.goto('n1_water'); const rings = new Function('return ' + RINGS);
      let at = null, near = null, t = 0;
      for (let i = 0; i < 30 * 14 && at == null; i++) {
        G.step(1 / 30, false); t += 1 / 30;
        for (const c of rings()) {
          const dry = s.pots.filter((p) => p.present && !p.watered).map((p) => ({ id: p.id, q: G.screenOf(p.id) }));
          const hit = dry.find((d) => Math.hypot(d.q.x - c.x, d.q.y - c.y) < 40); if (hit) { at = t; near = hit.id; break; }
        }
      }
      return { at, near };
    }, RINGS);
    report(r.at != null && r.at <= 10.5, `${v.name} hint: with no input, a ring on a dry pot at ${r.at == null ? 'never' : r.at.toFixed(1) + ' s'} (${r.near || '-'}; cap 10.5 s)`);
    await ctx.close();
  }
  // newpots: round ten, after the neighbour left nothing said the six new pots wanted water (70 s of nothing). With no
  // input, within 4 s of the beat a paper chevron stands over one of the NEW dry pots, and stays while nobody taps.
  if (want('newpots')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state; G.goto('n2_more'); let at = null, id = null, gap = null, kept = 0, n = 0;
      for (let i = 0; i < 30 * 12; i++) { G.step(1 / 30, false);
        const a = G.ui().find((u) => /^arrow:p/.test(u.name)), pid = a && a.name.slice(6), pot = pid && s.pots.find((q) => q.id === pid);
        const ok = a && pot && pot.tray && !pot.watered && (() => { const q = G.screenOf(pid); return Math.hypot(a.x + a.w / 2 - q.x, a.y + a.h / 2 - q.y); })();
        if (at == null && ok && ok < 90) { at = s.beatTime; id = pid; gap = ok; }
        if (at != null && s.jo.action !== 'idle') break;   // (she has set off for it herself: the chevron has done its job)
        if (at != null) { n++; if (ok && ok < 90) kept++; } }
      return { at, id, gap, kept, n };
    });
    report(r.at != null && r.at <= 4 && r.kept >= r.n * 0.9, `${v.name} newpots: after the neighbour goes, a chevron over new pot ${r.id || '-'} at ${r.at == null ? 'never' : r.at.toFixed(1) + ' s'} (cap 4 s), kept ${r.kept}/${r.n} frames`);
    await ctx.close();
  }
  // barrel: round ten, a player stood at the barrel with an empty cup for 15 s not knowing to tap it. Standing there
  // with nothing in the cup, the chevron is over the barrel within a second.
  if (want('barrel')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state; G.goto('n1_water'); const B = G.state.jo; const st = { x: 3.9, z: 2.7 };
      B.pos = { ...st }; B.cup = 0; B.target = null; let at = null, gap = null;
      for (let i = 0; i < 30 * 3 && at == null; i++) { G.step(1 / 30, false);
        const a = G.ui().find((u) => u.name === 'arrow:barrel'); if (!a) continue; const q = G.screenOf('barrel'); const d = Math.hypot(a.x + a.w / 2 - q.x, a.y + a.h / 2 - q.y);
        const inView = q.on && !q.behind && q.x > 40 && q.x < innerWidth - 40 && q.y > 100 && q.y < innerHeight - 160;   // (an edge arrow for a barrel out of the picture is the old rule)
        if (inView && d < 90) { at = s.beatTime; gap = d; } }
      return { at, gap };
    });
    report(r.at != null, `${v.name} barrel: by the barrel with an empty cup, a chevron over it ${r.at == null ? 'never' : 'at once (' + Math.round(r.gap) + ' px from it)'}`);
    await ctx.close();
  }
  // stall: round eleven, a player who did not know what to do next stood 30 s on night two after the neighbour left and
  // 84 s on night three, tapping pots that had had their water (nothing answered). Two players, on both nights: one who
  // touches nothing, and one who keeps tapping a watered pot every 2.5 s. The night never goes more than 20 s without
  // water moving (a fill or a pour), it ends on its own, and every tap on a watered pot is answered by a line.
  // SH_BREAK=noself puts back the old game (nothing but hints): red.
  if (want('stall')) {
    for (const beat of ['n2_more', 'n3_water']) for (const mode of ['still', 'spent', 'looks']) {
      const { ctx, page } = await open(v);
      await page.evaluate(([beat, brk]) => { const G = window.__game; G.goto(beat); if (brk === 'noself') G.state.__noSelf = true; }, [beat, process.env.SH_BREAK || '']);
      let worst = 0, last = 0, taps = 0, answered = 0, end = null, t = 0;
      for (let k = 0; k < 400 && end == null; k++) {
        const r = await page.evaluate((beat) => { const G = window.__game, s = G.state, mv = () => s.counts.pours + s.counts.scoops + s.valve.fills + (s.valve.found ? 1 : 0); /* (the dry scrape and the turn to the tap is the night answering too) */ const m0 = mv();
          for (let i = 0; i < 15; i++) G.step(1 / 30, false);
          const spent = s.pots.filter((p) => p.present && p.watered).map((p) => ({ id: p.id, q: G.screenOf(p.id) })).find((x) => x.q.on && !x.q.behind && x.q.x > 30 && x.q.y > 120 && x.q.x < innerWidth - 30 && x.q.y < innerHeight - 160);
          return { moved: mv() > m0, t: s.time, beat: s.beat, dry: s.pots.some((p) => p.present && !p.watered && s.hot.includes(p.id)), line: s.text.line, spent, free: s.jo.action === 'idle' }; }, beat);
        t = r.t; if (!last) last = t;
        if (r.beat !== beat) { end = t; break; }
        if (r.moved || !r.dry) last = t; worst = Math.max(worst, t - last);
        // looks: a player who keeps tapping the things that only answer with a line (the city, the chair, the beds), one
        // every 2.5 s: each tap is input, so the idle hints never come (round thirteen)
        if (mode === 'looks' && k % 5 === 0) await page.evaluate(() => { const G = window.__game, s = G.state, L = s.hot.filter((id) => /^(city|chair|beds|sky|sensor|door|lid|hatch|moon|jar|basil)$/.test(id) || !/^(p\d+|barrel|valve|tray|cup)$/.test(id)); if (L.length) G.tap(L[(s.__lk = (s.__lk || 0) + 1) % L.length]); });
        if (mode === 'spent' && r.spent && r.free && k % 5 === 0) {
          const before = await page.evaluate(() => { const s = window.__game.state; return { line: s.text.line, hint: s.hint && s.hint.at }; });
          if (v.touch) await page.touchscreen.tap(r.spent.q.x, r.spent.q.y); else await page.mouse.click(r.spent.q.x, r.spent.q.y);
          taps++;
          const got = await page.evaluate((before) => { const G = window.__game; for (let i = 0; i < 30; i++) { G.step(1 / 30, false); const s = G.state; if ((s.text.line && s.text.line !== before.line) || (s.hint && s.hint.at !== before.hint) || (s.jo.target && s.jo.action !== 'idle')) return true; } return false; }, before);   // (a line, the next thing pointed at, or she is already off doing it)
          if (got) answered++;
        }
      }
      report(end != null && worst <= 12 && (mode !== 'spent' || (taps > 0 && answered >= taps * 0.9)), `${v.name} stall ${beat} (${mode}): longest wait for water to move ${worst.toFixed(1)} s (cap 12; round thirteen, was 20), night ${end != null ? 'ended' : 'NEVER ended'}${mode === 'spent' ? `, ${answered}/${taps} taps on watered pots answered` : ''}`);
      await ctx.close();
    }
  }
  if (want('tapswing')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate((RINGS) => {
      const G = window.__game, s = G.state, D = G.debug(), T = D.T, rings = new Function('return ' + RINGS);
      G.goto('n3_water'); G.step(1, false); s.barrel.scoops = 0; G.tap('barrel');
      const meshesOf = (o) => { const m = []; if (o) o.traverse((x) => { if (x.isMesh) m.push(x); }); return m; };
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const ray = new T.Raycaster(), cp = new T.Vector3(), dir = new T.Vector3(), tap = [[0.6, 0.47, -1.24], [0.6, 0.36, -1.33], [0.6, 0.55, -1.33]].map((a) => new T.Vector3(...a));
      const out = { shot: false, worst: 0, hid: 0, off: 0, ringOnHer: 0, dt: 1 / 30, frames: 0 }; let run = 0, t0 = null, t = 0;
      for (let i = 0; i < 30 * 16; i++) {
        G.step(1 / 30, false); t += 1 / 30;
        if (!/^valve/.test(s.camera.shot)) { if (out.shot && t > 6) break; continue; }
        if (t0 == null) t0 = t; out.shot = true; out.frames++;
        if (s.jo.target === 'valve' || Math.hypot(s.jo.pos.x - 0.6, s.jo.pos.z + 1.35) < 1.2) continue;   // (walking in to it, she comes between: that is her going to it)
        D.scene.updateMatrixWorld(true); D.camera.updateMatrixWorld(); cp.setFromMatrixPosition(D.camera.matrixWorld);
        const her = D.jo.fig.meshes.concat(meshesOf(D.held[1]), meshesOf(D.jo.cup)).filter(shown);
        let hid = 0, off = 0;
        for (const pt of tap) { const q = G.project(pt); if (q.behind || q.x < 0 || q.y < 0 || q.x > innerWidth || q.y > innerHeight) { off++; continue; }
          dir.copy(pt).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L - 0.02; if (ray.intersectObjects(her, false).length) hid++; }
        run = hid ? run + 1 / 30 : 0; out.worst = Math.max(out.worst, run); if (hid) out.hid++;
        if (off === 3 && t - t0 > 1.2) out.off++;
        // a ring that shows is on the tap, not on her: its middle in sight of the tap's point, not behind her
        for (const c of rings()) { const ndc = new T.Vector3((c.x / innerWidth) * 2 - 1, -(c.y / innerHeight) * 2 + 1, 0.5).unproject(D.camera).sub(cp).normalize();
          ray.set(cp, ndc); ray.near = 0; ray.far = 40; if (ray.intersectObjects(her, false).length) out.ringOnHer++; }
      }
      return out;
    }, RINGS);
    report(r.shot && r.worst < 0.2 && r.off === 0 && r.ringOnHer === 0, `${v.name} tapswing: the camera goes to the tap (${r.shot}, ${r.frames} frames); she hides it for ${r.worst.toFixed(2)} s at most (cap 0.2; ${r.hid} frames in all), off the picture ${r.off} frames after 1.2 s, a ring drawn on her ${r.ringOnHer} frames`);
    await ctx.close();
  }
  // (round sixteen) the picture read back in the page, as players see it: [w, h, rgba]
  const GRAB = `async () => { const D = window.__game.debug(); D.scene.updateMatrixWorld(true); D.render.frame(D.scene); const cv = D.render.renderer.domElement, img = new Image(); img.src = cv.toDataURL('image/png'); await img.decode();
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g2 = c2.getContext('2d'); g2.drawImage(img, 0, 0); return { w: cv.width, h: cv.height, px: g2.getImageData(0, 0, cv.width, cv.height).data }; }`;
  // her waist, column by column down through it: the last shirt pixel, the first trouser pixel, and what lies between
  const BELT = `async (grab) => { const G = window.__game, D = G.debug(), T = D.T, cam = D.camera, f = D.jo.fig, { w, h, px } = await grab(), dpr = w / innerWidth;
    const P = (b, up = 0) => { const v = new T.Vector3().setFromMatrixPosition(f.bones[b].matrixWorld); v.y += up; const q = v.project(cam); return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h }; };
    const a = P('spine_02'), b = P('pelvis', -0.06), pel = P('pelvis'); const half = Math.abs(P('thigh_l').x - P('thigh_r').x) * 0.5 + 2;
    const cls = (i) => { const r = px[i], g = px[i + 1], bl = px[i + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), v = mx, s = mx ? (mx - mn) / mx : 0; let hu = 0;
      if (mx > mn) { if (mx === r) hu = 60 * (((g - bl) / (mx - mn)) % 6); else if (mx === g) hu = 60 * ((bl - r) / (mx - mn) + 2); else hu = 60 * ((r - g) / (mx - mn) + 4); } if (hu < 0) hu += 360;
      if (v < 52) return 'k'; if (s > 0.3 && hu >= 12 && hu <= 52) return 's'; if (s > 0.22 && hu >= 150 && hu <= 205) return 't'; return 'x'; };
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y))), y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y))), cols = [];
    for (let x = Math.round(pel.x - half); x <= Math.round(pel.x + half); x += Math.max(1, Math.round(dpr))) { if (x < 0 || x >= w) continue;
      const seq = []; for (let y = y0; y <= y1; y++) seq.push(cls((y * w + x) * 4));
      let t = -1; for (let i = 0; i + 2 < seq.length; i++) if (seq[i] === 't' && seq[i + 1] === 't' && seq[i + 2] === 't') { t = i; break; }
      if (t < 0) continue; let sY = -1; for (let i = t - 1; i >= 0; i--) if (seq[i] === 's') { sY = i; break; } if (sY < 0) continue;
      const gap = seq.slice(sY + 1, t), ink = gap.filter((c) => c === 'k').length, mixed = gap.filter((c, i) => c === 'x' && gap[i - 1] !== 'k' && gap[i + 1] !== 'k').length;   // (a pixel half line, half cloth either side of the line is its edge, not a band of colour)
      const bleed = seq.slice(t, t + Math.round(8 * dpr)).filter((c) => c === 's').length + seq.slice(Math.max(0, sY - Math.round(8 * dpr)), sY).filter((c) => c === 't').length;
      cols.push({ gap: gap.length, ink, mixed, bleed, ok: gap.length <= 10 * dpr && ink >= 1 && mixed <= 1 && bleed === 0, seq: seq.slice(Math.max(0, sY - 3), t + 3).join('') }); }
    const ok = cols.filter((c) => c.ok).length; return { n: cols.length, ok, share: cols.length ? ok / cols.length : 0, gap: cols.length ? +(cols.reduce((s, c) => s + c.gap, 0) / cols.length).toFixed(1) : 0, mixed: cols.reduce((s, c) => s + c.mixed, 0), ink: cols.filter((c) => c.ink).length, bad: cols.filter((c) => !c.ok).map((c) => c.seq).slice(0, 12) }; }`;
  if (want('belt')) {
    // (round sixteen) where her shirt meets her trousers: a clean edge with one ink line. The outfit was cut in two along
    // its triangles, and the two colours met in a ragged, fuzzy band of yellow bleeding into green. Read off the picture
    // while she reads (the close shot, on both screens), under the end card, and on a phone in the night-two talk: of
    // the columns down through her waist, at least 80 percent go shirt, a thin dark line (at most 4 px, 2 px more on a
    // phone's double pixels), trousers, with no colour between them (a pixel touching the line is its edge) and no shirt below it or trouser above it
    const { ctx, page } = await open(v);
    await page.evaluate(() => window.__game.setQuality(2, true));
    const out = [];
    for (const [name, until] of [['reading', "s.jo.book && s.beatTime > 25 && s.jo.lookUp < 0.01"], ['end card', "s.beat === 'end'"]]) {
      await page.evaluate((until) => { const G = window.__game, s = G.state; G.goto('choice', { ending: 'sensor' }); G.goto('epilogue', { ending: 'sensor' }); const f = new Function('s', 'return ' + until); for (let i = 0; i < 9000 && !f(s); i++) G.step(0.1, false); if (s.beat === 'end') for (let i = 0; i < 25; i++) G.step(0.1, false); }, until);
      out.push([name, await page.evaluate(`(${BELT})(${GRAB})`)]);
    }
    if (v.touch) { await page.evaluate(() => { const G = window.__game, s = G.state; G.goto('turn', { ending: 'sensor' }); for (let i = 0; i < 30 * 90 && !(s.camera.shot === 'meet' && s.tam.stage === 'top' && s.tam.stageT > 8); i++) G.step(1 / 30, false); });
      out.push(['talk', await page.evaluate(`(${BELT})(${GRAB})`)]); }
    for (const [name, r] of out) { if (process.env.SH_DEBUG) console.log(name, r.bad.join(' ')); report(r.n >= 8 && r.share >= 0.8, `${v.name} belt, ${name}: ${r.ok} of ${r.n} columns down her waist go shirt, one thin dark line, trousers (${(r.share * 100).toFixed(0)} percent, at least 80; gap ${r.gap} px on average, ${r.ink} with ink in it, ${r.mixed} pixels of neither colour)`); }
    await ctx.close();
  }
  if (want('readlid')) {
    // (round sixteen) the reading ending's last picture, on a wide screen: the open lid filled 40 percent of it, a flat
    // brown slab on the left that pushed her and the shelf into the right half. From 4 s after she sits (the push-in has
    // settled; on its way round it passes the lid's edge) to the end card, at
    // most 12 percent of the picture is lid (rays from the camera through a grid, the lid the first thing met); and
    // under the title and the "On record" line, at most 5 percent
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state, D = G.debug(), T = D.T, cam = D.camera;
      G.goto('choice', { ending: 'sensor' }); G.goto('epilogue', { ending: 'sensor' });
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const meshes = []; D.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const ray = new T.Raycaster(), cp = new T.Vector3(), d = new T.Vector3();
      const lidShare = (pts) => { const lid = D.props.hatch.children.find((o) => o.isGroup && Math.abs(o.rotation.x) > 1); if (!lid) return 0; D.scene.updateMatrixWorld(true); cam.updateMatrixWorld(); cp.setFromMatrixPosition(cam.matrixWorld);
        const vis = meshes.filter(shown); let n = 0;
        for (const [x, y] of pts) { d.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(cam).sub(cp).normalize(); ray.set(cp, d); ray.near = 0; ray.far = 60;
          const h = ray.intersectObjects(vis, false)[0]; if (h) { for (let q = h.object; q; q = q.parent) if (q === lid) { n++; break; } } }
        return pts.length ? n / pts.length : 0; };
      const grid = (x0, y0, x1, y1, nx, ny) => { const p = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) p.push([x0 + (x1 - x0) * (i + 0.5) / nx, y0 + (y1 - y0) * (j + 0.5) / ny]); return p; };
      const out = { worst: 0, looks: 0, under: {}, at: null }; let sat = null, endT = null;
      for (let i = 0; i < 30 * 120; i++) {
        G.step(1 / 30, false);
        if (s.jo.action === 'sit' && s.camera.shot === 'readClose' && sat == null) { sat = s.time; out.sat = +s.beatTime.toFixed(1); }
        if (s.beat === 'end' && endT == null) endT = s.time;
        if (sat != null && s.time - sat > 4 && i % 45 === 0) { const k = lidShare(grid(0, 0, innerWidth, innerHeight, 32, 20)); out.looks++; (out.all = out.all || []).push(s.beatTime.toFixed(1) + ':' + (k * 100).toFixed(0)); if (k > out.worst) { out.worst = k; out.at = +(s.beatTime).toFixed(1); } }
        if (endT != null && s.time - endT > 2.5) {
          const k = lidShare(grid(0, 0, innerWidth, innerHeight, 32, 20)); out.looks++; if (k > out.worst) { out.worst = k; out.at = 'end card'; }
          for (const rc of G.ui().filter((q) => q.name === 'endTitle' || q.name === 'ledger')) out.under[rc.name] = lidShare(grid(rc.x, rc.y, rc.x + rc.w, rc.y + rc.h, 10, 3));
          break; }
      }
      return out;
    });
    const und = Object.entries(r.under); if (process.env.SH_DEBUG) console.log('sat at', r.sat, (r.all || []).join(' '));
    report(r.looks >= 5 && r.worst <= 0.12, `${v.name} readlid: the open lid is at most ${(r.worst * 100).toFixed(0)} percent of the reading picture (cap 12; worst at ${r.at}; ${r.looks} looks)`);
    report(und.length === 2 && und.every(([, k]) => k <= 0.05), `${v.name} readlid: under the end card's words, lid ${und.map(([n, k]) => n + ' ' + (k * 100).toFixed(0) + ' percent').join(', ') || 'not found'} (cap 5)`);
    await ctx.close();
  }
  if (want('talkframe') && v.touch) {
    // (round sixteen) the night-two talk on a phone: both people small in the lower middle, the top 40 percent an empty
    // dark band, faces a few pixels across. Through the whole meet shot (once it has settled): both faces in the picture
    // with their eyes in its upper middle (12 to 36 percent down), each head at least 6.5 percent of the picture's height
    // (crown to chin), the higher crown at most 22 percent down (no band over them), and the shelf's front edge in the
    // bottom third
    const { ctx, page } = await open(v);
    const r = await page.evaluate(() => {
      const G = window.__game, s = G.state, D = G.debug(), T = D.T, cam = D.camera; G.goto('turn', { ending: 'sensor' });
      const P = (f, b, up = 0) => { const v = new T.Vector3().setFromMatrixPosition(f.bones[b].matrixWorld); v.y += up; const q = v.project(cam); return { x: (q.x * 0.5 + 0.5), y: (-q.y * 0.5 + 0.5) }; };
      const out = { frames: 0, eyeLo: 9, eyeHi: -9, head: 9, crown: -9, xLo: 9, xHi: -9, shelf: 9 }; let since = null;
      for (let i = 0; i < 30 * 120 && s.beat === 'turn'; i++) {
        G.step(1 / 30, false);
        if (s.camera.shot !== 'meet' || s.tam.stage !== 'top') { since = null; continue; } if (since == null) since = s.time; if (s.time - since < 2.5 || i % 6) continue;
        D.scene.updateMatrixWorld(true); cam.updateMatrixWorld(); out.frames++;
        let top = 9;
        for (const f of [D.jo.fig, D.tam.fig]) { const hd = new T.Vector3().setFromMatrixPosition(f.bones.Head.matrixWorld), up = new T.Vector3(0, 1, 0);
          const crown = P(f, 'Head', 0.17), chin = P(f, 'Head', -0.06), eye = P(f, 'Head', 0.07);
          out.eyeLo = Math.min(out.eyeLo, eye.y); out.eyeHi = Math.max(out.eyeHi, eye.y); out.head = Math.min(out.head, chin.y - crown.y); top = Math.min(top, crown.y); out.xLo = Math.min(out.xLo, eye.x); out.xHi = Math.max(out.xHi, eye.x); }
        out.crown = Math.max(out.crown, top);
        const sh = new T.Vector3(-1.3, 0.5, 3.75).project(cam); out.shelf = Math.min(out.shelf, -sh.y * 0.5 + 0.5);
      }
      return out;
    });
    const f2 = (x) => (x * 100).toFixed(0);
    report(r.frames >= 20 && r.eyeLo >= 0.12 && r.eyeHi <= 0.36 && r.xLo >= 0.03 && r.xHi <= 0.97, `${v.name} talkframe: both faces in the picture, eyes ${f2(r.eyeLo)} to ${f2(r.eyeHi)} percent down (12 to 36), across ${f2(r.xLo)} to ${f2(r.xHi)} percent (${r.frames} looks)`);
    report(r.frames >= 20 && r.head >= 0.065 && r.crown <= 0.22, `${v.name} talkframe: each head at least ${(r.head * 100).toFixed(1)} percent of the height (at least 6.5), the higher crown at most ${f2(r.crown)} percent down (at most 22: no empty band over them)`);
    report(r.frames >= 20 && r.shelf >= 0.62, `${v.name} talkframe: the shelf's front in the lower part of the picture (${f2(r.shelf)} percent down at the highest; at least 62)`);
    await ctx.close();
  }
  if (want('shirtback')) {
    const { ctx, page } = await open(v);
    await page.evaluate(() => window.__game.setQuality(2, true));   // (the paint as players see it)
    const r = await page.evaluate(async () => {
      const G = window.__game, s = G.state, D = G.debug(), T = D.T;
      G.goto('n3_water'); G.step(1, false); s.barrel.scoops = 0; G.tap('barrel'); for (let i = 0; i < 30 * 9; i++) G.step(1 / 30, false);
      const cam = D.camera, at = new T.Vector3(0.3, 0.7, -1.0), d = 6.9, yaw = 0.78, pt = 0.12;
      // (on a phone, the picture the game itself shows there: over her hat, from above)
      if (innerWidth > innerHeight) cam.position.set(at.x + Math.sin(yaw) * Math.cos(pt) * d, at.y + Math.sin(pt) * d, at.z + Math.cos(yaw) * Math.cos(pt) * d); if (innerWidth > innerHeight) { cam.lookAt(at); cam.fov = 34; cam.updateProjectionMatrix(); } cam.updateMatrixWorld();
      D.scene.updateMatrixWorld(true); D.render.frame(D.scene); const view = cam.clone();   // (the game's own loop may move its camera while the picture is decoded)
      const cv = D.render.renderer.domElement, img = new Image(); img.src = window.__shirtShot = cv.toDataURL('image/png'); await img.decode();
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g2 = c2.getContext('2d'); g2.drawImage(img, 0, 0); const px = g2.getImageData(0, 0, cv.width, cv.height).data;
      const cp = view.position.clone();
      const pix = (p) => { const q = p.clone().project(view), x = Math.round((q.x * 0.5 + 0.5) * cv.width), y = Math.round((-q.y * 0.5 + 0.5) * cv.height); if (q.z > 1 || x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null; const i = (y * cv.width + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
      const meshes = []; D.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry.attributes.position.count < 60000) meshes.push(o); });
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const ray = new T.Raycaster(), dir = new T.Vector3(), vv = new T.Vector3();
      const first = (p) => { dir.copy(p).sub(cp); const L = dir.length(); ray.set(cp, dir.normalize()); ray.near = 0; ray.far = L + 0.05; const h = ray.intersectObjects(meshes, false).find((x) => shown(x.object)); return h ? { o: h.object, d: L - h.distance } : null; };
      // the shirt's light: the gouache material lays the moon's light down in three flat tones (materials.js TONES), so
      // a shirt whose normals follow every rib and muscle under it breaks into patches of tone. Over the shirt the camera
      // sees (each vertex met first by the ray to it), the tone each vertex falls in, from its skinned normal; and the
      // share of the mesh's edges between two seen vertices that cross from one tone to another. Blotches are many
      // small patches: many crossings.
      const torso = D.jo.fig.meshes.find((m) => m.userData.role === 'torso'), G3 = torso.geometry, P = G3.attributes.position, Nn = G3.attributes.normal, n = P.count;
      let moon = null; D.scene.traverse((o) => { if (o.isDirectionalLight && o.visible && (!moon || o.intensity > moon.intensity)) moon = o; });
      const Ld = new T.Vector3().setFromMatrixPosition(moon.matrixWorld).sub(new T.Vector3().setFromMatrixPosition(moon.target.matrixWorld)).normalize();
      const band = new Int8Array(n).fill(-1), a = new T.Vector3(), b = new T.Vector3();
      for (let i = 0; i < n; i++) { torso.getVertexPosition(i, vv); const w = vv.clone().applyMatrix4(torso.matrixWorld), h = first(w); if (!h || h.o !== torso || Math.abs(h.d) > 0.012) continue;
        a.fromBufferAttribute(P, i); b.copy(a).addScaledVector(b.clone().fromBufferAttribute(Nn, i), 0.01); torso.applyBoneTransform(i, a); torso.applyBoneTransform(i, b);
        const N = b.sub(a).transformDirection(torso.matrixWorld); if (N.dot(dir.copy(cp).sub(w)) < 0) N.negate();   // (the side of the cloth the camera sees)
        band[i] = Math.min(2, Math.floor((N.dot(Ld) * 0.5 + 0.5) * 3)); }
      const idx = G3.index.array; let edges = 0, cross = 0, seenV = 0; for (let i = 0; i < n; i++) if (band[i] >= 0) seenV++;
      for (let t = 0; t < idx.length; t += 3) for (const [u, w] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { if (u > w || band[u] < 0 || band[w] < 0) continue; edges++; if (band[u] !== band[w]) cross++; }
      const dark = edges ? cross / edges : 1;
      // the nape: rays from the camera to the middle of her neck, from between the shoulders up under the brim. What the
      // camera meets first is her neck, her collar or the hat, never the ponytail; and where it is her, it is drawn warm
      const hq = new T.Quaternion(); D.jo.fig.bones.Head.matrixWorld.decompose(vv, hq, new T.Vector3());
      const ch = new T.Vector3().setFromMatrixPosition(D.jo.fig.bones.spine_03.matrixWorld), nk = new T.Vector3().setFromMatrixPosition(D.jo.fig.bones.neck_01.matrixWorld), hd = new T.Vector3().setFromMatrixPosition(D.jo.fig.bones.Head.matrixWorld);
      let seen = 0, grey = 0, hair = 0, skin = 0; const hits = [];
      for (const [o, k] of [[ch, 0.5], [ch, 0.8], [nk, 0.2], [nk, 0.4], [nk, 0.6], [nk, 0.8]]) for (const sd of [-0.025, 0, 0.025]) { const p = (o === ch ? ch.clone().lerp(nk, k) : nk.clone().lerp(hd, k)).add(new T.Vector3(sd, 0, 0).applyQuaternion(hq)); const h = first(p); if (h) p.copy(ray.ray.at(dir.copy(p).sub(cp).length() - h.d - 0.001, new T.Vector3())); hits.push(h ? (h.o.userData.role || h.o.name || h.o.parent && h.o.parent.name || '?') : '-'); if (!h || !D.jo.fig.meshes.includes(h.o)) continue;
        const c = pix(p); if (!c) continue; seen++; if (h.o.userData.role === 'hair') hair++; if (h.o.userData.role === 'skin') skin++; if (c[0] < c[2] * 1.05) grey++; }
      return { n: seenV, edges, dark: +dark.toFixed(4), seen, grey, hair, skin, wide: innerWidth > innerHeight, hits: hits.join(' ') };
    });
    if (process.env.SH_DEBUG) console.log(JSON.stringify(r)); if (process.env.SH_SHOT) { const u = await page.evaluate(() => window.__shirtShot); (await import('node:fs')).writeFileSync(process.env.SH_SHOT + '-' + v.name + '.png', Buffer.from(u.split(',')[1], 'base64')); } report(r.n > 300 && r.dark <= 0.15, `${v.name} shirtback: ${(r.dark * 100).toFixed(1)} percent of the seen shirt's edges cross from one tone of light to another (cap 15; the 8.1 build 20; ${r.n} vertices seen)`);
    report(r.seen > 0 && r.grey === 0 && r.hair === 0 && (!r.wide || r.skin > 0), `${v.name} shirtback: the nape under the hat: ${r.seen} points of her seen (${r.skin} her neck), ${r.hair} on her ponytail, ${r.grey} grey or blue (both 0)`);
    await ctx.close();
  }
  if (want('empty')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate((RINGS) => {
      const G = window.__game, s = G.state; G.goto('n1_water'); G.step(1, false); const rings = new Function('return ' + RINGS);
      // nobody touches anything after the tap on the pot: she tips the empty cup, then goes for water herself
      G.tap('p0'); let empty = null, off = null, scoop = null, seen = null, ringed = null, full = null, idle = 0, t = 0;
      for (let i = 0; i < 30 * 20 && full == null; i++) {
        G.step(1 / 30, false); t += 1 / 30;
        if (empty == null && s.jo.action === 'pourEmpty') empty = t;
        if (empty == null) continue;
        if (off == null && s.jo.action === 'walk' && s.jo.target === 'barrel') off = t - empty;
        if (off != null && s.jo.action === 'idle') idle += 1 / 30;
        const q = G.screenOf('barrel'), on = q.on && !q.behind && q.x > 20 && q.y > 20 && q.x < innerWidth - 20 && q.y < innerHeight - 20;
        if (scoop == null && s.jo.action === 'scoop') { scoop = t - empty; seen = on; }
        if (ringed == null && on && rings().some((c) => Math.hypot(c.x - q.x, c.y - q.y) < 60)) ringed = t - empty;
        if (s.jo.cup > 0) full = t - empty;
      }
      return { empty, off, scoop, seen, ringed, full, idle, line: s.text.line };
    }, RINGS);
    report(r.empty != null && r.off != null && r.off <= 2, `${v.name} empty: she sets off for the barrel herself ${r.off == null ? 'never' : r.off.toFixed(1) + ' s'} after the empty pour (cap 2 s)`);
    report(r.full != null && r.full <= 14 && r.idle <= 0.6, `${v.name} empty: the cup is full ${r.full == null ? 'never' : r.full.toFixed(1) + ' s'} after it, with nobody touching anything (cap 14 s; stood about for ${r.idle.toFixed(1)} s, cap 0.6)`);
    report(r.seen === true && r.ringed != null, `${v.name} empty: the barrel is on screen when she dips the cup (${r.seen}), and a ring lands on it (${r.ringed == null ? 'never' : r.ringed.toFixed(1) + ' s'})`);
    await ctx.close();
  }
}
const v = VIEWS[0];
if (want('refill')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, out = {};
    for (const [n, open, stop] of [[2, 'n2_open', 'n2_quiet'], [3, 'n3_open', 'firstlight']]) {
      G.goto(open); const sc = s.counts.scoops; let full = 0;
      for (let i = 0; i < 30 * 900 && s.beat !== stop; i++) { G.step(1 / 30, true); full = Math.max(full, s.jo.cup); }
      out[n] = { trips: s.counts.scoops - sc, full, reached: s.beat === stop };
    }
    return out;
  });
  for (const n of [2, 3]) {
    const o = r[n];
    report(o.reached && o.full >= 5, `refill night ${n}: a full cup holds ${o.full} (at least 5)`);
    const cap = n === 2 ? 3 : 4;   // night three: one to the barrel, then the tap by the beds, which runs slow (four a cup) and is a short walk
    report(o.reached && o.trips <= cap, `refill night ${n}: ${o.trips} trips for water (at most ${cap})`);
  }
  await ctx.close();
}
if (want('reading')) for (const vv of VIEWS) {
  const { ctx, page } = await open(vv);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T;
    G.goto('choice', { ending: 'sensor' }); s.counts.looks = 0; s.counts.lingered = 0; G.goto('epilogue', { ending: 'sensor' });
    const M = new T.Matrix4(), P = new T.Vector3(), out = { sat: false, pelvisY: null, offSeat: null, light: [], hand: Infinity, chair: null, t0: s.time, seen: 0, looks: 0, blocked: {} };
    const ray = new T.Raycaster(), eyes = D.jo.fig.meshes.find((m) => m.userData.role === 'eyes'), v = new T.Vector3(), things = []; D.scene.traverse((o) => { if (o.isMesh && o.visible && o !== eyes && o.geometry.attributes.position.count < 60000) things.push(o); });
    for (let i = 0; i < 30 * 120 && s.beat !== 'end'; i++) {
      G.step(1 / 30, false);
      const sat = s.jo.action === 'sit' && s.jo.book;
      if (!sat) continue;
      out.sat = true;
      D.jo.fig.boneMatrix('pelvis', M); P.setFromMatrixPosition(M); out.pelvisY = +P.y.toFixed(3);
      const ch = new T.Box3().setFromObject(D.chair), c = ch.getCenter(new T.Vector3());
      out.chair = { x: +c.x.toFixed(2), z: +c.z.toFixed(2), top: +ch.max.y.toFixed(2) };
      out.offSeat = +Math.hypot(P.x - c.x, P.z - c.z).toFixed(3);
      // every half second while she reads: can the picture see her face (both eyes) and the open book?
      if (i % 15 === 0 && s.camera.shot === 'readClose') {
        D.render.frame(D.scene); for (const m of D.jo.fig.meshes) m.computeBoundingSphere();
        const rest = eyes.geometry.attributes.position, C = [new T.Vector3(), new T.Vector3()], N = [0, 0];
        for (let k = 0; k < rest.count; k += 7) { const side = rest.getX(k) > 0 ? 0 : 1; eyes.getVertexPosition(k, v); v.applyMatrix4(eyes.matrixWorld); C[side].add(v); N[side]++; }
        const pts = [C[0].multiplyScalar(1 / N[0]), C[1].multiplyScalar(1 / N[1]), new T.Vector3().setFromMatrixPosition(D.book.matrixWorld)]; let eyesSeen = 0, bookSeen = true; const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
        for (let k = 0; k < 3; k++) { const c = pts[k], d = D.camera.position.distanceTo(c); ray.set(D.camera.position, c.clone().sub(D.camera.position).normalize()); ray.far = d - 0.05;
          const inBook = (o) => { for (let q = o; q; q = q.parent) if (q === D.book) return true; return false; };   // (the book's own pages are not in the way of the book: round eleven, seen from above, the ray to its middle met its own page)
          const h = ray.intersectObjects(things.filter((o) => shown(o) && !(k === 2 && inBook(o))), false)[0];
          if (h && !(k < 2 && (/brow/i.test(h.object.name) || h.object.userData.role === 'skin') && h.distance > d - 0.09)) { if (k === 2) bookSeen = false; const n = (k < 2 ? 'eye: ' : 'book: ') + (h.object.userData.role || h.object.name || h.object.parent.name || 'a thing'); out.blocked[n] = (out.blocked[n] || 0) + 1; } else if (k < 2) eyesSeen++; }
        out.looks++; if (eyesSeen >= 1 && bookSeen) out.seen++; if (eyesSeen === 2) out.both = (out.both || 0) + 1;
      }
      const L = D.render.lighting; out.light.push((L.read ? L.read.intensity : 0) + L.spill.intensity);
      { const q = new T.Quaternion(); D.jo.fig.bones.Head.matrixWorld.decompose(v, q, new T.Vector3()); const up = new T.Vector3(0, 0, 1).applyQuaternion(q).y;
        if ((s.jo.lookUp || 0) > 0.95) out.upPeak = Math.max(out.upPeak ?? -9, up); else if (!(s.jo.lookUp > 0.02)) out.upRead = Math.min(out.upRead ?? 9, up); }
    }
    const ls = out.light.slice(30), lo = Math.min(...ls), hi = Math.max(...ls);
    return { ...out, light: { lo: +lo.toFixed(2), hi: +hi.toFixed(2) }, beat: s.beat, length: +(s.time - out.t0).toFixed(1) };
  });
  const tag = `${vv.name} reading`;
  report(r.sat && r.chair && Math.hypot(r.chair.x - -1.78, r.chair.z - 3.08) < 0.35, `${tag}: the chair is at the shelf's end (${r.chair ? r.chair.x + ', ' + r.chair.z : 'none'})`);
  report(r.sat && r.pelvisY >= 0.45 && r.offSeat <= 0.25, `${tag}: she sits in the chair (pelvis ${r.pelvisY} m up, ${r.offSeat} m off its centre)`);
  report(r.sat && r.light.lo >= 3 && r.light.hi - r.light.lo <= 0.05 * r.light.hi, `${tag}: a steady warm light on her (${r.light.lo}..${r.light.hi})`);
  report(r.beat === 'end' && r.length >= 28 && r.length <= 45, `${tag}: the whole ending takes ${r.length} s (30 to 45, never the two minutes it was)`);
  report(r.looks >= 10 && r.seen >= r.looks * 0.95 && (r.both || 0) >= r.looks * 0.6, `${tag}: her face (an eye at least; both in ${r.both || 0}) and the open book are in clear view in ${r.seen} of ${r.looks} looks${Object.keys(r.blocked).length ? ' (in the way: ' + Object.entries(r.blocked).map(([k, n]) => k + ' x' + n).join(', ') + ')' : ''}`);
  const lift = r.upPeak != null && r.upRead != null ? Math.asin(Math.max(-1, Math.min(1, r.upPeak))) - Math.asin(Math.max(-1, Math.min(1, r.upRead))) : null;
  report(lift != null && lift >= 0.21, `${tag}: the one beat: she looks up from the page (${lift == null ? 'never' : (lift * 57.3).toFixed(0) + ' degrees up'}; at least 12)`);
  await ctx.close();
}
if (want('choice')) for (const vv of VIEWS) {
  const { ctx, page } = await open(vv), tag = `${vv.name} choice`;
  const g = (fn, a) => page.evaluate(fn, a);
  // how long after Marlow's 4:31 line the two labels can be pressed
  const t = await g(() => { const G = window.__game, s = G.state; let line = null; G.bus.on('text:show', (p) => { if (/^4:31/.test(p.text)) line = s.time; });
    G.goto('firstlight', { ending: 'sensor' }); for (let i = 0; i < 30 * 40 && !(s.beat === 'choice' && [...document.querySelectorAll('#sh-ui button.choice.on')].length === 2 && ![...document.querySelectorAll('#sh-ui button.choice.on')].some((b) => b.disabled)); i++) G.step(1 / 30, false);
    return { line, open: s.time, beat: s.beat }; });
  report(t.beat === 'choice' && t.line != null && t.open - t.line <= 7, `${tag}: the labels open ${(t.open - t.line).toFixed(1)} s after the 4:31 line (cap 7 s; it was 6.5 s of nothing, then a beat that a tap could skip)`);
  // stray taps: on the cup in her hand, on the spare sensor, and over a grid of the picture. None of them may choose.
  const spots = await g(() => { const G = window.__game, o = []; for (const id of ['cup', 'sensor']) { const p = G.screenOf(id); if (p && p.on) o.push([p.x, p.y]); }
    const R = [...document.querySelectorAll('#sh-ui button')].filter((b) => b.offsetWidth).map((b) => b.getBoundingClientRect());
    for (let j = 1; j < 8; j++) for (let i = 1; i < 8; i++) { const x = innerWidth * i / 8, y = innerHeight * j / 8; if (!R.some((r) => x > r.left - 6 && x < r.right + 6 && y > r.top - 6 && y < r.bottom + 6)) o.push([x, y]); } return o; });
  for (const [x, y] of spots) { if (vv.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
  await g(() => window.__game.step(0.5, false));
  const after = await g(() => window.__game.state.ending);
  report(after == null, `${tag}: ${spots.length} stray taps on the picture (the cup and the sensor among them) chose nothing (ending: ${after})`);
  // and a label does choose
  const b = page.locator('#sh-ui button.choice.on').nth(1); const box = await b.boundingBox();
  if (vv.touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await g(() => window.__game.step(0.3, false));
  const picked = await g(() => window.__game.state.ending);
  report(picked === 'hand', `${tag}: pressing the by-hand label chooses by hand (${picked})`);
  await ctx.close();
}
if (want('tray')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T; G.goto('turn');
    // (an older build exposes only the held props and the scene: find the tray and the twelve pot meshes there)
    const tray = D.tray || D.held[2];
    let potMeshes = D.potMeshes; if (!potMeshes) D.scene.traverse((o) => { if (!potMeshes && o.children && o.children.length === 12 && o.children.every((c) => c.isMesh)) potMeshes = o.children; });
    let bad = 0, samples = 0, worst = null;
    // the shelf's footprint, a hand's width round it: no tray stood or laid in there once the pots are out
    const foot = new T.Box3(new T.Vector3(-2.55, 0, 3.5), new T.Vector3(0.15, 0.9, 4.4));
    for (let i = 0; i < 30 * 200 && s.beat !== 'n3_open'; i++) {
      G.step(1 / 30, true);
      if (i % 3 || !s.pots[6].present || ['place', 'give', 'take'].includes(s.jo.action) || !tray.visible) continue;
      tray.updateMatrixWorld(true); const b = new T.Box3().setFromObject(tray); samples++;
      let hit = !s.jo.carrying && b.intersectsBox(foot);   // in her hands on the way back it may pass over the shelf, never through a pot
      for (let k = 0; k < 12 && !hit; k++) if (s.pots[k].present && potMeshes[k].visible && b.intersectsBox(new T.Box3().setFromObject(potMeshes[k]))) hit = true;
      if (hit) { bad++; if (!worst) worst = { beat: s.beat, c: b.getCenter(new T.Vector3()).toArray().map((x) => +x.toFixed(2)) }; }
    }
    return { bad, samples, worst };
  });
  report(r.bad === 0, `tray: drawn inside the shelf or a pot in ${r.bad} of ${r.samples} samples after the hand-off${r.worst ? ' (first in ' + r.worst.beat + ' at ' + r.worst.c.join(',') + ')' : ''}`);
  await ctx.close();
}
if (want('frame')) {
  const { ctx, page } = await open(VIEWS[1]);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state; G.goto('n1_water'); for (let i = 0; i < 30 * 6; i++) G.step(1 / 30, false);
    const pts = { 'shelf left end': [-2.5, 0.5, 3.75], 'end post': [0.07, 1.3, 3.585], 'sign': [0.2, 0.78, 3.62], 'crate': [0.62, 0.25, 4.15], 'spare sensor': [0.35, 0.5, 4.0] };
    const out = {}; for (const k in pts) { const [x, y, z] = pts[k]; const q = G.project({ x, y, z }); out[k] = [Math.round(q.x), Math.round(q.y), q.on && !q.behind]; }
    return { shot: s.camera.shot, out, w: innerWidth, h: innerHeight };
  });
  for (const k in r.out) { const [x, y, on] = r.out[k]; report(on && x >= 16 && x <= r.w - 16 && y >= 16 && y <= r.h - 16, `frame (phone, ${r.shot}): ${k} at ${x},${y}`); }
  await ctx.close();
}
if (want('marlow')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state; G.goto('n1_open');
    for (let i = 0; i < 30 * 40; i++) { G.step(1 / 30, false); const l = s.text.line || ''; if (s.text.kind !== 'marlow' && /Marlow/.test(l)) return l; }
    return null;
  });
  report(!!r && /Marlow (waters|runs|is)\b/.test(r), `marlow: the first line that names Marlow says what it is ("${r}")`);
  await ctx.close();
}
if (want('readface')) for (const v of VIEWS) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T, V3 = T.Vector3; G.setQuality(2, true); G.goto('title'); G.goto('epilogue', { ending: 'sensor' });
    const res = [];
    for (const until of [(s) => s.jo.book && s.beatTime > 25 && s.jo.lookUp < 0.01, (s) => s.beat === 'end']) {
      for (let i = 0; i < 9000 && !until(s); i++) G.step(0.1, true); if (s.beat === 'end') for (let i = 0; i < 30; i++) G.step(0.1, true);
      D.render.frame(D.scene); D.scene.updateMatrixWorld(true);
      const f = D.jo.fig, e = f.meshes.find((m) => m.userData.role === 'eyes'), rest = e.geometry.attributes.position, C = [new V3(), new V3()], N = [0, 0], v = new V3();
      for (let k = 0; k < rest.count; k++) { const sd = rest.getX(k) > 0 ? 0 : 1; e.getVertexPosition(k, v); v.applyMatrix4(e.matrixWorld); C[sd].add(v); N[sd]++; }
      C[0].multiplyScalar(1 / N[0]); C[1].multiplyScalar(1 / N[1]); const em = C[0].clone().add(C[1]).multiplyScalar(0.5);
      const hd = new V3().setFromMatrixPosition(f.bones.Head.matrixWorld), nk = new V3().setFromMatrixPosition(f.bones.neck_01.matrixWorld);
      // the face's own forward: square to the line between the eyes and to the line from the neck up to them
      const up = em.clone().sub(nk).normalize(), across = C[0].clone().sub(C[1]).normalize(), n = new V3().crossVectors(across, up).normalize(); if (n.dot(em.clone().sub(hd)) < 0) n.negate();
      const ang = Math.acos(Math.max(-1, Math.min(1, n.dot(D.camera.position.clone().sub(em).normalize())))) * 180 / Math.PI;
      // the picture: the face from the eyes down, and its lower half (mouth to chin)
      const cv = D.render.renderer.domElement, W = cv.width, H = cv.height, sx = W / innerWidth, sy = H / innerHeight;
      const pe = G.project(em), pc = G.project(em.clone().lerp(nk, 0.75)), p0 = G.project(C[0]), p1 = G.project(C[1]), eyeW = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x2 = c2.getContext('2d'); x2.drawImage(cv, 0, 0);
      const lum = (cx, cy, hw, hh) => { const d = x2.getImageData(Math.round((cx - hw) * sx), Math.round((cy - hh) * sy), Math.max(1, Math.round(2 * hw * sx)), Math.max(1, Math.round(2 * hh * sy))).data, L = []; for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); return L; };
      const whole = lum((pe.x + pc.x) / 2, (pe.y + pc.y) / 2, eyeW * 0.9, Math.abs(pc.y - pe.y) / 2 + eyeW * 0.3).sort((a, b) => a - b), lit = whole[Math.floor(whole.length * 0.7)];
      const low = lum(pc.x * 0.7 + pe.x * 0.3, pc.y * 0.7 + pe.y * 0.3, eyeW * 0.7, Math.abs(pc.y - pe.y) * 0.3), dark = low.filter((l) => l < lit * 0.5).length / low.length;
      res.push({ at: s.beat === 'end' ? 'under the card' : 'reading', ang: Math.round(ang), dark: +dark.toFixed(3), eyeW: Math.round(eyeW) });
    }
    return res;
  });
  for (const x of r) report(x.ang <= 62 && x.dark <= 0.1 && x.eyeW >= 10, `${v.name} readface ${x.at}: her face ${x.ang} degrees off the camera (cap 62), ${(x.dark * 100).toFixed(1)}% of mouth to chin heavy with ink (cap 10%), eyes ${x.eyeW} px apart`);
  await ctx.close();
}
if (want('readhand')) for (const v of VIEWS) {
  const { ctx, page } = await open(v);
  if (process.env.SH_DUMP) await page.evaluate(() => { window.__dumpHand = true; });   // SH_DUMP=path: also write the frame with the sampled points marked green
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T, V3 = T.Vector3; G.setQuality(2, true); G.goto('title'); G.goto('epilogue', { ending: 'sensor' });
    const res = [], f = D.jo.fig, body = f.meshes.find((m) => m.userData.role === 'skin'), names = body.skeleton.bones.map((b) => b.name), si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    const ids = { l: [], r: [] }; for (let i = 0; i < si.count; i += 2) for (const sd of ['l', 'r']) { let w = 0; for (let c = 0; c < 4; c++) if (new RegExp('^(hand|index|middle|ring|pinky|thumb)(_0\\d)?_' + sd + '$').test(names[si.getComponent(i, c)])) w += sw.getComponent(i, c); if (w > 0.6) ids[sd].push(i); }
    for (const until of [(s) => s.jo.book && s.beatTime > 25 && s.jo.lookUp < 0.01, (s) => s.beat === 'end']) {
      for (let i = 0; i < 9000 && !until(s); i++) G.step(0.1, true); if (s.beat === 'end') for (let i = 0; i < 30; i++) G.step(0.1, true);
      D.render.frame(D.scene); D.scene.updateMatrixWorld(true);
      const cv = D.render.renderer.domElement, W = cv.width, H = cv.height, sx = W / innerWidth, sy = H / innerHeight, c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x2 = c2.getContext('2d'); x2.drawImage(cv, 0, 0);
      const img = x2.getImageData(0, 0, W, H).data, cam = D.camera.position, ray = new T.Raycaster(), book = []; D.book.traverse((o) => { if (o.isMesh) book.push(o); });
      for (const sd of ['l', 'r']) { const v = new V3(), L = [];
        const P0 = body.geometry.attributes.position, N0 = body.geometry.attributes.normal, w2 = new V3();
        for (const i of ids[sd]) { body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld);
          // only the side of the hand that faces the camera (the vertex pushed 5 mm along its normal, skinned the same way)
          w2.fromBufferAttribute(P0, i).addScaledVector(new V3().fromBufferAttribute(N0, i), 0.005); body.applyBoneTransform(i, w2); w2.applyMatrix4(body.matrixWorld); if (w2.sub(v).dot(cam.clone().sub(v)) <= 0) continue;
          const d = v.clone().sub(cam), dl = d.length(); ray.set(cam, d.normalize()); ray.far = dl - 0.01; if (ray.intersectObjects(book, false).length) continue;
          const p = G.project(v); if (!p || p.behind) continue; const px = Math.round(p.x * sx), py = Math.round(p.y * sy); if (px < 0 || py < 0 || px >= W || py >= H) continue; if (window.__dumpHand) (window.__hp = window.__hp || []).push([sd, px, py]); const rr = 1; let mx = 0; for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const qx = Math.min(W - 1, Math.max(0, px + dx)), qy = Math.min(H - 1, Math.max(0, py + dy)), o = (qy * W + qx) * 4; mx = Math.max(mx, 0.2126 * img[o] + 0.7152 * img[o + 1] + 0.0722 * img[o + 2]); } L.push(mx); }   // (the brightest of the pixel and its eight neighbours: a hair-thin line between fingers passes; a clump of ink does not)
        const dark = L.length ? L.filter((l) => l < 60).length / L.length : 0; L.sort((a, b) => a - b); res.push({ at: s.beat === 'end' ? 'under the card' : 'reading', hand: sd === 'l' ? 'left' : 'right', n: L.length, dark: +dark.toFixed(3), pct: [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => Math.round(L[Math.floor(q * L.length)] || 0)) }); }
      if (window.__dumpHand && !window.__dumpURL) { x2.fillStyle = '#0f0'; for (const [sd, px, py] of window.__hp) x2.fillRect(px, py, 1, 1); window.__dumpURL = c2.toDataURL('image/png'); }
    }
    return res;
  });
  if (process.env.SH_DUMP) { const u = await page.evaluate(() => window.__dumpURL); if (u) (await import('node:fs')).writeFileSync(process.env.SH_DUMP + '-' + v.name + '.png', Buffer.from(u.split(',')[1], 'base64')); }
  for (const x of r) report(x.dark <= 0.4, `${v.name} readhand ${x.at}, her ${x.hand} hand: ${(x.dark * 100).toFixed(0)}% of its ${x.n} seen points in solid ink (cap 40%; brightness 10/30/50/70/90th: ${x.pct})`);
  await ctx.close();
}
if (want('faces')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T, out = {};
    // the faces are real modelled faces now: each person has a brow mesh and two textured eyes (round three's were dots)
    const eyesOf = (f) => f.meshes.find((m) => m.userData.role === 'eyes');
    for (const who of ['jo', 'tam']) { const f = D[who].fig, e = eyesOf(f); out[who] = { eyes: e ? e.geometry.index.count / 3 : 0, brows: f.meshes.filter((m) => /brow/i.test(m.name)).length, textured: !!(e && e.material.map && e.material.map.image && e.material.map.image.width > 0) }; }
    // the talk after the tray: both faces are seen, out on the roof
    G.goto('turn'); for (let i = 0; i < 30 * 120 && !(s.camera.shot === 'meet' && s.jo.action === 'idle' && s.tam.stage === 'top' && s.pots[6].present); i++) G.step(1 / 30, true);
    G.step(1.5, true); D.render.frame(D.scene);
    const cam = D.camera, ray = new T.Raycaster(), v = new T.Vector3();
    for (const who of ['jo', 'tam']) {
      const f = D[who].fig, e = eyesOf(f); f.root.updateMatrixWorld(true); for (const m of f.meshes) m.computeBoundingSphere();
      // the two eyes: the eye mesh's vertices, split left and right in the rest pose, each averaged where it is now
      const rest = e.geometry.attributes.position, C = [new T.Vector3(), new T.Vector3()], N = [0, 0];
      for (let k = 0; k < rest.count; k++) { const side = rest.getX(k) > 0 ? 0 : 1; e.getVertexPosition(k, v); v.applyMatrix4(e.matrixWorld); C[side].add(v); N[side]++; }
      let met = 0; const hit = [], blockers = [...f.meshes, ...D.held.filter((m) => m.visible)];
      for (let k = 0; k < 2; k++) { const c = C[k].multiplyScalar(1 / N[k]); ray.set(cam.position, c.clone().sub(cam.position).normalize()); ray.far = cam.position.distanceTo(c) + 0.02;
        const h = ray.intersectObjects(blockers, false)[0]; if (!h) continue;
        if (h.object === e || /brow/i.test(h.object.name) || (h.object.userData.role === 'skin' && h.distance > ray.far - 0.035)) met++; else hit.push(h.object.userData.role || h.object.name || 'a held thing'); }
      out[who].talk = { met, hit, shot: s.camera.shot };
    }
    return out;
  });
  for (const who of ['jo', 'tam']) {
    const o = r[who];
    report(o.eyes >= 200 && o.brows >= 1 && o.textured, `faces ${who}: a modelled face (${o.eyes} eye triangles, ${o.brows} brow mesh, eye texture ${o.textured ? 'loaded' : 'missing'})`);
    report(o.talk.met >= 1, `faces ${who}: in the ${o.talk.shot} shot the camera meets ${o.talk.met} eye${o.talk.met === 1 ? '' : 's'}${o.talk.hit.length ? '; blocked by ' + o.talk.hit.join(', ') : ''}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `GUIDE FAILED (${failed})` : 'GUIDE OK');
process.exit(failed ? 1 : 0);
