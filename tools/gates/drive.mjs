// Plays the whole game with the canonical player on both screens and both endings, and runs a geometric check on
// the posed figures every few tenths of a second (every frame of every action is sampled at 10 Hz while someone is
// doing something, 2 Hz while they stand or walk). Used by tools/limbs.mjs and tools/clash.mjs.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const inpage = readFileSync(join(root, 'tools/gates/inpage.js'), 'utf8');
export const VIEWS = [{ name: 'desk', w: 1440, h: 900, dpr: 1, touch: false }, { name: 'phone', w: 390, h: 844, dpr: 2, touch: true }];
export const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
export const htmlPath = () => { const a = process.argv.find((x) => x.startsWith('--html=')); return a ? a.slice(7) : join(root, 'dist/small-hours.html'); };

// check: 'body' | 'clash'. onFinding(run, finding) decides what is a failure. Returns { fails, report }.
export async function drive({ check, name, classify, shotsOf = 6 }) {
  const dist = htmlPath();
  if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
  const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7);
  const runs = VIEWS.flatMap((v) => ['hand', 'sensor'].map((ending) => ({ ...v, ending }))).filter((r) => !only || `${r.name}-${r.ending}` === only);
  const out = join(root, 'shots/gates', name); mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
  const report = { when: new Date().toISOString(), check, runs: [] };
  let failed = false;
  for (const run of runs) {
    const tag = `${run.name}-${run.ending}`;
    const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: run.dpr, hasTouch: run.touch, isMobile: run.touch });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    await page.evaluate(() => { window.__game.setQuality(2, true); window.__game.auto(false); });
    // SH_BREAK=stretch|hole|rim|float breaks the game on purpose, in the page, to prove the gate can fail:
    //   stretch  her right forearm made 15 percent longer     (limbs: bones)
    //   hole     her jacket's triangles removed               (limbs: joints or caps: the shoulders and neck are bare)
    //   rim      her cup arm 20 cm lower at the barrel         (clash: forearm through the rim)
    //   float    the neighbour's hand reported far from the bucket (clash: bucket in the air)
    if (process.env.SH_BREAK) await page.evaluate((how) => { const G = window.__game, D = G.debug(), f = D.jo.fig, solve = f.solve;
      if (how === 'stretch') { const base = f.bones.hand_r.position.clone(); f.solve = (p) => { solve(p); f.bones.hand_r.position.copy(base).multiplyScalar(1.15); f.inner.updateMatrixWorld(true); }; }
      if (how === 'hole') for (const m of f.meshes) if (m.userData.role === 'torso') m.geometry.setIndex([]);
      if (how === 'rim') f.solve = (p) => { if (G.state.jo.action === 'scoop') p.aRy -= 0.2; solve(p); };
      // for tools/pose.mjs: each of these puts back a fault a reviewer once saw
      //   stride   the feet left where the library's idle clip has them (a fencer's stance: the statue)
      //   plank    her whole body tipped from the ankles at the barrel
      //   hat      her head thrown forward at the barrel, so the hat tips like a plate
      //   stairs   the neighbour stopped three treads down with the tray, behind the grab post
      //   trayoff  the tray drawn half a metre above the hands that carry it
      //   nocup    the neighbour never takes the cup she holds out
      //   cupdrop  the cup, once taken, drawn half a metre below the hand
      //   bench    her stand, the night after, moved into the end of the shelf
      if (how === 'stride') f.solve = (p) => solve({ ...p, legIK: G.state.jo.action === 'idle' ? 0 : p.legIK });
      if (how === 'plank') f.solve = (p) => solve(G.state.jo.action === 'scoop' ? { ...p, pelRX: p.pelRX + 0.5, hipZ: p.hipZ + 0.25 } : p);
      if (how === 'hat') f.solve = (p) => solve(G.state.jo.action === 'scoop' ? { ...p, nkRX: p.nkRX + 0.5, hdRX: p.hdRX + 0.5 } : p);
      if (how === 'stairs' || how === 'trayoff' || how === 'nocup' || how === 'cupdrop' || how === 'bench') { const step = G.step, tr = D.tray;
        G.step = (...a) => { const r = step(...a), s = G.state;
          if (how === 'stairs' && s.tam.present && s.tam.hasTray && (s.tam.stage === 'top' || s.tam.stage === 'handoff')) { s.tam.pos = { x: -3.56, z: 4.25 }; s.tam.y = -0.6; s.tam.heading = Math.PI / 2; step(1 / 30); }
          if (how === 'trayoff' && s.jo.carrying) { tr.matrix.elements[13] += 0.5; tr.matrixWorldNeedsUpdate = true; }
          if (how === 'nocup' && s.tam.hasCup) s.tam.hasCup = false;
          if (how === 'cupdrop' && s.tam.hasCup) { D.jo.cup.matrix.elements[13] -= 0.5; D.jo.cup.matrixWorldNeedsUpdate = true; }
          if (how === 'bench' && s.beat === 'epilogue' && s.ending === 'hand' && s.tam.stage === 'climbing' && s.jo.action === 'idle') { s.jo.pos = { x: -2.4, z: 4.1 }; step(1 / 30); }
          return r; }; }
      // for tools/scene.mjs:
      //   streamoff  the cup drawn 15 cm away from where the water leaves it
      //   tamvanish  the neighbour stops being drawn a third of the way down the stairs
      //   bucketgone the bucket stops being drawn once it is set down
      //   frozen     both people held in one pose for the whole conversation
      //   bookslab   the book swapped back for a plain slab;  bookhands  the book drawn 40 cm above her hands
      //   bucketup   the set-down bucket drawn 8 cm above the deck;  bucketback  set down where it used to be, behind the shelf
      if (how === 'bucketup' || how === 'bucketback') { const step = G.step; G.step = (...a) => { const r = step(...a), s = G.state;
        if (s.ending === 'hand' && s.tam.present && s.tam.stage === 'top' && s.tam.stageT > 2) { const e = D.bucket.matrix.elements; if (how === 'bucketup') e[13] = 0.08; else { e[12] = -2.72; e[14] = 2.78; } D.bucket.matrixWorldNeedsUpdate = true; }
        return r; }; }
      if (['streamoff', 'tamvanish', 'bucketgone', 'bookslab', 'bookhands'].includes(how)) { const step = G.step;
        G.step = (...a) => { const r = step(...a), s = G.state;
          if (how === 'streamoff' && s.jo.action === 'pour') { D.jo.cup.matrix.elements[12] += 0.15; D.jo.cup.matrixWorldNeedsUpdate = true; }
          if (how === 'tamvanish' && s.tam.stage === 'leaving' && s.tam.t > 0.3) s.tam.present = false;
          if (how === 'bucketgone' && s.ending === 'hand' && s.tam.present && s.tam.stage === 'top' && s.tam.stageT > 2) D.bucket.visible = false;
          if (how === 'bookslab' && D.book) D.book.userData.real = null;
          if (how === 'bookhands' && D.book && D.book.visible) { D.book.matrix.elements[13] += 0.4; D.book.matrixWorldNeedsUpdate = true; }
          return r; }; }
      if (how === 'frozen') for (const fg of [f, D.tam.fig]) { const sv = fg.solve; let hold = null; fg.solve = (p) => { const tk = G.state.tam.present && (G.state.tam.stage === 'top' || G.state.tam.stage === 'handoff'); if (!tk) { hold = null; return sv(p); } hold = hold || { ...p, cTalk: 0, cNod: 0, cIdle: 1 }; for (const k in fg.time) fg.time[k] = 0; sv(hold); }; }
      // post: the old grab post put back at the stair head (pose: across)
      if (how === 'post') { const h = D.props.hatch; let mesh = null; h.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        const P = [], r = 0.024, x0 = -2.7 - r, x1 = -2.7 + r, z0 = 4.9 - r, z1 = 4.9 + r, y1 = 0.95;
        for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) P.push(ax, 0, az, bx, 0, bz, bx, y1, bz, ax, 0, az, bx, y1, bz, ax, y1, az);
        const g = new mesh.geometry.constructor(); g.setAttribute('position', new mesh.geometry.attributes.position.constructor(new Float32Array(P), 3)); g.computeVertexNormals();
        const pole = new mesh.constructor(g, mesh.material.clone()); pole.material.side = 2; pole.name = 'post'; D.scene.add(pole); h.add(pole); pole.updateMatrixWorld(true); }
      // pole: a thin upright stood between the camera and her face while she reads (scene: readface)
      if (how === 'pole') { let mesh = null; D.props.hatch.traverse((o) => { if (!mesh && o.isMesh) mesh = o; }); const step = G.step; let pole = null;
        let held = 0; G.step = (...a) => { const r = step(...a), s = G.state; held = s.jo.book && s.camera.shot === 'readClose' ? held + 1 : 0; if (held > 30 && !pole) {
          const V = D.T.Vector3, h = new V().setFromMatrixPosition(D.jo.fig.bones.Head.matrixWorld), c = D.camera.position, at = h.clone().lerp(c, 0.25), P = [], r0 = 0.02;
          for (const [ax, az, bx, bz] of [[-r0, -r0, r0, -r0], [r0, -r0, r0, r0], [r0, r0, -r0, r0], [-r0, r0, -r0, -r0]]) P.push(at.x + ax, 0, at.z + az, at.x + bx, 0, at.z + bz, at.x + bx, 2, at.z + bz, at.x + ax, 0, at.z + az, at.x + bx, 2, at.z + bz, at.x + ax, 2, at.z + az);
          const g = new mesh.geometry.constructor(); g.setAttribute('position', new mesh.geometry.attributes.position.constructor(new Float32Array(P), 3)); g.computeVertexNormals();
          pole = new mesh.constructor(g, mesh.material.clone()); pole.material.side = 2; D.scene.add(pole); pole.updateMatrixWorld(true); window.__gatePole = pole; }
          return r; }; }
      // apart: her walk to the bucket ends inside the neighbour (pose: apart)
      if (how === 'apart') { const step = G.step; G.step = (...a) => { const r = step(...a), s = G.state; if (s.beat === 'turn' && s.tam.present && s.tam.stage === 'top' && s.jo.action === 'idle') { s.jo.pos = { x: s.tam.pos.x + 0.2, z: s.tam.pos.z }; } return r; }; }
      // traykeep: the neighbour goes home with the empty tray again, as before round nine (clash: the tray in the door)
      if (how === 'traykeep') { const step = G.step; G.step = (...a) => { const s = G.state; if (s.pots[6].present && s.tam.present && s.night === 2) s.tam.hasTray = true; return step(...a); }; }
      // nolook: the following camera no longer turns toward the water she needs (scene: source)
      if (how === 'nolook') { const step = G.step; G.step = (...a) => { const r = step(...a); G.state.camera.lookTo = null; return r; }; Object.defineProperty(G.state.camera, 'lookTo', { get: () => null, set: () => {}, configurable: true }); }
      // tail: the rope of water left sailing on after the cup comes up (scene: loose)
      if (how === 'tail') G.state.__tail = true;
      // trayring: the chalk ring on the tray as it is tapped and while it waits (scene: ring)
      if (how === 'trayring') G.state.__trayRing = true;
      // chairnear: the reading chair back by the shelf's end, behind its near pot and the feed-line hoop (scene: readsit)
      if (how === 'chairnear') { G.state.__oldRead = true; const step = G.step; G.step = (...a) => { const s = G.state; if (s.chairAt && s.jo.seat === 'chair') { s.chairAt = { x: -1.78, z: 3.08, heading: -1.3 }; s.jo.pos.x = -1.78; s.jo.pos.z = 3.08; } return step(...a); }; }
      // bookearly: the open book out while she is still lowering herself (scene: readearly)
      if (how === 'bookearly') { const step = G.step; G.step = (...a) => { const s = G.state; if (s.jo.seat === 'chair' && s.jo.action === 'sit' && (s.jo.sitK ?? 1) > 0.3) s.jo.book = true; return step(...a); }; }
      // kneeltap: her old place at the tap, a hand closer, the head bowed into the pipe (pose: tapface, taphat)
      if (how === 'kneeltap') f.solve = (p) => solve(G.state.jo.action === 'scoop' && G.state.jo.target === 'valve' ? { ...p, hipZ: p.hipZ + 0.3, nkRX: p.nkRX + 0.3 } : p);
      // crouch: the old climb, the hips sunk a hand lower over feet that trail behind them (pose: crouch)
      if (how === 'crouch') { const tf = D.tam.fig, ts = tf.solve; tf.solve = (p) => ts(G.state.tam.stage === 'climbing' ? { ...p, hipY: p.hipY - 0.16, fLz: p.fLz - 0.12, fRz: p.fRz - 0.12 } : p); }
      // trayhigh: the neighbour's head sunk behind the stakes on the tray (pose: trayface)
      if (how === 'trayhigh') { const tf = D.tam.fig, ts = tf.solve; tf.solve = (p) => ts(G.state.tam.hasTray ? { ...p, nkRX: p.nkRX + 0.5, spRX: p.spRX + 0.35 } : p); }
      // stall: the tap is never found on night three, so the game never ends (any gate: the end must be reached)
      if (how === 'stall') Object.defineProperty(G.state.valve, 'found', { get: () => false, set: () => {}, configurable: true });
      // endon: the hand-over filmed from eye height again, the tray turning end on (pose: potcount)
      if (how === 'endon') { const step = G.step; G.step = (...a) => { if (G.state.camera.shot === 'take') G.state.camera.shot = 'meet'; return step(...a); }; }
      // stare: the old look up from the page, straight into the lens (scene: gaze)
      if (how === 'stare') f.solve = (p) => solve(G.state.jo.book && G.state.jo.action === 'sit' ? { ...p, nkRX: p.nkRX - 0.45, hdRX: p.hdRX - 0.45, hdRY: p.hdRY + 0.25 } : p);
      // round eleven:
      //   highcup  at the barrel the cup held up by her head again (pose: hatarm, cuphigh)
      //   lidleg   the round ten reading shot, behind the open lid (scene: readlegs)
      //   infront  the night after, by hand, she stands where she used to as he comes up, in front of him (scene: hatface)
      if (how === 'highcup') f.solve = (p) => solve(G.state.jo.action === 'scoop' && G.state.jo.target === 'barrel' ? { ...p, aRy: p.aRy + 0.45 } : p);
      if (how === 'lidleg') G.state.__shotTry = { readClose: { l: { at: [-1.94, 0.8, 2.88], dist: 3.3, yaw: -1.14, pitch: 0.1, fov: 34 }, p: { at: [-1.94, 0.8, 2.88], dist: 3.7, yaw: -1.14, pitch: 0.1, fov: 44 }, tau: 1.3 } };
      if (how === 'infront') { const step = G.step; G.step = (...a) => { const s = G.state; if (s.ending === 'hand' && s.beat === 'epilogue' && s.tam.present && (s.tam.stage === 'out' || s.tam.stage === 'top') && s.jo.action === 'idle' && !(s.jo.dip > 0) && s.jo.cup <= 0) s.jo.pos = { x: -1.05, z: 3.2 }; return step(...a); }; }
      if (how === 'float') { const od = G.debug; G.debug = () => { const d = od(); d.tam.handWorld = (n, o) => o.set(0, 9, 0); return d; }; }
    }, process.env.SH_BREAK);
    await page.addScriptTag({ content: inpage });
    await page.evaluate((e) => { window.__game.goto('title'); window.__game.goto('n1_open', { ending: e }); }, run.ending);
    // step through the game in chunks, checking inside the page
    const findings = []; let samples = 0, t0 = Date.now(), lastBeat = '';
    for (let guard = 0; guard < 200; guard++) {
      const r = await page.evaluate(([check, chunk]) => {
        const G = window.__game, s = G.state, got = [], ACT = ['scoop', 'pour', 'pourEmpty', 'take', 'carry', 'place', 'plant', 'sit', 'read', 'climb', 'descend'];
        let n = 0, acc = 0; const dt = 0.1;
        for (let t = 0; t < chunk && s.beat !== 'end'; t += dt) {
          G.step(dt, true); acc += dt;
          const busy = ACT.includes(s.jo.action) || (s.tam.present && s.tam.stage !== 'gone') || (s.jo.dip > 0);
          if (!(s.jo.present || s.tam.present) || (s.fade < 0.2 && !s.jo.carrying)) continue;   // (the tray she carries is checked all the way down to dark)
          if (busy ? acc < 0.1 - 1e-6 : acc < 0.5 - 1e-6) continue;
          acc = 0; n++;
          const f = window.__gate[check]();
          const ctxInfo = { time: +s.time.toFixed(2), beat: s.beat, action: s.jo.action, target: s.jo.target, tam: s.tam.present ? s.tam.stage : null, shot: s.camera.shot };
          if (check === 'body') { for (const k of ['caps', 'joints', 'bones']) for (const x of f[k]) got.push({ kind: k, ...x, ...ctxInfo }); }
          else for (const x of f) got.push({ kind: check, ...x, ...ctxInfo });
        }
        return { got, n, beat: s.beat, time: s.time };
      }, [check, 12]);
      findings.push(...r.got); samples += r.n; lastBeat = r.beat;
      if (r.beat === 'end') break;
    }
    // a game that never ends passes every check it never reaches: that is a failure in itself (round nine: night three
    // stalled with the tap never found, and every gate stayed green)
    if (lastBeat !== 'end') errors.push('the canonical player never reached the end card (stuck in ' + lastBeat + ')');
    // the last picture: the end card is up over the roof. Checked once, three seconds in (round eleven: what the card
    // covers, and what the reader is left looking at, is part of the ending)
    else { const r = await page.evaluate((check) => { const G = window.__game, s = G.state; for (let i = 0; i < 30; i++) G.step(0.1, true);
        const f = window.__gate[check](), ctxInfo = { time: +s.time.toFixed(2), beat: s.beat, action: s.jo.action, target: s.jo.target, tam: s.tam.present ? s.tam.stage : null, shot: s.camera.shot };
        return check === 'body' ? ['caps', 'joints', 'bones'].flatMap((k) => f[k].map((x) => ({ kind: k, ...x, ...ctxInfo }))) : f.map((x) => ({ kind: check, ...x, ...ctxInfo })); }, check);
      findings.push(...r); }
    // group: one row per (kind, who, tag/joint/prop, action), with its count and first sighting
    const groups = new Map();
    for (const f of findings) {
      const key = [f.kind, f.who, f.tag || f.joint || '', f.prop || '', f.action, f.beat].join('|');
      const g = groups.get(key) || { ...f, n: 0, first: f.time }; g.n++; groups.set(key, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.n - a.n);
    const fails = rows.filter((r) => classify(r) === 'fail');
    // a frame of the first few failures, so a person can see what the numbers mean
    let k = 0;
    for (const r of fails.slice(0, shotsOf)) {
      await page.evaluate(([t, e]) => { const G = window.__game; G.goto('title'); G.goto('n1_open', { ending: e }); while (G.state.time < t - 0.05 && G.state.beat !== 'end') G.step(0.1, true); G.frameStats(); }, [r.first, run.ending]);
      const f = `${tag}-${String(++k).padStart(2, '0')}-${(r.tag || r.joint || r.prop || r.kind).replace(/[^a-z0-9]/gi, '_')}.png`;
      await page.screenshot({ path: join(out, f) }); r.shot = f;
    }
    const rr = { tag, samples, seconds: Math.round((Date.now() - t0) / 1000), findings: findings.length, rows, fails: fails.length, errors };
    report.runs.push(rr); failed = failed || fails.length > 0 || errors.length > 0;
    console.log(`${fails.length || errors.length ? 'FAIL' : 'ok  '} ${tag}  ${samples} samples in ${rr.seconds}s  ${rows.length} kinds, ${fails.length} failing`);
    for (const r of fails.slice(0, 14)) console.log(`     - ${r.kind} ${r.who} ${r.tag || r.joint || ''}${r.holder ? ' (' + r.holder + ')' : ''}${r.prop ? ' in ' + r.prop : ''} x${r.n}  during ${r.action}${r.tam ? ' (neighbour ' + r.tam + ')' : ''} in ${r.beat} at ${r.first}s  ${r.px ? r.px + 'px' : ''}${r.gap != null ? ' gap ' + r.gap : ''}${r.pairs ? ' pairs ' + r.pairs : ''} @${r.x},${r.y}${r.at ? ' world ' + r.at.join(',') : ''}${r.hemY ? ' hemY ' + r.hemY + ' vs ' + r.legTag : ''}${r.shot ? '  ' + r.shot : ''}`);
    for (const e of errors.slice(0, 3)) console.log('     ! ' + e);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`${failed ? name.toUpperCase() + ' FAILED' : name.toUpperCase() + ' OK'} -> shots/gates/${name}/report.json`);
  return { failed, report };
}
