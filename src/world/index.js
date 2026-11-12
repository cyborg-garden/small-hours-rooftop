// OWNER: B (world), wired by the integrator. createWorld(render, state, bus) -> { scene, update(dt), cupLip() }.
// World is a VIEW of state. It never decides anything and never moves Jo. Every model lives in its own file;
// this one builds them, places the things people carry (the tray, the bucket, the stake, the cup) from the
// people's own bones, and hands each figure the few world points its pose needs.
import * as THREE from 'three';
import { Batch, paint, smooth, clamp, follow } from './kit.js';
import { createHot } from './hot.js';
import { buildSky } from './sky.js';
import { buildCity } from './city.js';
import { buildRoof } from './roof.js';
import { buildHatch } from './hatch.js';
import { buildShelf } from './shelf.js';
import { buildBeds } from './beds.js';
import { buildMarlow } from './marlow.js';
import { buildBarrel } from './barrel.js';
import { buildPots } from './plants.js';
import { createJo } from './jo.js';
import { createTam, makeTray, makeBucket, TRAY_SLOTS } from './tam.js';
import { Batch as B2, box as box2, xf as xf2, mix as mix2 } from './kit.js';
import { createWater } from './water.js';
import { beatIndex } from '../core/beats.js';
import { ANCHORS } from '../core/layout.js';

// where the tray sits relative to whoever holds it (figure space: +z is in front of them)
const TAM_HOLD = new THREE.Matrix4().makeTranslation(0, 1.24, 0.5);   // held out at the chest, over the well: they are three treads below her, so it reaches her at the hip
const JO_HOLD = new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0.98, 0.46);
// after the hand-off the empty tray goes back to the neighbour and leaves with them: it is never stowed among the pots
// the bucket, set down on the deck at the stair head, by the shelf's end
export const BUCKET_DOWN = new THREE.Vector3(-2.64, 0, 4.42);
// the book, the night after by sensor: open on her knees, the spine toward her, tipped up to catch the stair light.
// In figure space (+z in front of her); the hands hold the two outer edges.
const BOOK_LOCAL = new THREE.Matrix4().compose(new THREE.Vector3(0.0, 0.64, 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.85, 0, 0)), new THREE.Vector3(1, 1, 1));
// in the chair her lap is higher and nearer level: the book with it
const BOOK_CHAIR = new THREE.Matrix4().compose(new THREE.Vector3(0.0, 0.8, 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0)), new THREE.Vector3(1, 1, 1));
const BOOK_GRIP = { L: new THREE.Vector3(0.14, 0.014, -0.01), R: new THREE.Vector3(-0.14, 0.014, -0.01) };
// shut, carried in the right hand at her side: hand space (the bone points down the fingers), the spine against the palm
const BOOK_CARRY = new THREE.Matrix4().compose(new THREE.Vector3(0.0, -0.1, 0.055), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1));
export function makeBook() {
  const b = new B2(), cover = mix2('tamCap', 'cedar', 0.45), leaf = mix2('paper', 'tag', 0.5), edge = mix2('tag', 'tray', 0.3);   // a cloth binding, worn red
  for (const s of [-1, 1]) {   // two boards opened to a shallow V, each with its block of pages
    const m = xf2(s * 0.078, 0, 0, 0, 0, s * -0.22);
    b.add(box2(0.155, 0.007, 0.22), cover, m.clone().multiply(xf2(0, -0.0035, 0)));
    b.add(box2(0.146, 0.014, 0.212), (p, n) => (n.y > 0.5 ? leaf : edge), m.clone().multiply(xf2(0, 0.007, 0)));
  }
  b.add(box2(0.016, 0.014, 0.22), cover, xf2(0, -0.001, 0));   // the spine
  const m = b.mesh(paint.lit()); m.matrixAutoUpdate = false; m.castShadow = false; return m;
}
export function makeBookShut() {
  const b = new B2(), cover = mix2('tamCap', 'cedar', 0.45), leaf = mix2('paper', 'tag', 0.5);
  b.add(box2(0.16, 0.036, 0.225), cover, xf2(0, 0, 0));
  b.add(box2(0.15, 0.03, 0.216), leaf, xf2(0.006, 0, 0));   // the page block showing at the fore-edge
  const m = b.mesh(paint.lit()); m.matrixAutoUpdate = false; m.castShadow = false; return m;
}
// hands on the tray, in tray space: the neighbour holds the two short ends, Jo the near long edge
const TAM_GRIP = { L: new THREE.Vector3(0.3, 0.035, -0.25), R: new THREE.Vector3(-0.3, 0.035, -0.25) };
const JO_GRIP = { L: new THREE.Vector3(-0.24, 0.03, 0.28), R: new THREE.Vector3(0.24, 0.03, 0.28) };

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
const _m1 = new THREE.Matrix4();
function lerpMatrix(a, b, t, out) {
  a.decompose(_p, _q, _s); b.decompose(_p2, _q2, _s);
  return out.compose(_p.lerp(_p2, t), _q.slerp(_q2, t), _one);
}

export function createWorld(render, state, bus) {
  const scene = new THREE.Scene();
  scene.add(render.lights);
  const ctx = { lit: new Batch(), flat: new Batch(), rng: state.rng.fork(7), render, state };
  const hot = createHot();
  const sky = buildSky(ctx), city = buildCity(ctx), roof = buildRoof(ctx), hatch = buildHatch(ctx);
  const shelf = buildShelf(ctx), beds = buildBeds(ctx), marlow = buildMarlow(ctx), barrel = buildBarrel(ctx);
  const pots = buildPots(ctx, state);
  const jo = createJo(), tam = createTam(), water = createWater(ctx);
  const tray = makeTray(), bucket = makeBucket(), book = makeBook(), bookShut = makeBookShut();
  tray.visible = false; bucket.visible = false;
  for (const m of [book, bookShut]) { m.visible = false; m.frustumCulled = false; m.material.userData.capLight = 0.4; m.material.needsUpdate = true; }
  const staticLit = ctx.lit.mesh(paint.lit()), staticFlat = ctx.flat.mesh(paint.flat(), { cast: false, receive: false });
  staticLit.frustumCulled = staticFlat.frustumCulled = false;
  scene.add(sky.group, staticFlat, staticLit, roof.section, city.group, hatch.group, shelf.group, beds.group, marlow.group, barrel.group, pots.group,
    jo.group, tam.group, water.group, tray, bucket, book, bookShut);
  for (const g of [jo.group, tam.group]) g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material.userData.capLight = 0.4; o.material.needsUpdate = true; } });
  tray.material.userData.capLight = 0.4; tray.material.needsUpdate = true;
  tray.frustumCulled = bucket.frustumCulled = false;
  state.pots.forEach((p, i) => hot.add(p.id, pots.materials[i]));
  hot.add('barrel', barrel.barrelMaterials); hot.add('chair', barrel.chairMaterials); hot.add('marlow', marlow.materials);
  hot.add('valve', beds.tapMaterial); hot.add('hatch', hatch.stairMaterial); hot.add('sensor', shelf.stakeMaterials[0]); hot.add('city', city.cityMaterials);
  hot.add('tray', tray.material); hot.add('cup', jo.cup.material);

  const v = ANCHORS.valve.pos, fz = -1.9 + 0.5 + 0.06;
  const up = (p, h) => p.clone().add(new THREE.Vector3(0, h, 0));
  const env = {
    // soil(i, out) for pot i; soil(out) for the pot Jo is pouring into now
    soil: (i, out) => (typeof i === 'number' ? pots.soil(i, out) : pots.soil(Math.max(0, Math.min(11, +String(state.jo.target || 'p0').slice(1) || 0)), i)),
    lip: (out) => jo.lip(out),
    barrel: { rim: barrel.rim, centre: barrel.centre, waterY: barrel.waterY },
    waterY: barrel.waterY,
    spout: beds.spout,
    tapHandle: beds.handle.clone(),
    stakeCrate: up(shelf.crateP, 0.3), stakeBean: up(shelf.beanP, 0.3),
    cupAnchor: new THREE.Vector3(ANCHORS.cup.pos.x, ANCHORS.cup.pos.y, ANCHORS.cup.pos.z),
    choiceK: 0, trayHands: null, trayReach: null, bucketHeld: false, bucketWater: null, bookHands: null, carryBook: false, offerAt: null, offerCup: null,
  };
  const lip = new THREE.Vector3(0, 1, 3);
  const M = { tam: new THREE.Matrix4(), jo: new THREE.Matrix4(), tray: new THREE.Matrix4(), tmp: new THREE.Matrix4() };
  const grip = (G, m) => ({ L: G.L.clone().applyMatrix4(m), R: G.R.clone().applyMatrix4(m), az: 0, k: 1 });
  let t = 0, setOut = false, leafFound = false;
  const glide = new Map();                           // tray pots on their way from the tray to the shelf: i -> { from, t, delay }
  const leafAt = new THREE.Vector3(), offerAt = new THREE.Vector3(), offerCup = new THREE.Vector3(), handL = new THREE.Vector3(), bucketAt = new THREE.Vector3(), bucketWater = new THREE.Vector3(), potAt = new THREE.Vector3();
  let cupK = 1, reachK = 0, bookK = 0;                          // 1 the cup is in her hand, 0 it is hooked at her hip; her hands coming up for the tray
  const hip = new THREE.Matrix4().compose(new THREE.Vector3(0.21, -0.03, 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, Math.PI / 2, 0.15)), _one);
  const cupHand = new THREE.Matrix4(), cupHip = new THREE.Matrix4();

  function placeTray(dt) {
    const J = state.jo, T = state.tam, u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0;
    const placed = state.pots[6].present;
    let owner = null;
    if (J.action === 'take') owner = 'take';
    else if (J.action === 'place') owner = 'place';
    else if (J.action === 'give') owner = 'give';
    else if (J.carrying) owner = 'jo';
    else if (T.present && T.hasTray && (state.beat === 'turn' || T.stage === 'climbing' || T.stage === 'leaving' || T.stage === 'top')) owner = 'tam';
    tray.visible = !!owner;
    const nudge = T.nudge || 0;   // the neighbour lifts the tray a little toward her when nobody takes it
    M.tam.copy(tam.fig.rootMatrix).multiply(nudge > 0.001 ? _m1.makeTranslation(0, 1.24 + 0.14 * nudge, 0.5 + 0.07 * nudge) : TAM_HOLD); M.jo.copy(jo.fig.rootMatrix).multiply(JO_HOLD);
    if (owner === 'tam') M.tray.copy(M.tam);
    else if (owner === 'take') lerpMatrix(M.tam, M.jo, smooth(0.3, 0.78, u), M.tray);
    else if (owner === 'give') { M.tmp.copy(M.jo).multiply(_m1.makeTranslation(0, 0.14, 0.06)); lerpMatrix(M.tmp, M.tam, smooth(0.25, 0.7, u), M.tray); }
    else if (owner === 'jo') { M.tray.copy(M.jo); if (placed) M.tray.multiply(_m1.makeTranslation(0, 0.14, 0.06)); }   // empty, it is carried higher, clear of the plant tops
    else if (owner === 'place') {
      // held out over the shelf while the pots go down onto the lower tier, then lifted back, empty, to carry
      const e = smooth(0, 0.35, u) * (1 - smooth(0.7, 1, u)), up = smooth(0.7, 1, u) * 0.14; M.tray.copy(M.jo).multiply(_m1.makeTranslation(0, -0.16 * e + up, 0.1 * e + up * 0.43));
    }
    if (owner) { tray.matrix.copy(M.tray); tray.matrixWorldNeedsUpdate = true; }
    // the six new pots ride in the tray until they are set out, then each hops to its place on the lower tier
    if (owner === 'place' && placed && !setOut) {
      setOut = true;
      for (let i = 6; i < 12; i++) glide.set(i, { from: TRAY_SLOTS[i - 6].clone().applyMatrix4(M.tray), t: 0, delay: (i - 6) * 0.12 });
    }
    if (!placed) setOut = false;
    const ride = owner && !placed;
    for (let i = 6; i < 12; i++) {
      const p = state.pots[i];
      if (ride) { pots.setAt(i, TRAY_SLOTS[i - 6].clone().applyMatrix4(M.tray)); glide.delete(i); continue; }
      const g = glide.get(i);
      if (!g || state.fade < 0.05) { glide.delete(i); pots.setAt(i, null); continue; }
      g.t += dt; if (g.t < g.delay && owner) g.from.copy(TRAY_SLOTS[i - 6]).applyMatrix4(M.tray);
      const k = smooth(0, 0.6, g.t - g.delay);
      potAt.set(p.pos.x, p.pos.y - 0.135, p.pos.z); const at = g.from.clone().lerp(potAt, k); at.y += Math.sin(Math.PI * k) * 0.22;
      if (k >= 1) { glide.delete(i); pots.setAt(i, null); } else pots.setAt(i, at);
    }
    return owner;
  }

  return {
    scene,
    cupLip() { return lip.clone(); },
    // what is actually drawn right now, for tests: a pour that pours nothing, or a hand-off with no tray, is caught here
    // the meshes themselves, for geometric tests (limb continuity, clashes). Never used by the game.
    debug() { return { T: { Raycaster: THREE.Raycaster, Vector3: THREE.Vector3, Matrix4: THREE.Matrix4, Box3: THREE.Box3 }, jo: { fig: jo.fig, cup: jo.cup }, tam: { fig: tam.fig }, props: { roof: staticLit, shelf: shelf.group, beds: beds.group, barrel: barrel.group, hatch: hatch.group, marlow: marlow.group }, held: [jo.cup, jo.hat, tray, bucket, book, bookShut, barrel.cupA, barrel.cupB], scene, tray, chair: barrel.chair, potMeshes: pots.group.children.slice(), lights: render.lights }; },
    facts() { return { jo: jo.group.visible, cup: jo.cup.visible, tam: tam.group.visible, tray: tray.visible, bucket: bucket.visible, book: book.visible, water: water.flowing(),
      pots: pots.group.children.filter((m) => m.visible).length }; },
    update(dt) {
      t += dt;
      const b = beatIndex(state.beat), slit = (b >= beatIndex('n2_more') && b <= beatIndex('choice')) || (state.night >= 4 && state.ending === 'hand');
      sky.update(dt, state); city.update(dt, state); hatch.update(dt, state, slit); beds.update(dt, state); barrel.update(dt, state);
      const J = state.jo, T = state.tam, u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0;
      // root transforms first: the tray and the bucket are placed from them before either pose is made
      jo.frame(state, dt); tam.frame(state, dt);
      const owner = placeTray(dt);
      const ts = tam.tStage();
      bucket.visible = !!(T.present && T.bucket);
      env.bucketHeld = bucket.visible && (T.stage === 'climbing' || ts < 1.45);
      env.choiceK = follow(env.choiceK, state.beat === 'choice' && !state.ending ? 1 : 0, dt, 3);
      // Jo: her hands go to the tray while it is hers, and onto it while it changes hands
      env.trayHands = null;
      if (owner === 'take') env.trayHands = { ...grip(JO_GRIP, M.tray), k: smooth(0, 0.3, u) };
      else if (owner === 'jo') env.trayHands = grip(JO_GRIP, M.tray);
      else if (owner === 'place') env.trayHands = grip(JO_GRIP, M.tray);
      else if (owner === 'give') env.trayHands = { ...grip(JO_GRIP, M.tray), k: 1 - smooth(0.62, 0.85, u) };
      // offered and not yet taken: her hands come up toward the far rim and wait there, open
      reachK = follow(reachK, owner === 'tam' && state.hot.includes('tray') && J.action === 'idle' ? 1 : 0, dt, 2.2);
      env.trayReach = reachK > 0.01 ? { ...grip(JO_GRIP, M.tray), k: reachK } : null;
      bucketWater.copy(BUCKET_DOWN); bucketWater.y += 0.2; env.bucketWater = bucket.visible && !env.bucketHeld ? bucketWater : null;
      // the book: on her knees once she has sat; her hands hold its edges, and the right one lifts across for a page
      bookK = follow(bookK, J.present && J.book ? 1 : 0, dt, 3);
      book.visible = bookK > 0.5;
      if (book.visible) {
        book.matrix.copy(jo.fig.rootMatrix).multiply(J.seat === 'chair' ? BOOK_CHAIR : BOOK_LOCAL); book.matrixWorldNeedsUpdate = true;
        env.bookHands = { ...grip(BOOK_GRIP, book.matrix), k: smooth(0.5, 1, bookK), page: J.page || 0 };
      } else env.bookHands = null;
      env.carryBook = !!(J.present && J.noCup && !book.visible);
      // the leaf she touches: the basil's (for 2A, when it is big enough: it is), a low one on the side toward her chair
      if (J.leaf > 0.001) { if (!leafFound) { pots.soil(1, _p2); _p2.y += 0.22; _p2.z -= 0.12; pots.leafNear(1, _p2, leafAt); leafFound = true; } env.leaf = leafAt; }   // a low leaf on her side of the plant: the arm goes out below her face, clear of the feed line's hoop
      else { env.leaf = null; leafFound = false; }
      // the night after, by hand: where she holds the cup out, between her and the neighbour at the stair head
      if (J.present && T.present && J.offer > 0.001) { offerAt.set(T.pos.x + 0.36, 0.98, T.pos.z - 0.06); env.offerAt = offerAt; } else env.offerAt = null;
      jo.update(state, env, dt, t);
      // the shut book rides in her right hand until she sits and opens it
      bookShut.visible = env.carryBook;
      if (bookShut.visible) { jo.fig.boneMatrix('handR', bookShut.matrix, BOOK_CARRY); bookShut.matrixWorldNeedsUpdate = true; }
      // the cup: in her hand, or hooked at her hip while both hands are on the tray
      cupK = follow(cupK, J.cupHeld !== false ? 1 : 0, dt, 7);
      if (J.present && cupK < 0.999) {
        jo.fig.boneMatrix('pelvis', cupHip, hip); cupHand.copy(jo.cup.matrix);
        lerpMatrix(cupHip, cupHand, cupK, jo.cup.matrix); jo.cup.matrixWorldNeedsUpdate = true;
      }
      jo.cup.visible = !!J.present && !J.noCup;
      jo.lip(lip);
      // the neighbour: hands on the tray while they carry it, and for a moment in the air after it is taken
      env.trayHands = null;
      if (T.present && (owner === 'tam' || owner === 'take' || (owner === 'give' && u > 0.3) || (state.beat === 'turn' && !T.hasTray && ts < 2.4)))
        env.trayHands = grip(TAM_GRIP, owner === 'tam' || owner === 'give' || (owner === 'take' && T.hasTray) ? M.tray : M.tam);
      env.offerCup = T.touch > 0.001 && jo.cup.visible ? offerCup.setFromMatrixPosition(jo.cup.matrix) : null;
      tam.update(state, env, dt, t);
      if (bucket.visible) {
        if (env.bucketHeld) {
          tam.handWorld('R', bucketAt); bucketAt.y -= 0.43;
          const down = T.stage === 'climbing' ? 0 : smooth(0.4, 1.45, ts); bucketAt.lerp(BUCKET_DOWN, down);
        } else bucketAt.copy(BUCKET_DOWN);
        bucket.matrix.makeRotationY(0.4).setPosition(bucketAt); bucket.matrixWorldNeedsUpdate = true;
      }
      // the spare sensor travels in her left hand while she plants it
      const planting = J.action === 'plant' ? Math.max(1e-3, u) : 0;
      if (planting) jo.handWorld('L', handL);
      shelf.update(dt, state, planting, planting ? handL : null);
      pots.update(dt, state); water.update(dt, state, env); hot.update(dt, state);
    },
  };
}
