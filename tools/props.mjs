// Gate: carried things. Two checks on what people carry, done against the meshes, on the desktop view.
//   tray    night two, from the neighbour's first step to the tray going home: no tray triangle crosses the roof
//           and what is fixed to it (the grab post at the stair head, the kerb), the shelf, or the hatch and its lid.
//   bucket  the night after, by hand: every frame the bucket is drawn it is either in the neighbour's hand or
//           standing on the deck. Never in the air between the two, never back in a hand it has left.
//   node tools/props.mjs [--html=path]
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, GL, htmlPath } from './gates/drive.mjs';

const dist = htmlPath();
if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const inpage = readFileSync(join(root, 'tools/gates/inpage.js'), 'utf8');
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
await page.evaluate(() => { window.__game.setQuality(0, true); window.__game.auto(false); });
await page.addScriptTag({ content: inpage });

const r = await page.evaluate(() => {
  const G = window.__game, s = G.state, D = G.debug(), triTri = window.__gate.triTri, V = new D.T.Vector3();
  const tray = D.held[2], bucket = D.held[3];
  const tris = (mesh) => {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, pos = g.attributes.position.array, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.length / 3, out = [];
    const at = (i) => { const k = (idx ? idx[i] : i) * 3; V.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(mesh.matrixWorld); return [V.x, V.y, V.z]; };
    for (let i = 0; i + 2 < n; i += 3) { const t = [at(i), at(i + 1), at(i + 2)];
      t.lo = [0, 1, 2].map((a) => Math.min(t[0][a], t[1][a], t[2][a])); t.hi = [0, 1, 2].map((a) => Math.max(t[0][a], t[1][a], t[2][a])); out.push(t); }
    return out;
  };
  const meshes = (group) => { const out = []; group.traverse((o) => { if (o.isMesh && o.visible && o.geometry && o.geometry.attributes.position) out.push(o); }); return out; };
  const apart = (a, b) => a.hi[0] < b.lo[0] || b.hi[0] < a.lo[0] || a.hi[1] < b.lo[1] || b.hi[1] < a.lo[1] || a.hi[2] < b.lo[2] || b.hi[2] < a.lo[2];
  // the roof and its fixed furniture never move: their triangles are taken once. The hatch has a lid that does.
  const meshOrGroup = (o) => (o.isMesh ? [o] : meshes(o));
  const fixed = ['roof', 'shelf', 'beds', 'barrel', 'marlow'].map((k) => [k, meshOrGroup(D.props[k]).flatMap(tris)]);
  const near = (T, theirs) => { const box = { lo: [0, 1, 2].map((a) => Math.min(...T.map((t) => t.lo[a]))), hi: [0, 1, 2].map((a) => Math.max(...T.map((t) => t.hi[a]))) }; return theirs.filter((t) => !apart(t, box)); };
  const crossings = (mine, theirs) => { let n = 0, where = null; for (const a of mine) for (const b of theirs) { if (apart(a, b)) continue; if (triTri(a[0], a[1], a[2], b[0], b[1], b[2])) { n++; if (!where) where = b[0].map((x) => +x.toFixed(2)); break; } } return { n, where }; };

  // ---- the tray ----
  const trayHits = [];
  G.goto('title'); G.goto('turn', { ending: 'hand' });
  for (let i = 0; i < 30 * 150 && !(s.beat !== 'turn' && !s.tam.present && !tray.visible); i++) {
    G.step(1 / 30, true); if (!tray.visible) continue;
    const T = tris(tray);
    for (const [name, theirs] of [...fixed, ['hatch', meshes(D.props.hatch).flatMap(tris)]]) {
      const c = crossings(T, near(T, theirs)); if (c.n) trayHits.push({ prop: name, n: c.n, where: c.where, time: +s.time.toFixed(2), beat: s.beat, jo: s.jo.action, tam: s.tam.stage });
    }
  }

  // ---- the bucket ----
  // "held" is measured, not read from state: the top of the bucket's handle within 6 cm of the neighbour's right hand.
  // "standing" is its base flat on the deck (y = 0) and not moving.
  const tam = D.tam.fig, HM = new D.T.Matrix4(), hand = new D.T.Vector3(), at = new D.T.Vector3(), last = new D.T.Vector3(), bucketBad = []; let set = false, seen = 0;
  G.goto('title'); G.goto('epilogue', { ending: 'hand' });
  for (let i = 0; i < 30 * 120 && s.beat !== 'end'; i++) {
    G.step(1 / 30, true); if (!bucket.visible || s.fade < 0.05) { last.set(NaN, NaN, NaN); continue; }
    seen++; at.setFromMatrixPosition(bucket.matrix);
    tam.boneMatrix('handR', HM); hand.set(0, -0.075, 0).applyMatrix4(HM);
    const rim = at.clone(); rim.y += 0.43; const gap = rim.distanceTo(hand), moving = isFinite(last.x) && at.distanceTo(last) > 0.0005, down = Math.abs(at.y) < 0.005 && !moving;
    const held = gap < 0.06;
    if (down) set = true;
    const why = !held && !down ? 'in the air' : set && !down ? 'picked up again' : null;
    if (why) bucketBad.push({ why, y: +at.y.toFixed(3), gap: +gap.toFixed(2), time: +s.time.toFixed(2), bt: +s.beatTime.toFixed(2), tam: s.tam.stage });
    last.copy(at);
  }
  return { trayHits, bucketBad, seen, set };
});
await browser.close();

let failed = errors.length > 0;
const group = (rows, key) => { const m = new Map(); for (const x of rows) { const k = key(x); const g = m.get(k) || { ...x, frames: 0 }; g.frames++; m.set(k, g); } return [...m.values()]; };
const tray = group(r.trayHits, (x) => [x.prop, x.beat, x.jo].join('|'));
console.log(`${tray.length ? 'FAIL' : 'ok  '} tray: ${tray.length ? 'it crosses something' : 'crosses nothing from the stairs to the shelf and back'}`);
for (const t of tray) console.log(`     - through the ${t.prop} near ${JSON.stringify(t.where)} for ${t.frames} samples, first at ${t.time}s (${t.beat}, she: ${t.jo}, neighbour: ${t.tam})`);
const bucket = group(r.bucketBad, (x) => [x.why, x.tam].join('|'));
const noBucket = !r.seen || !r.set;
console.log(`${bucket.length || noBucket ? 'FAIL' : 'ok  '} bucket: ${noBucket ? 'never seen set down (' + r.seen + ' frames drawn)' : bucket.length ? 'neither held nor on the deck' : 'held, then on the deck, for all ' + r.seen + ' frames it is drawn'}`);
for (const b of bucket) console.log(`     - ${b.why} for ${b.frames} frames, first at ${b.bt}s into the night after (y ${b.y}, ${b.gap} m from the hand, neighbour: ${b.tam})`);
for (const e of errors.slice(0, 3)) console.log('     ! ' + e);
failed = failed || tray.length > 0 || bucket.length > 0 || noBucket;
console.log(failed ? 'PROPS FAILED' : 'PROPS OK');
process.exit(failed ? 1 : 0);
