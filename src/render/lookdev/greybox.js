// LOOK-DEV FIXTURE (render). A frozen copy of the director's grey-box roof, so the look can be judged
// against a scene that does not change while the world is being built. Not part of the game bundle.
// SKELETON: a lit grey-box of the whole roof at the frozen layout numbers. Every model here is a
// placeholder to be replaced by the real one in its own file (see BIBLE.md section 7). The contract
// that must survive: world is a VIEW of state. It never decides anything and never moves Jo.
import * as THREE from 'three';
import { gouache } from '../materials.js';
import { PAL } from '../../core/palette.js';
import { ROOF, HATCH, SHELF, BEDS, BARREL, TANK, ANCHORS, stairPoint } from '../../core/layout.js';

const box = (w, h, d, mat, x, y, z, o = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true; return m;
};
const cyl = (rt, rb, h, mat, x, y, z, seg = 14) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
};
// a box whose top is deck, front is the cut section, and the rest is shade
const block = (x0, x1, z0, z1, y0, y1) => {
  const mats = [gouache('parapetShade'), gouache('parapetShade'), gouache('deck'), gouache('section', { flat: 1 }), gouache('section', { flat: 1 }), gouache('parapetShade')];
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mats);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = true; return m;
};

function buildSky(scene, rng) {
  const g = new THREE.SphereGeometry(180, 24, 16), col = [];
  const top = new THREE.Color(PAL.skyTop), low = new THREE.Color(PAL.skyLow), haze = new THREE.Color(PAL.haze), c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const t = THREE.MathUtils.clamp(g.attributes.position.getY(i) / 180, -0.1, 1);
    if (t < 0.12) c.copy(haze).lerp(low, Math.max(0, t) / 0.12); else c.copy(low).lerp(top, Math.min(1, (t - 0.12) / 0.5));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10; scene.add(dome);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(170, 170, 26, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: PAL.rose, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  band.position.y = 6; band.renderOrder = -9; scene.add(band);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), gouache('moon', { flat: 1 }));
  moon.position.set(52, 62, -150); moon.lookAt(0, 0, 0); scene.add(moon);
  return { band };
}

function buildCity(scene, rng) {
  // The roof looks DOWN on most of the city. Three flat layers, far to near, darker as they come closer.
  const layers = [['cityFar', -95, 26, 7], ['cityMid', -55, 22, 5], ['cityNear', -24, 16, 2]];
  const wins = [];
  for (const [key, z, n, topBase] of layers) {
    for (let i = 0; i < n; i++) {
      const w = rng.range(4, 11) * (-z / 40), x = (i - n / 2) * (-z / 6.2) + rng.range(-2, 2);
      const top = topBase + rng.range(-7, 3) * (-z / 50), h = 60;
      scene.add(box(w, h, 6, gouache(key, { flat: 1 }), x, top - h / 2, z, { cast: false, receive: false }));
      const rows = Math.floor(rng.range(2, 6)), cols = Math.max(2, Math.floor(w / (-z / 22)));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (rng() < 0.16)
        wins.push({ x: x - w / 2 + (c + 0.5) * (w / cols), y: top - 1.2 - r * (-z / 16), z: z + 3.05, s: -z / 60, warm: rng() < 0.7 });
    }
  }
  const mk = (list, key) => {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.3), gouache(key, { flat: 1 }), list.length), d = new THREE.Object3D();
    list.forEach((q, i) => { d.position.set(q.x, q.y, q.z); d.scale.setScalar(q.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    scene.add(im); return im;
  };
  mk(wins.filter((q) => q.warm), 'winWarm'); mk(wins.filter((q) => !q.warm), 'winCool');
}

function buildRoof(scene) {
  const g = new THREE.Group(), R = ROOF, H = HATCH, base = -7;
  g.add(block(R.x0, R.x1, R.z0, H.z0, base, 0), block(H.x1, R.x1, H.z0, R.z1, base, 0),
    block(R.x0, H.x0, H.z0, R.z1, base, 0), block(H.x0, H.x1, H.z0, R.z1, base, -H.depth));
  // parapet: back and both sides. The front is cut away.
  const p = gouache('parapet');
  g.add(box(R.x1 - R.x0, R.parapetH, R.parapetT, p, 0, R.parapetH / 2, R.z0 + R.parapetT / 2),
    box(R.parapetT, R.parapetH, R.z1 - R.z0, p, R.x0 + R.parapetT / 2, R.parapetH / 2, 0),
    box(R.parapetT, R.parapetH, R.z1 - R.z0, p, R.x1 - R.parapetT / 2, R.parapetH / 2, 0));
  // stairwell: warm back wall, steps going DOWN to the left, the lamp, the kerb, the lid tilted open
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.depth), gouache('stairWall'));
  wall.position.set((H.x0 + H.x1) / 2, -H.depth / 2, H.z0 + 0.01); wall.receiveShadow = true; g.add(wall);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(H.z1 - H.z0, H.depth), gouache('stairWall'));
  side.rotation.y = Math.PI / 2; side.position.set(H.x0 + 0.01, -H.depth / 2, (H.z0 + H.z1) / 2); g.add(side);
  const rise = H.depth / H.steps, run = (H.x1 - H.x0 - 0.5) / H.steps;
  for (let i = 0; i < H.steps; i++) {
    const top = -(i + 1) * rise, x = H.x1 - (i + 0.5) * run;
    g.add(box(run, H.depth + top, H.z1 - H.z0, gouache('stairTread'), x, (top - H.depth) / 2, (H.z0 + H.z1) / 2));
  }
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), gouache('warm', { flat: 1, unique: 1 }));
  lamp.position.set(H.lamp.x, H.lamp.y, H.z0 + 0.03); g.add(lamp);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), gouache('#E3A565', { flat: 1, unique: 1 }));
  halo.position.set(H.lamp.x, H.lamp.y, H.z0 + 0.02); g.add(halo);
  g.add(box(H.x1 - H.x0 + 0.3, H.kerb, 0.15, gouache('parapet'), (H.x0 + H.x1) / 2, H.kerb / 2, H.z0 - 0.075),
    box(0.15, H.kerb, H.z1 - H.z0, gouache('parapet'), H.x0 - 0.075, H.kerb / 2, (H.z0 + H.z1) / 2));
  const lid = new THREE.Group(); lid.position.set((H.x0 + H.x1) / 2, H.kerb, H.z0 - 0.1);
  const board = box(H.x1 - H.x0, 0.07, H.z1 - H.z0, gouache('cedarWarm'), 0, 0, (H.z1 - H.z0) / 2); lid.add(board);
  g.add(lid); scene.add(g);
  return { lid, lamp, halo };
}

function buildBeds(scene, rng) {
  const dots = [];
  for (const b of BEDS) {
    scene.add(box(b.w, b.h, b.d, gouache('cedar'), b.x, b.h / 2, b.z), box(b.w - 0.16, 0.04, b.d - 0.16, gouache('soil'), b.x, b.h + 0.01, b.z));
    for (let i = 0; i < 9; i++) {
      const s = rng.range(0.2, 0.34), m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), gouache(rng.pick(['leaf', 'leaf', 'leafLight', 'leafDark'])));
      m.position.set(b.x - b.w / 2 + 0.3 + i * ((b.w - 0.6) / 8), b.h + s * 0.7, b.z + rng.range(-0.22, 0.22)); m.scale.y = rng.range(0.7, 1.2);
      m.rotation.set(rng() * 3, rng() * 3, 0); m.castShadow = true; scene.add(m);
    }
    scene.add(box(b.w, 0.03, 0.03, gouache('barrelBand'), b.x, b.h + 0.75, b.z)); // the mist line
    for (const sx of [-1, 1]) scene.add(box(0.03, 0.75, 0.03, gouache('barrelBand'), b.x + sx * (b.w / 2 - 0.05), b.h + 0.37, b.z));
    scene.add(box(0.04, 0.5, 0.04, gouache('marlowBox'), b.x + b.w / 2 - 0.3, b.h + 0.25, b.z + 0.38));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), gouache('marlowDim', { flat: 1, unique: 1 }));
    dot.position.set(b.x + b.w / 2 - 0.3, b.h + 0.53, b.z + 0.38); scene.add(dot); dots.push(dot);
  }
  const v = ANCHORS.valve.pos; scene.add(cyl(0.05, 0.05, 0.16, gouache('copper'), v.x, v.y, v.z + 0.06));
  const m = ANCHORS.marlow.pos;
  scene.add(box(0.07, m.y, 0.07, gouache('barrelBand'), m.x, m.y / 2, m.z), box(0.42, 0.52, 0.2, gouache('marlowBox'), m.x, m.y, m.z));
  const slit = box(0.24, 0.05, 0.02, gouache('marlow', { flat: 1 }), m.x, m.y + 0.1, m.z + 0.11, { cast: false }); scene.add(slit);
  return { dots };
}

function buildProps(scene) {
  const B = BARREL, T = TANK;
  scene.add(box(1.0, B.stand, 1.0, gouache('parapetShade'), B.x, B.stand / 2, B.z), cyl(B.r, B.r * 0.92, B.h, gouache('barrel'), B.x, B.stand + B.h / 2, B.z, 18));
  for (const y of [0.25, 0.85]) scene.add(cyl(B.r + 0.015, B.r + 0.015, 0.06, gouache('barrelBand'), B.x, B.stand + y, B.z, 18));
  scene.add(cyl(T.r, T.r, T.h, gouache('tank'), T.x, T.legs + T.h / 2, T.z, 16));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) scene.add(box(0.08, T.legs, 0.08, gouache('barrelBand'), T.x + dx * 0.55, T.legs / 2, T.z + dz * 0.55));
  // gift shelf: two planks, stepped
  const S = SHELF, w = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2;
  scene.add(box(w, 0.05, S.depth, gouache('cedarWarm'), cx, S.upper.y, S.upper.z), box(w, 0.05, S.depth, gouache('cedarWarm'), cx, S.lower.y, S.lower.z));
  for (const x of [S.x0 + 0.1, S.x1 - 0.1]) scene.add(box(0.06, S.upper.y, 0.06, gouache('cedar'), x, S.upper.y / 2, S.upper.z - 0.1), box(0.06, S.lower.y, 0.06, gouache('cedar'), x, S.lower.y / 2, S.lower.z + 0.1));
  // the spare sensor, still in its crate at the end of the shelf
  const s = ANCHORS.sensor.pos;
  scene.add(box(0.36, 0.2, 0.3, gouache('cedar'), s.x, 0.1, s.z));
  const stake = new THREE.Group(); stake.add(box(0.035, 0.42, 0.035, gouache('marlowBox'), 0, 0.21, 0));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gouache('amber', { flat: 1, unique: 1 })); dot.position.y = 0.45; stake.add(dot);
  stake.position.set(s.x, 0.12, s.z); stake.rotation.z = 0.5; scene.add(stake);
  const c = ANCHORS.chair.pos; scene.add(box(0.5, 0.05, 0.5, gouache('tamTrousers'), c.x, 0.45, c.z), box(0.5, 0.55, 0.05, gouache('tamTrousers'), c.x, 0.75, c.z - 0.25));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) scene.add(box(0.04, 0.45, 0.04, gouache('barrelBand'), c.x + dx * 0.22, 0.225, c.z + dz * 0.22));
  return { stake, stakeDot: dot };
}

function buildPots(scene, state) {
  return state.pots.map((p) => {
    const g = new THREE.Group(); g.position.set(p.pos.x, p.pos.y - 0.135, p.pos.z);
    g.add(cyl(0.13, 0.09, 0.2, gouache('pot'), 0, 0.1, 0, 12));
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.115, 12), gouache('soil', { unique: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.19; g.add(soil);
    const stem = box(0.02, 0.2, 0.02, gouache('stem'), 0, 0.3, 0); g.add(stem);
    const leaves = [];
    for (let k = 0; k < 3; k++) {
      const piv = new THREE.Group(); piv.position.y = 0.36 + k * 0.03; piv.rotation.y = k * 2.1 + p.index;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5), gouache('giftLeaf', { unique: 1 }));
      leaf.scale.set(0.55, 0.12, 1); leaf.position.z = 0.1; leaf.castShadow = true; piv.add(leaf); g.add(piv); leaves.push({ piv, leaf });
    }
    const tag = box(0.07, 0.1, 0.008, gouache('tag'), 0.1, 0.24, 0.07, { cast: false }); tag.rotation.z = -0.2; g.add(tag);
    const plant = new THREE.Group(); plant.position.y = 0.19; [stem, ...leaves.map((l) => l.piv)].forEach((o) => { o.position.y -= 0.19; plant.add(o); }); g.add(plant);
    scene.add(g); return { g, soil, leaves, plant };
  });
}

// One figure rig for both people. Rigid parts in a hierarchy, posed on the CPU (never in a vertex shader:
// the ink pass re-renders the scene with another material and must see the same pose).
function buildFigure(c) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-0.1, 0.82, 0); legR.position.set(0.1, 0.82, 0);
  legL.add(box(0.15, 0.82, 0.17, gouache(c.trousers), 0, -0.41, 0)); legR.add(box(0.15, 0.82, 0.17, gouache(c.trousers), 0, -0.41, 0));
  const torso = new THREE.Group(); torso.position.y = 0.82;
  torso.add(cyl(0.17, 0.22, 0.62, gouache(c.coat), 0, 0.31, 0, 10));
  const head = new THREE.Group(); head.position.y = 0.74;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), gouache(c.skin)));
  if (c.hat === 'brim') head.add(cyl(0.34, 0.34, 0.025, gouache(c.hatCol), 0, 0.08, 0, 18), cyl(0.11, 0.14, 0.12, gouache(c.hatCol), 0, 0.15, 0, 12));
  else head.add(cyl(0.118, 0.122, 0.1, gouache(c.hatCol), 0, 0.07, 0, 12));
  const arm = (sx) => { const a = new THREE.Group(); a.position.set(sx * 0.22, 0.56, 0); a.add(box(0.09, 0.56, 0.1, gouache(c.coat), 0, -0.28, 0)); return a; };
  const armL = arm(-1), armR = arm(1);
  const hand = new THREE.Group(); hand.position.y = -0.58; armR.add(hand);
  torso.add(head, armL, armR); body.add(legL, legR, torso);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, legL, legR, torso, head, armL, armR, hand };
}

export function createWorld(render, state, bus) {
  const scene = new THREE.Scene();
  const rng = state.rng.fork(7);
  scene.add(render.lights);
  const sky = buildSky(scene, rng); buildCity(scene, rng);
  const roof = buildRoof(scene), beds = buildBeds(scene, rng), props = buildProps(scene), pots = buildPots(scene, state);

  const jo = buildFigure({ trousers: 'joTrousers', coat: 'joJacket', skin: 'joSkin', hat: 'brim', hatCol: 'joHat' });
  const cup = new THREE.Group(); cup.add(cyl(0.065, 0.05, 0.11, gouache('copper'), 0, -0.02, 0.05, 10)); jo.hand.add(cup);
  const lip = new THREE.Object3D(); lip.position.set(0, 0.04, 0.1); cup.add(lip);
  const tam = buildFigure({ trousers: 'tamTrousers', coat: 'tamCoat', skin: 'tamSkin', hat: 'cap', hatCol: 'tamCap' });
  const tray = box(0.75, 0.05, 0.4, gouache('tray'), 0, 1.02, 0.36); tam.root.add(tray);
  scene.add(jo.root, tam.root);
  const bucket = cyl(0.17, 0.13, 0.26, gouache('barrel'), 0.3, 0.62, 0.12, 12); tam.root.add(bucket);
  const jar = cyl(0.07, 0.07, 0.16, gouache('rose'), ANCHORS.chair.pos.x, 0.56, ANCHORS.chair.pos.z, 10); scene.add(jar);
  const seal = box(0.09, 0.12, 0.01, gouache('tag'), ANCHORS.valve.pos.x, ANCHORS.valve.pos.y - 0.02, ANCHORS.valve.pos.z + 0.15, { cast: false }); scene.add(seal);
  const cup2 = cyl(0.065, 0.05, 0.11, gouache('copper'), BARREL.x - 0.5, BARREL.stand + BARREL.h + 0.02, BARREL.z + 0.2, 10); scene.add(cup2);

  // water: placeholder arc of beads. B replaces with ribbons and splashes in water.js.
  const N = 36, beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 5), gouache('waterLit', { flat: 1 }), N), d = new THREE.Object3D();
  beads.frustumCulled = false; scene.add(beads);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const colDry = new THREE.Color(PAL.giftLeafDry), colUp = new THREE.Color(PAL.giftLeaf), soilDry = new THREE.Color(PAL.soil), soilWet = new THREE.Color(PAL.soilWet);
  const dotOn = new THREE.Color(PAL.marlow), dotOff = new THREE.Color(PAL.marlowDim);

  function poseFigure(f, o, t) {
    f.root.visible = o.present; if (!o.present) return;
    f.root.position.set(o.pos.x, o.y, o.pos.z); f.root.rotation.y = o.heading;
    if (o.pos.x < -2.8 && o.pos.x > -6.2 && o.y > -0.02) o = { ...o, y: 0 };
    const walking = o.action === 'walk' || o.action === 'climb' || o.action === 'descend' || o.action === 'carry';
    const ph = (o.walked || 0) * 4.4, sw = walking ? Math.sin(ph) * 0.5 : 0;
    f.legL.rotation.x = sw; f.legR.rotation.x = -sw; f.armL.rotation.x = -sw * 0.6;
    f.body.position.y = walking ? Math.abs(Math.cos(ph)) * 0.03 : state.reducedMotion ? 0 : Math.sin(t * 0.9 + (f === tam ? 1 : 0)) * 0.006;
    f.torso.rotation.x = 0; f.armR.rotation.x = sw * 0.3; f.armR.rotation.z = 0; f.hand.rotation.x = 0;
  }
  return {
    scene,
    cupLip() { return lip.getWorldPosition(new THREE.Vector3()); },
    update(dt) {
      const t = state.time, J = state.jo, T = state.tam, k = 1 - Math.exp(-dt * 2.2);
      state.pots.forEach((p, i) => {
        const v = pots[i]; v.g.visible = p.present;
        p.lift += ((p.watered ? 1 : 0) - p.lift) * k; p.wetShown += (p.wet - p.wetShown) * k;
        v.leaves.forEach(({ piv, leaf }, n) => { piv.rotation.x = THREE.MathUtils.lerp(1.25, -0.35 - n * 0.12, p.lift); leaf.material.color.copy(colDry).lerp(colUp, p.lift); });
        v.soil.material.color.copy(soilDry).lerp(soilWet, p.wetShown);
        v.plant.scale.setScalar((p.tray ? 0.8 : 1) * (1 + p.growth * 0.24));
      });
      beds.dots.forEach((dot, i) => dot.material.color.copy(state.marlow.beds[i] ? dotOn : dotOff));
      props.stakeDot.material.color.set(state.marlow.shelfSensor ? PAL.marlow : state.stakeAsProp ? PAL.barrelBand : PAL.amber);
      if (state.marlow.shelfSensor) { props.stake.rotation.z = 0; props.stake.position.set(-1.1, SHELF.upper.y, SHELF.upper.z - 0.12); }
      else if (state.stakeAsProp) { props.stake.rotation.z = 0; props.stake.position.set(state.pots[0].pos.x + 0.06, SHELF.upper.y + 0.1, SHELF.upper.z); }
      roof.lid.rotation.x = state.hatchOpen ? -1.75 : 0;
      roof.lamp.visible = roof.halo.visible = state.lampOn;
      sky.band.material.opacity = state.sky.dawn * 0.55;
      cup2.visible = state.secondCup && !T.cup;
      poseFigure(jo, J, t); poseFigure(tam, { ...T, pos: T.pos || { x: 0, z: 0 }, y: T.y || 0, action: T.stage === 'climbing' ? 'climb' : T.stage === 'leaving' ? 'descend' : 'idle', walked: T.walked }, t);
      tray.visible = T.hasTray; cup.visible = J.cupHeld; bucket.visible = !!T.bucket; jar.visible = state.night >= 3; seal.visible = state.valve.sealed;
      if (T.hasTray && T.present) { tam.armL.rotation.x = tam.armR.rotation.x = -1.25; }
      // Jo's one pouring pose: lean, arm out, cup tipped
      const pouring = J.action === 'pour' || J.action === 'pourEmpty', u = J.actionDur ? J.actionT / J.actionDur : 0;
      const e = pouring || J.action === 'scoop' ? Math.sin(Math.min(1, u * 3) * Math.PI / 2) * Math.sin(Math.min(1, (1 - u) * 4) * Math.PI / 2) : 0;
      if (pouring) { jo.torso.rotation.x = 0.28 * e; jo.armR.rotation.x = -1.35 * e; jo.hand.rotation.x = 1.5 * e; }
      if (J.action === 'scoop') { jo.torso.rotation.x = 0.4 * e; jo.armR.rotation.x = -0.9 * e; }
      if (J.action === 'sit') { jo.legL.rotation.x = jo.legR.rotation.x = -1.4; jo.body.position.y = -0.42; }
      if (J.carrying) { jo.armL.rotation.x = jo.armR.rotation.x = -1.25; }
      const flow = J.action === 'pour' && u > 0.18 && u < 0.82;
      beads.visible = flow;
      if (flow) {
        const tp = state.pots.find((p) => p.id === J.target); jo.root.updateWorldMatrix(true, true); lip.getWorldPosition(a);
        b.set(tp.pos.x, tp.pos.y + 0.05, tp.pos.z);
        for (let i = 0; i < N; i++) {
          const q = (t * 1.7 + i / N) % 1;
          d.position.lerpVectors(a, b, q); d.position.y += Math.sin(q * Math.PI) * 0.22 - q * q * 0.1; d.scale.setScalar(0.7 + 0.6 * ((i * 7) % 5) / 5);
          d.updateMatrix(); beads.setMatrixAt(i, d.matrix);
        }
        beads.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
