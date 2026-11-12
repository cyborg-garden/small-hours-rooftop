// Gate: what round six's blind reviewer could not find or could not see. Each check plays the real build and measures
// the picture, the meshes or the clock; none reads the script.
//   hint      night one, no input at all after the roof is the player's: a chalk ring lands on a dry pot within 10.5 s,
//             on the desk and on a touch phone (no hover there)
//   empty     a pour from an empty cup: within 3 s the camera has the water on screen and a ring lands on it
//   refill    nights two and three, the canonical player: a full cup holds at least five, and night two takes at most
//             three trips for water, night three four (the barrel once, then the slow tap by the beds)
//   reading   the sensor ending with no look ever taken: the folding chair has been carried to the shelf, she sits IN it
//             (pelvis at chair height, over its seat), a steady warm light is on her, and at the peak of the gesture her
//             right hand is on a leaf of the basil (within 6 cm of a leaf vertex)
//   tray      after the hand-off the delivered tray is never drawn inside the shelf's footprint or a pot
//   frame     the phone's home shot (390 x 844) holds the shelf's left end, the end post, its sign and the crate
//   marlow    the first line that names Marlow says what Marlow is (it waters, runs, or is the roof's system)
//   faces     both people: a lash line, two lids and a point of light per eye, eyes at least 3.4 cm wide, and in the talk
//             shot after the tray the camera meets each person's eye, not hair
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
  await page.evaluate(() => { window.__game.setQuality(0, true); window.__game.auto(false); });
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
  if (want('empty')) {
    const { ctx, page } = await open(v);
    const r = await page.evaluate((RINGS) => {
      const G = window.__game, s = G.state; G.goto('n1_water'); G.step(1, false); const rings = new Function('return ' + RINGS);
      G.tap('p0'); let empty = null, seen = null, ringed = null, t = 0;
      for (let i = 0; i < 30 * 16 && (seen == null || ringed == null); i++) {
        G.step(1 / 30, false); t += 1 / 30;
        if (empty == null && s.jo.action === 'pourEmpty') empty = t;
        if (empty == null) continue;
        const q = G.screenOf('barrel'), on = q.on && !q.behind && q.x > 20 && q.y > 20 && q.x < innerWidth - 20 && q.y < innerHeight - 20;
        if (seen == null && on) seen = t - empty;
        if (ringed == null && on && rings().some((c) => Math.hypot(c.x - q.x, c.y - q.y) < 60)) ringed = t - empty;
      }
      return { empty, seen, ringed, line: s.text.line };
    }, RINGS);
    report(r.empty != null && r.seen != null && r.seen <= 3, `${v.name} empty: the barrel is on screen ${r.seen == null ? 'never' : r.seen.toFixed(1) + ' s'} after the empty pour (cap 3 s)`);
    report(r.ringed != null && r.ringed <= 3, `${v.name} empty: a ring on the barrel at ${r.ringed == null ? 'never' : r.ringed.toFixed(1) + ' s'} (cap 3 s)`);
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
    const M = new T.Matrix4(), P = new T.Vector3(), out = { sat: false, pelvisY: null, offSeat: null, light: [], hand: Infinity, chair: null };
    for (let i = 0; i < 30 * 120 && s.beat !== 'end'; i++) {
      G.step(1 / 30, false);
      const sat = s.jo.action === 'sit' && s.jo.book;
      if (!sat) continue;
      out.sat = true;
      D.jo.fig.boneMatrix('pelvis', M); P.setFromMatrixPosition(M); out.pelvisY = +P.y.toFixed(3);
      const ch = new T.Box3().setFromObject(D.chair), c = ch.getCenter(new T.Vector3());
      out.chair = { x: +c.x.toFixed(2), z: +c.z.toFixed(2), top: +ch.max.y.toFixed(2) };
      out.offSeat = +Math.hypot(P.x - c.x, P.z - c.z).toFixed(3);
      const L = D.render.lighting; out.light.push((L.read ? L.read.intensity : 0) + L.spill.intensity);
      if ((s.jo.leaf || 0) > 0.95) {
        D.jo.fig.boneMatrix('handR', M); const h = new T.Vector3(0, -0.06, 0).applyMatrix4(M);
        const m = D.potMeshes[1], g = m.geometry, Pa = g.attributes.position, C = g.attributes.color, w = new T.Vector3(); m.updateMatrixWorld(true);
        for (let k = 0; k < Pa.count; k++) { const rr = C.getX(k), gg = C.getY(k), bb = C.getZ(k); if (!(gg > rr * 1.1 && gg > bb)) continue;
          w.fromBufferAttribute(Pa, k).applyMatrix4(m.matrixWorld); if (w.y < 0.62) continue; out.hand = Math.min(out.hand, h.distanceTo(w)); }
      }
    }
    const ls = out.light.slice(30), lo = Math.min(...ls), hi = Math.max(...ls);
    return { ...out, light: { lo: +lo.toFixed(2), hi: +hi.toFixed(2) }, hand: +out.hand.toFixed(3), beat: s.beat };
  });
  const tag = `${vv.name} reading`;
  report(r.sat && r.chair && Math.hypot(r.chair.x - -2.0, r.chair.z - 3.06) < 0.35, `${tag}: the chair is at the shelf's end (${r.chair ? r.chair.x + ', ' + r.chair.z : 'none'})`);
  report(r.sat && r.pelvisY >= 0.45 && r.offSeat <= 0.25, `${tag}: she sits in the chair (pelvis ${r.pelvisY} m up, ${r.offSeat} m off its centre)`);
  report(r.sat && r.light.lo >= 3 && r.light.hi - r.light.lo <= 0.05 * r.light.hi, `${tag}: a steady warm light on her (${r.light.lo}..${r.light.hi})`);
  report(r.hand <= 0.06, `${tag}: her hand on a basil leaf at the gesture's peak (${Number.isFinite(r.hand) ? (r.hand * 100).toFixed(1) + ' cm' : 'no touch'}; cap 6 cm)`);
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
if (want('faces')) {
  const { ctx, page } = await open(v);
  const r = await page.evaluate(() => {
    const G = window.__game, s = G.state, D = G.debug(), T = D.T, out = {};
    for (const who of ['jo', 'tam']) {
      const f = D[who].fig, n = (t) => f.parts.filter((p) => p.tag === t).length;
      const eye = f.parts.find((p) => p.tag === 'eye'); let lo = Infinity, hi = -Infinity;
      if (eye) for (let k = eye.start; k < eye.start + eye.count; k++) { const x = f.bind[f.mesh.geometry.index.array[k] * 3]; lo = Math.min(lo, x); hi = Math.max(hi, x); }
      out[who] = { lash: n('lash'), lid: n('lid'), glint: n('glint'), eyeW: eye ? +(hi - lo).toFixed(4) : 0 };
    }
    // the talk after the tray: both faces are seen across the stair head
    G.goto('turn'); for (let i = 0; i < 30 * 120 && !(s.camera.shot === 'talk' && s.jo.action === 'idle' && s.tam.stage === 'top' && s.tam.hasTray); i++) G.step(1 / 30, true);
    G.step(1.5, true); D.render.frame(D.scene);
    const cam = D.camera, ray = new T.Raycaster();
    for (const who of ['jo', 'tam']) {
      const f = D[who].fig; f.root.updateMatrixWorld(true); f.mesh.geometry.computeBoundingSphere();
      const pos = f.mesh.geometry.attributes.position.array, idx = f.mesh.geometry.index.array, M = f.mesh.matrixWorld; let met = 0; const hit = [];
      for (const p of f.parts.filter((q) => q.tag === 'iris')) {
        const c = new T.Vector3(); let k = 0; for (let j = p.start; j < p.start + p.count; j++) { c.x += pos[idx[j] * 3]; c.y += pos[idx[j] * 3 + 1]; c.z += pos[idx[j] * 3 + 2]; k++; }
        c.multiplyScalar(1 / k).applyMatrix4(M); ray.set(cam.position, c.clone().sub(cam.position).normalize()); ray.far = cam.position.distanceTo(c) + 0.02;
        const h = ray.intersectObject(f.mesh, false)[0]; if (!h) continue; const o = h.faceIndex * 3, part = f.parts.find((q) => o >= q.start && o < q.start + q.count);
        if (part && /^(eye|iris|lid|lash|glint)$/.test(part.tag)) met++; else hit.push(part ? part.tag : '?');
      }
      out[who].talk = { met, hit, shot: s.camera.shot };
    }
    return out;
  });
  for (const who of ['jo', 'tam']) {
    const o = r[who];
    report(o.lash >= 2 && o.lid >= 4 && o.glint >= 2, `faces ${who}: ${o.lash} lash lines, ${o.lid} lids, ${o.glint} points of light (2, 4, 2)`);
    report(o.eyeW >= 0.034, `faces ${who}: eye ${(o.eyeW * 100).toFixed(1)} cm wide (at least 3.4)`);
    report(o.talk.met >= 1, `faces ${who}: in the ${o.talk.shot} shot the camera meets ${o.talk.met} eye${o.talk.met === 1 ? '' : 's'}${o.talk.hit.length ? '; blocked by ' + o.talk.hit.join(', ') : ''}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `GUIDE FAILED (${failed})` : 'GUIDE OK');
process.exit(failed ? 1 : 0);
