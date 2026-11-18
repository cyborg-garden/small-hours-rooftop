// OWNER: B (world), wired by the integrator. createWorld(render, state, bus) -> { scene, update(dt), cupLip() }.
// World is a VIEW of state. It never decides anything and never moves Jo. Every model lives in its own file;
// this one builds them, places the things people carry (the tray, the bucket, the stake, the cup) from the
// people's own bones, and hands each figure the few world points its pose needs.
import * as THREE from 'three';
import { Batch, paint, smooth, clamp, follow, lerp } from './kit.js';
import { createHot } from './hot.js';
import { buildSky } from './sky.js';
import { buildCity } from './city.js';
import { buildRoof } from './roof.js';
import { buildHatch } from './hatch.js';
import { buildShelf } from './shelf.js';
import { buildBeds } from './beds.js';
import { buildMarlow } from './marlow.js';
import { buildBarrel, CUP } from './barrel.js';
import { buildPots } from './plants.js';
import { createJo, SEAT_BACK } from './jo.js';
import { assetsPending, createProp } from './person.js';
import { createTam, makeTray, makeBucket, TRAY_SLOTS, BUCKET } from './tam.js';
import { Batch as B2, box as box2, xf as xf2, mix as mix2 } from './kit.js';
import { createWater } from './water.js';
import { beatIndex } from '../core/beats.js';
import { READ, at } from '../core/reading.js';
import { ANCHORS } from '../core/layout.js';

// The tray. The neighbour carries it by its two short ends, held out at the chest; it is placed in their figure space
// and their hands are taken onto it. Once Jo has it, it is the other way round: it lies on her two open hands, wherever
// the carrying clip has them, so it can never float beside her.
const TAM_HOLD = { y: 1.02, z: 0.44 };   // (round ten: lower, at the chest, so the stakes on the pots stay below his face: tools/pose.mjs trayface)
// the bucket, set down on the open deck ahead of the neighbour and to their left, between the two of them and well
// in front of the shelf: the camera (from the open side of the roof) sees where it stands on the boards. Jo kneels to
// it on its far side from the neighbour.
export const BUCKET_DOWN = new THREE.Vector3(-1.82, 0, 2.7);
// the book, the night after by sensor: open on her knees, the spine toward her, tipped up to catch the stair light.
// In figure space (+z in front of her); the hands hold the two outer edges.
const BOOK_LOCAL = new THREE.Matrix4().compose(new THREE.Vector3(0.0, 0.64, 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.85, 0, 0)), new THREE.Vector3(1, 1, 1));
// in the chair she holds it up to read
// in the chair: open in her lap, resting on her thighs halfway to the knees, the far edge tipped up toward her face.
// (Figure space of the seated rig: the hips are 0.31 m behind the root, the knees 0.05 m in front of it, the thighs'
// top at about 0.57 m.) Both hands hold its outer edges, the elbows down at her sides.
const BOOK_CHAIR = new THREE.Matrix4().compose(new THREE.Vector3(0.0, 0.92, 0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0)), new THREE.Vector3(1, 1, 1));
const BOOK_GRIP = { L: new THREE.Vector3(0.199, 0.002, -0.032), R: new THREE.Vector3(-0.112, -0.012, -0.147) };   // (round seventeen, second pass: the left hand round the cover's outer edge, the right under its lower corner, the fingers flat on the back of the boards and the palm against it; found by a search over the wrist and the hand's turn, scored on contact: tools/guide.mjs readgrip)   // (round seventeen: up against the boards at the lower outer corners, the fingers round the edge; they were 4.5 cm under it, the owner: "hardly holding")   // the wrists under the lower edge, a hand in from each corner: both palms are on the boards
// shut, carried in the right hand at her side: hand space (the bone points down the fingers), the spine against the palm
// (round seventeen: the owner, "her hand is hardly holding the book": her fist was pressed flat on the cover. Now the
// spine lies across her palm, the covers either side of her fingers and thumb, the book hanging below her hand, and her
// fingers close round it. Hand space: -y down the fingers, z across the knuckles, the left palm facing -x. Set once the
// book's size is known: bookCarry() below.)
const BOOK_CARRY = new THREE.Matrix4();
// (round seventeen) shut, on her lap: flat on her thighs, the spine to her left (figure space: centred, its middle 12 cm
// behind the root). BOOK_FLIP turns the cut volume shut (its halves folded) to lie as the uncut shut volume did in her hand.
const BOOK_LAP = new THREE.Matrix4().compose(new THREE.Vector3(0.0, 0.64, -0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)), new THREE.Vector3(1, 1, 1));
const BOOK_FLIP = new THREE.Matrix4().makeRotationY(Math.PI);
const BOOK_TIP = 0.2;   // each open half lies 0.2 rad up from flat (tools/assets.mjs TIP)
// the book: one volume of a real encyclopedia set (CREDITS.md), open or shut, painted in the game's colours: a worn red
// cloth board, cream page edges. tools/assets.mjs cuts the open spread out of the real volume.
const bookPaint = (M) => /page/.test(M.name) ? { tint: mix2('paper', 'tag', 0.35) }
  : /cover/.test(M.name) ? { ramp: { dark: mix2('tamCap', 'ink', 0.45), light: mix2('tamCap', 'cedarWarm', 0.35), lo: 0.03, hi: 0.45 } }
  : { ramp: { dark: mix2('tag', 'tray', 0.45), light: mix2('paper', 'tag', 0.3), lo: 0.1, hi: 0.7 } };
function makeRealBook(key) {
  const g = createProp(key, bookPaint); g.matrixAutoUpdate = false;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; o.material.side = THREE.DoubleSide; } });
  g.userData.real = 'book.glb'; return g;
}
export const makeBook = () => makeRealBook('bookOpen');
export const makeBookShut = () => makeRealBook('bookShut');
// hands on the tray, in tray space (+z is the long edge toward Jo): the neighbour holds the two short ends, Jo's open
// palms go under the near long edge
const TAM_GRIP = { L: new THREE.Vector3(0.475, 0.03, -0.2), R: new THREE.Vector3(-0.475, 0.03, -0.2) };   // wrists just outside the two short ends, fingers along them
const JO_PALM = { L: new THREE.Vector3(-0.13, -0.012, 0.24), R: new THREE.Vector3(0.13, -0.012, 0.24) };
// the cup in the neighbour's left hand, once they have taken it: upright, their fingers round its side, the handle away from the palm

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), TUCK = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export const HOOK = { yaw: -2.2, out: 0.09, up: 0.14, tilt: 0.05 };   // the belt hook: direction round her hip (from her front, toward her right: behind her right hip), out from the pelvis, up to the waistband, the cup's lean. Chosen (tools/probe/r12d.mjs) so her arms clear it by 4 cm all through the hand-off and the carry
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
  // the middle of the open spread, in the book's own space: the top of its pages, halfway across and down them
  const bookMid = (() => { const bx = new THREE.Box3(); book.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox); } }); const c = bx.getCenter(new THREE.Vector3()); c.y = bx.max.y; return c; })(), bookPages = new THREE.Vector3();
  tray.visible = false; bucket.visible = false;
  for (const m of [book, bookShut]) { m.visible = false; m.traverse((o) => { if (o.isMesh) { o.material.userData.capLight = 0.4; o.material.needsUpdate = true; } }); }
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
    plantTop: (i) => pots.top(i),
    cupInHand: () => jo.cup.visible && state.jo.cupHeld !== false && !state.jo.cupGiven && !state.jo.noCup,
    barrel: { rim: barrel.rim, centre: barrel.centre, waterY: barrel.waterY },
    waterY: barrel.waterY,
    spout: beds.spout,
    tapHandle: beds.handle.clone(),
    stakeCrate: up(shelf.crateP, 0.3), stakeBean: up(shelf.beanP, 0.3),
    cupAnchor: new THREE.Vector3(ANCHORS.cup.pos.x, ANCHORS.cup.pos.y, ANCHORS.cup.pos.z),
    choiceK: 0, trayHands: null, bucketHeld: false, bucketWater: null, bookHands: null, carryBook: false, offerAt: null, offerCup: null,
  };
  const lip = new THREE.Vector3(0, 1, 3);
  const M = { tam: new THREE.Matrix4(), jo: new THREE.Matrix4(), tray: new THREE.Matrix4(), tmp: new THREE.Matrix4() };
  const grip = (G, m) => ({ L: G.L.clone().applyMatrix4(m), R: G.R.clone().applyMatrix4(m), az: 0, k: 1 });
  let t = 0, leafFound = false, owner = null, sinceFlip = 9;
  const leafAt = new THREE.Vector3(), offerAt = new THREE.Vector3(), offerCup = new THREE.Vector3(), handL = new THREE.Vector3(), bucketAt = new THREE.Vector3(), bucketGrip = new THREE.Vector3(), bucketWater = new THREE.Vector3();
  // the book's halves (round seventeen): the cut volume's right-hand half (from her, book -x) stays; the left (+x) is
  // the cover and pages that fold over it shut and swing open over the spine
  const bookHalves = { fixed: book.children.filter((c) => /L(_|$)/.test(c.userData.part)), move: book.children.filter((c) => /R(_|$)/.test(c.userData.part)) };
  const bookSize = (() => { const bx = new THREE.Box3(); for (const c of bookHalves.fixed) { c.geometry.computeBoundingBox(); bx.union(c.geometry.boundingBox); } return { d: -bx.min.x, t: bx.max.y - bx.min.y }; })();
  { const bx = new THREE.Box3(); bookShut.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox); } });
    const w = bx.max.x - bx.min.x, th = bx.max.y - bx.min.y;   // the shut volume: x across the cover from the spine, y through it, z along the spine
    BOOK_CARRY.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)).setPosition(-(0.022 + th / 2), -(0.045 + w / 2), -0.01); }
  const BOOK_SIDE_R = new THREE.Vector3(-bookSize.d - 0.03, 0.02, -0.07);   // her right wrist beside the shut book's fore-edge on her lap
  const BOOK_TOP_L = new THREE.Vector3(-0.09, bookSize.t + 0.035, -0.06).applyAxisAngle(new THREE.Vector3(0, 0, 1), -(Math.PI - BOOK_TIP));   // her left wrist resting on the cover (in the cover's frame)
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  const _lp = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  // a matrix k of the way to another (place and turn); pre: the other is already in the world
  function lerpM(a, b, k) { a.decompose(_lp[0], _lp[1], _lp[2]); b.decompose(_lp[3], _lp[4], _lp[5]); _lp[0].lerp(_lp[3], k); _lp[1].slerp(_lp[4], k); return a.compose(_lp[0], _lp[1], _lp[2].set(1, 1, 1)); }
  let cupK = 1, bookK = 0;                          // 1 the cup is in her hand, 0 it is hooked at her hip
  // hooked on her belt by its handle while both hands are on the tray (round twelve: it hung in the air beside her hip).
  // In the pelvis frame: the top of the handle goes over the waistband behind her right hip, a little inside the
  // cloth, and the cup hangs from it against her seat. HOOK_* are tools/pose.mjs's numbers too.
  const HOOK_DIR = new THREE.Vector3(Math.sin(HOOK.yaw), 0, Math.cos(HOOK.yaw)), hookLocal = new THREE.Vector3(0, CUP.h - 0.01, -CUP.r - 0.045);
  const hip = new THREE.Matrix4().makeTranslation(HOOK_DIR.x * HOOK.out, HOOK.up, HOOK_DIR.z * HOOK.out)
    .multiply(new THREE.Matrix4().makeRotationY(HOOK.yaw)).multiply(new THREE.Matrix4().makeRotationX(HOOK.tilt)).multiply(new THREE.Matrix4().makeTranslation(-hookLocal.x, -hookLocal.y, -hookLocal.z));
  const cupHand = new THREE.Matrix4(), cupHip = new THREE.Matrix4(), cupHook = new THREE.Vector3();
  const joHands = { L: new THREE.Vector3(), R: new THREE.Vector3(), k: 0 }, tamHands = { L: new THREE.Vector3(), R: new THREE.Vector3(), az: 0, k: 0 };
  const fwd = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), pL = new THREE.Vector3(), pR = new THREE.Vector3(), lastTray = new THREE.Vector3(), slip = new THREE.Vector3();

  // who has the tray, and (while it is the neighbour's) where it is. Returns the owner: 'tam' | 'jo' | null
  function trayOwner(dt) {
    const J = state.jo, T = state.tam, u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0, was = owner;
    owner = J.present && J.carrying ? 'jo' : T.present && T.hasTray ? 'tam' : null;
    tray.visible = !!owner; sinceFlip += dt;
    if (owner === 'tam') {
      // held out at the chest; lifted a little toward her when nobody takes it; brought down and out to her hands when she does
      const nudge = T.nudge || 0, give = J.action === 'take' ? smooth(0, 0.45, u) : 0;
      // (empty, afterwards, it is held where it was: any lower and its ends would pass through the plant tops as they turn to go)
      M.tray.copy(tam.fig.rootMatrix).multiply(_m1.makeTranslation(0, TAM_HOLD.y + (T.stage === 'climbing' ? 0.06 + 0.04 * (1 - smooth(0, 0.08, T.t)) : T.stage === 'out' ? 0.075 * (1 - smooth(-2.45, -2.15, T.pos.x)) : 0)   /* (higher on the stairs, and over the hatch's frame as they step out: tools/clash.mjs) */ + 0.1 * nudge - 0.2 * give, TAM_HOLD.z + 0.05 * nudge + 0.1 * give));
      // going home, the empty tray hangs at their right side by its rim, on end, so it goes down the stairs and in at the
      // door of 4B without cutting the walls; the left hand lets go
      const tuck = 0;
      if (tuck > 0) { const fd = tam.fig.D; TUCK.makeBasis(_x.set(0, 0, 1), _y.set(-1, 0, 0), _z.set(0, -1, 0)).setPosition(-fd.sw - 0.1, fd.wrist - 0.3, 0.06);
        lerpMatrix(_m2.copy(M.tray), _m3.copy(tam.fig.rootMatrix).multiply(TUCK), tuck, M.tray); }
      tray.matrix.copy(M.tray); tray.matrixWorldNeedsUpdate = true; lastTray.setFromMatrixPosition(M.tray);
      const g = grip(TAM_GRIP, M.tray); tamHands.L.copy(g.L); tamHands.R.copy(g.R); tamHands.k = 1; tamHands.kL = 1 - tuck; tamHands.kR = 1;
      if (tuck > 0) tamHands.R.lerp(_p2.set(0, 0.3, 0).applyMatrix4(M.tray), tuck);   // (the right hand on the top rim)
      // her hands: up under the near edge, palms open (the wrist is a palm's length behind the palm)
      fwd.set(0, 0, 1).transformDirection(jo.fig.rootMatrix);
      for (const n of ['L', 'R']) joHands[n].copy(JO_PALM[n]).applyMatrix4(M.tray).addScaledVector(fwd, -0.08);
      joHands.k = J.action === 'take' ? smooth(0.05, 0.5, u) : 0;
    } else if (owner === 'jo') {
      if (was === 'tam') sinceFlip = 0;
      // the moment it is hers: her hands stay where they took it and ease into the carry; the neighbour's let go and fall
      joHands.k = 1 - smooth(0.1, 0.8, sinceFlip); tamHands.k = 1 - smooth(0, 0.7, sinceFlip);
    } else { joHands.k = 0; tamHands.k = Math.max(0, tamHands.k - dt * 2); }
    return owner;
  }
  // the tray on her hands: called once her pose is solved
  function trayOnHands() {
    jo.handWorld('L', pL); jo.handWorld('R', pR); fwd.set(0, 0, 1).transformDirection(jo.fig.rootMatrix);
    X.copy(pR).sub(pL); if (X.lengthSq() < 1e-6) X.set(1, 0, 0).transformDirection(jo.fig.rootMatrix).negate(); X.normalize();
    Z.copy(fwd).negate().addScaledVector(X, fwd.dot(X)).normalize(); Y.crossVectors(Z, X);
    _p.copy(pL).add(pR).multiplyScalar(0.5).addScaledVector(Z, -0.24).addScaledVector(Y, 0.012);
    if (sinceFlip === 0) slip.copy(lastTray).sub(_p);          // no jump at the moment it changes hands
    _p.addScaledVector(slip, 1 - smooth(0, 0.6, sinceFlip));
    M.tray.makeBasis(X, Y, Z).setPosition(_p); tray.matrix.copy(M.tray); tray.matrixWorldNeedsUpdate = true;
  }
  // the six new pots ride in the tray until they are set out on the lower tier (under a fade: see game/arc.js)
  function trayPots() {
    const ride = (owner === 'tam' || owner === 'jo') && !state.pots[6].present;
    for (let i = 6; i < 12; i++) pots.setAt(i, ride ? TRAY_SLOTS[i - 6].clone().applyMatrix4(M.tray) : null);
  }

  return {
    scene,
    cupLip() { return lip.clone(); },
    // what is actually drawn right now, for tests: a pour that pours nothing, or a hand-off with no tray, is caught here
    // the meshes themselves, for geometric tests (limb continuity, clashes). Never used by the game.
    ready() { return assetsPending() === 0; },
    debug() { return { T: { Raycaster: THREE.Raycaster, Vector3: THREE.Vector3, Matrix4: THREE.Matrix4, Box3: THREE.Box3, Quaternion: THREE.Quaternion }, jo: { fig: jo.fig, cup: jo.cup, lip: (o) => jo.lip(o) }, water: { start: (o) => water.start(o), flowing: () => water.flowing() }, tam: { fig: tam.fig, handWorld: (n, o) => tam.handWorld(n, o) }, bucket, book, bucketGrip: BUCKET.grip, props: { roof: staticLit, shelf: shelf.group, beds: beds.group, barrel: barrel.group, hatch: hatch.group, marlow: marlow.group }, held: [jo.cup, jo.hat, tam.cap, shelf.stake.group, tray, bucket, book, bookShut, barrel.cupA, barrel.cupB], scene, tray, chair: barrel.chair, potMeshes: pots.group.children.slice(), lights: render.lights }; },
    facts() { return { jo: jo.group.visible, cup: jo.cup.visible, tam: tam.group.visible, tray: tray.visible, bucket: bucket.visible, book: book.visible, water: water.flowing(),
      pots: pots.group.children.filter((m) => m.visible).length }; },
    update(dt) {
      t += dt;
      const b = beatIndex(state.beat), slit = (b >= beatIndex('n2_more') && b <= beatIndex('choice')) || (state.night >= 4 && state.ending === 'hand');
      sky.update(dt, state); city.update(dt, state); hatch.update(dt, state, slit); beds.update(dt, state); barrel.update(dt, state);
      const J = state.jo, T = state.tam, u = J.actionDur ? clamp(J.actionT / J.actionDur) : 0;
      // root transforms first: the tray and the bucket are placed from them before either pose is made
      jo.frame(state, dt); tam.frame(state, dt);
      trayOwner(dt);
      const ts = tam.tStage(), tamStill = T.stage !== 'climbing' && T.stage !== 'out' && T.stage !== 'back' && T.stage !== 'leaving';
      bucket.visible = !!(T.present && T.bucket);
      env.bucketHeld = bucket.visible && (!tamStill || ts < 1.45);
      // where the handle is asked to be: hanging at their side while they walk, then carried out and down to its place on the deck
      if (env.bucketHeld) {
        const fd = tam.fig.D; bucketGrip.set(fd.sw + 0.12, fd.wrist - 0.05, 0.06).applyMatrix4(tam.fig.rootMatrix);
        if (tamStill) { const k = smooth(0.3, 1.2, ts); _p.copy(BUCKET_DOWN); _p.y += BUCKET.grip + 0.085; bucketGrip.lerp(_p, k); bucketGrip.y += Math.sin(Math.PI * k) * 0.06; }
        env.bucketGrip = bucketGrip;
      } else env.bucketGrip = null;
      env.choiceK = follow(env.choiceK, state.beat === 'choice' && !state.ending ? 1 : 0, dt, 3);
      // Jo: her hands go under the tray while it changes hands, and stay there a moment after it is hers
      env.trayHands = joHands.k > 0.002 ? joHands : null;
      bucketWater.copy(BUCKET_DOWN); bucketWater.y += 0.24; env.bucketWater = bucket.visible && !env.bucketHeld ? bucketWater : null;
      // the book (round seventeen: src/core/reading.js). One book, the real volume cut open at its spine: it comes up shut
      // in her left hand (the cover folded over the pages); as she sits she lays it on her lap, her hand resting on it.
      // Once the hat is down her right hand takes its far edge, both close on it, lift it to reading height, and her
      // left hand swings the cover open over the spine. Nothing about it moves unless a hand has it.
      const rt = J.present && J.noCup && J.seat === 'chair' && J.readT != null ? J.readT : null, BR = READ.book;
      book.visible = !!(J.present && J.noCup); bookShut.visible = false; env.carryBook = book.visible && rt == null; env.bookHands = null;
      if (book.visible) {
        const open = rt == null ? 0 : at(BR.open, rt), lift = rt == null ? 0 : at(BR.lift, rt), lap = rt == null ? 0 : at(READ.lap, rt);
        for (const c of bookHalves.move) c.rotation.z = (Math.PI - BOOK_TIP) * (1 - open);
        for (const c of bookHalves.fixed) c.rotation.z = BOOK_TIP * (1 - open);
        jo.fig.boneMatrix('handL', _m1, BOOK_CARRY).multiply(BOOK_FLIP);                      // in her hand
        _m2.copy(BOOK_LAP); lerpM(_m2, BOOK_CHAIR, lift); _m2.premultiply(jo.fig.rootMatrix);   // on her lap .. up to read
        if (lap < 1) lerpM(_m2, _m1, 1 - lap, true);
        book.matrix.copy(_m2).multiply(_m3.makeTranslation(bookSize.d / 2 * (1 - open), 0, 0)); book.matrixWorldNeedsUpdate = true;
        if (rt != null) {
          // the hands, in the book's frame: the right at the fore-edge (from the side while it lies on her lap, under its
          // lower corner once it is up); the left on the cover, riding with it as it swings open
          const R = _g1.copy(BOOK_SIDE_R).lerp(BOOK_GRIP.R, lift), L = _g2.copy(BOOK_TOP_L).lerp(BOOK_GRIP.L, open);
          L.applyAxisAngle(_z, (Math.PI - BOOK_TIP) * (1 - open));
          const grab = at(BR.grip, rt);
          env.bookHands = { L: L.applyMatrix4(book.matrix), R: R.applyMatrix4(book.matrix), k: open, page: J.page || 0, pages: bookPages.copy(bookMid).applyMatrix4(book.matrix),
            kL: lap, kR: at(BR.reach, rt), tiltL: lerp(0.15, 0.16, open), tiltR: lerp(-0.1, -0.47, lift), curlL: lerp(0.3, 0.74, open) + 0.25 * grab * (1 - open), curlR: lerp(0.3, 0.95, grab),
            rollL: lerp(1.35, -0.87, open), rollR: lerp(0.15, 1.5, lift), azL: lerp(0, -1.04, open), azR: lerp(0, -0.05, lift), thL: lerp(lerp(0.2, 0.6, grab), 0.12, open), thR: lerp(0.2, 0.93, grab) };
        }
      }
      // the leaf she touches: the basil's (for 2A, when it is big enough: it is), a low one on the side toward her chair
      if (J.leaf > 0.001) { if (!leafFound) { pots.soil(1, _p2); _p2.y += 0.24; _p2.z -= 0.14; _p2.x -= 0.05; pots.leafNear(1, _p2, leafAt); leafFound = true; } env.leaf = leafAt; }   // a low leaf on her side of the plant: the arm goes out below her face, clear of the feed line's hoop
      else { env.leaf = null; leafFound = false; }
      // the night after, by hand: where she holds the cup out, between her and the neighbour
      if (J.present && T.present && J.offer > 0.001) { offerAt.set(T.pos.x + (J.pos.x - T.pos.x) * 0.52, 1.1, T.pos.z + (J.pos.z - T.pos.z) * 0.52); env.offerAt = offerAt; } else env.offerAt = null;   // (round twelve: halfway between them, at her chest)
      if (J.present && J.action === 'hang') { jo.fig.boneMatrix('pelvis', cupHip, hip); env.cupHook = cupHook.setFromMatrixPosition(cupHip); } else env.cupHook = null;   // where the cup hangs, for her hand to take it there
      jo.update(state, env, dt, t);
      if (owner === 'jo') trayOnHands();
      trayPots();
      // (the shut book rides in her left hand: the same book, above; bookShut is no longer drawn)
      if (env.carryBook) { jo.fig.boneMatrix('handL', _m1, BOOK_CARRY).multiply(BOOK_FLIP).multiply(_m3.makeTranslation(bookSize.d / 2, 0, 0)); book.matrix.copy(_m1); book.matrixWorldNeedsUpdate = true; }
      // the cup: in her hand, or hooked at her hip while both hands are on the tray
      cupK = follow(cupK, J.cupHeld !== false ? 1 : 0, dt, 12);
      if (J.present && cupK < 0.999) {
        jo.fig.boneMatrix('pelvis', cupHip, hip); cupHand.copy(jo.cup.matrix);
        lerpMatrix(cupHip, cupHand, cupK, jo.cup.matrix); jo.cup.matrixWorldNeedsUpdate = true;
      }
      jo.cup.visible = !!J.present && !J.noCup;
      jo.lip(lip);
      // the neighbour: hands on the tray while they carry it; they let go once it is hers
      env.trayHands = T.present && tamHands.k > 0.002 ? tamHands : null;
      env.offerCup = (T.touch > 0.001 || T.hasCup) && jo.cup.visible && !(J.cupGiven > 0.999) ? offerCup.setFromMatrixPosition(jo.cup.matrix) : null;
      tam.update(state, env, dt, t);
      // the cup, once given, is in their left hand
      if (bucket.visible) {
        // held, the bucket hangs from the real hand (never beside it); for the last moment it is eased onto its place on the deck
        if (env.bucketHeld) { tam.handWorld('L', bucketAt); bucketAt.y -= BUCKET.grip; if (tamStill) bucketAt.lerp(BUCKET_DOWN, smooth(1.2, 1.45, ts)); }
        else bucketAt.copy(BUCKET_DOWN);
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
