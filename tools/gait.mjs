// Gate: the walk reads as a person's (round seventeen). The owner: "her gait is kind of awkward, somehow more horselike
// than human". The library walk lifted the swinging knee to 89 degrees with the foot pointed down, and at her pace took
// 164 short steps a minute: a trot. Measured on the posed skeleton while she walks the deck on night one (and the
// neighbour, the night after by hand, out onto the roof and back), sampled at 30 Hz:
//   cadence   Jo: 100 to 130 steps a minute (a support foot changing over, timed)
//   step      Jo: 0.38 to 0.48 of her height between where one foot is planted and where the other is
//   knee      both: the swinging knee bends at most 72 degrees (a person: about 60; a horse's lift: 89)
//   toe       Jo: in the swing, the foot's sole is never pitched more than 45 degrees toe-down from the shin's square
//   slide     both: the foot on the deck (ankle or ball, whichever is still) moves at most 0.05 m/s at the median
// Writes a side-on strip of her walk to shots/gates/gait/. Red on the round sixteen build (knee 89, cadence 164).
//   node tools/gait.mjs [--html=path]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, htmlPath, GL, VIEWS } from './gates/drive.mjs';

const dist = htmlPath(); if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const out = join(root, 'shots/gates/gait'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
let failed = 0; const report = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.setQuality(0, true); window.__game.auto(false); });
  for (const who of ['jo', 'tam']) {
    const r = await page.evaluate((who) => {
      const G = window.__game, s = G.state, D = G.debug(), T = D.T;
      if (who === 'jo') G.goto('n1_water'); else { G.goto('choice', { ending: 'hand' }); G.goto('epilogue', { ending: 'hand' }); }
      const f = D[who].fig, P = (b) => new T.Vector3().setFromMatrixPosition(f.bones[b].matrixWorld), rec = [];
      const ang = (a, b, c) => 180 - Math.acos(Math.max(-1, Math.min(1, a.clone().sub(b).normalize().dot(c.clone().sub(b).normalize())))) * 180 / Math.PI;
      for (let i = 0; i < 30 * 150 && rec.length < 600; i++) {
        G.step(1 / 30, true);
        const walking = who === 'jo' ? s.jo.action === 'walk' && !s.jo.carrying && Math.abs(s.jo.y || 0) < 0.01 : s.tam.present && (s.tam.stage === 'out' || s.tam.stage === 'back');
        const speed = who === 'jo' ? null : null; void speed;
        if (!walking) continue;
        D.scene.updateMatrixWorld(true);
        const row = { t: s.time, root: P('root').toArray() };
        for (const k of ['l', 'r']) { const th = P('thigh_' + k), ca = P('calf_' + k), fo = P('foot_' + k), ba = P('ball_' + k);
          // toe-down: the angle of ankle->ball below square to the shin, in degrees (0 square, + toe pointed down)
          const shin = fo.clone().sub(ca).normalize(), sole = ba.clone().sub(fo).normalize();
          row[k] = { f: fo.toArray(), b: ba.toArray(), knee: ang(th, ca, fo), toe: Math.asin(Math.max(-1, Math.min(1, sole.dot(shin)))) * 180 / Math.PI }; }
        row.seg = i; rec.push(row);
      }
      return { rec, h: f.D.top };
    }, who);
    // keep steady stretches only: at least 0.8 s of uninterrupted walking, and the first 0.5 s of each dropped (getting going)
    const R = r.rec, runs = []; let cur = [];
    for (const x of R) { if (cur.length && x.seg !== cur[cur.length - 1].seg + 1) { runs.push(cur); cur = []; } cur.push(x); } if (cur.length) runs.push(cur);
    const steady = runs.filter((a) => a.length >= 40).map((a) => a.slice(15, -8)).filter((a) => a.length > 10);
    const knee = [], toe = [], slide = [], steps = [];
    for (const a of steady) {
      let last = null, lastT = null, lastP = null;
      for (let i = 1; i < a.length; i++) {
        const A = a[i - 1], B = a[i], dt = B.t - A.t, k = B.l.f[1] < B.r.f[1] ? 'l' : 'r', o = k === 'l' ? 'r' : 'l';
        knee.push(B.l.knee, B.r.knee);
        if (B[o].f[1] - B[k].f[1] > 0.04) toe.push(B[o].toe);   // (the swinging foot, clearly off the deck)
        if (Math.abs(B.l.f[1] - B.r.f[1]) > 0.02 && A[k].f[1] < A[o].f[1]) { const h = (q) => Math.hypot(B[k][q][0] - A[k][q][0], B[k][q][2] - A[k][q][2]) / dt; slide.push(Math.min(h('f'), h('b'))); }
        if (k !== last) { if (last) steps.push({ dt: B.t - lastT, len: Math.hypot(B[k].f[0] - lastP[0], B[k].f[2] - lastP[2]) }); last = k; lastT = B.t; lastP = B[k].f; }
      }
      steps.shift();
    }
    const med = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
    const kneeMax = knee.length ? [...knee].sort((x, y) => x - y)[Math.floor(knee.length * 0.98)] : NaN, toeMax = toe.length ? [...toe].sort((x, y) => x - y)[Math.floor(toe.length * 0.98)] : NaN;
    const cad = 60 / med(steps.map((q) => q.dt)), step = med(steps.map((q) => q.len)) / r.h, sl = med(slide);
    const tag = `${v.name} gait ${who}`, n = steady.reduce((a, b) => a + b.length, 0);
    if (who === 'jo') {
      report(n >= 40 && cad >= 100 && cad <= 130, `${tag}: ${cad.toFixed(0)} steps a minute (100 to 130; ${n} frames walking)`);
      report(n >= 40 && step >= 0.38 && step <= 0.48, `${tag}: a step is ${step.toFixed(2)} of her height (0.38 to 0.48)`);
      report(n >= 40 && toeMax <= 45, `${tag}: the swinging foot at most ${toeMax.toFixed(0)} degrees toe-down (cap 45)`);
    }
    report(n >= 30 && kneeMax <= 72, `${tag}: the swinging knee bends ${kneeMax.toFixed(0)} degrees at most (cap 72)`);
    report(n >= 30 && sl <= 0.05, `${tag}: the foot on the deck slides ${sl.toFixed(3)} m/s at the median (cap 0.05)`);
  }
  // the strip: her walk side on, a frame every 1/15 s
  if (!v.touch) {
    await page.evaluate(() => window.__game.goto('n1_water'));
    for (let i = 0, k = 0; i < 30 * 40 && k < 16; i++) {
      const url = await page.evaluate(() => { const G = window.__game, s = G.state, D = G.debug(), T = D.T; G.step(1 / 15, true);
        if (s.jo.action !== 'walk' || s.jo.carrying || Math.abs(s.jo.y || 0) > 0.01) return null;
        const f = D.jo.fig, rt = new T.Vector3().setFromMatrixPosition(f.root.matrixWorld), h = s.jo.heading, cam = D.camera;
        cam.position.copy(rt).addScaledVector(new T.Vector3(Math.cos(h), 0, -Math.sin(h)), 3.2); cam.position.y += 0.95; cam.lookAt(rt.x, rt.y + 0.85, rt.z); cam.updateMatrixWorld();
        D.scene.updateMatrixWorld(true); D.render.frame(D.scene); return D.render.renderer.domElement.toDataURL('image/png'); });
      if (url) writeFileSync(join(out, `walk-${String(k++).padStart(2, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  if (errors.length) report(false, `${v.name}: page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
