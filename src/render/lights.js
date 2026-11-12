// OWNER: A (render). The lighting plan (BIBLE section 4). One cool moon that casts the only shadows, a deep
// sky fill so shade stays indigo, and one warm light that comes up the stairs. Every change is eased: the
// lamp takes about half a second to come or go, a body crossing it takes two.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { HATCH } from '../core/layout.js';

const MOON_HIGH = new THREE.Vector3(6, 11, -5), MOON_LOW = new THREE.Vector3(9, 6.2, -3.5);
const SKY_NIGHT = new THREE.Color('#6F7DB8'), SKY_DAWN = new THREE.Color('#9A8FB4');
const GROUND_NIGHT = new THREE.Color('#2A2F52'), GROUND_DAWN = new THREE.Color('#3A3658');
// seconds: how long the lamp, a body crossing it, the moon and first light take to change
export const TAU = { lamp: 0.5, cross: 0.9, moon: 1.5, dawn: 1.0 };
export const LIGHT = { moon: 2.4, moonLow: 1.9, fill: 1.7, fillDawn: 0.8, stair: 5.2, spill: 9.5, crossing: 0.66, read: 7.0 };

export function createLights(state) {
  const group = new THREE.Group(); group.name = 'lights';
  const moon = new THREE.DirectionalLight(PAL.moonLight, LIGHT.moon);
  moon.position.copy(MOON_HIGH); moon.target.position.set(-1, 0, 1);
  moon.castShadow = true; moon.shadow.bias = -0.0022; moon.shadow.normalBias = 0.16;
  Object.assign(moon.shadow.camera, { left: -11.5, right: 11.5, top: 9.5, bottom: -9.5, near: 1, far: 34 });
  const fill = new THREE.HemisphereLight(SKY_NIGHT.clone(), GROUND_NIGHT.clone(), LIGHT.fill);
  // inside the stairwell: lights the well, the treads and the underside of the lid
  const stair = new THREE.PointLight(PAL.warmLight, LIGHT.stair, 8, 1.4);
  stair.position.set(HATCH.lamp.x, HATCH.lamp.y, HATCH.lamp.z + 0.7);
  // what escapes the hatch mouth: the pool of warm light Jo works in, across the gift shelf
  const spill = new THREE.SpotLight(PAL.warmLight, LIGHT.spill, 7.2, 0.62, 0.85, 1.2);
  spill.position.set(-3.9, 0.7, 4.5); spill.target.position.set(-1.3, 0.45, 3.85);
  // the night after, by sensor: the same stair light, falling across the chair she has carried into it. Steady: it never
  // flickers, it only comes up with the lamp and the lid.
  const read = new THREE.SpotLight(PAL.warmLight, 0, 5.5, 0.5, 0.7, 1.3);
  read.position.set(-3.2, 0.75, 3.95); read.target.position.set(-2.1, 0.7, 3.0); read.visible = false;
  group.add(moon, moon.target, fill, stair, spill, spill.target, read, read.target);

  const cur = { lamp: 1, mouth: 1, cross: 1, low: 0, dawn: 0, read: 0 }; let first = true;
  const ease = (a, b, dt, tau) => a + (b - a) * (1 - Math.exp(-dt / tau));
  const pos = new THREE.Vector3();
  function update(dt, snap = false) {
    const T = state.tam || {};
    // a body on the stairs stands between the lamp and the hatch mouth
    const crossing = T.present && (T.stage === 'climbing' || T.stage === 'leaving') && (T.t ?? 1) > 0.06 && (T.t ?? 1) < 0.9;
    const goal = { lamp: state.lampOn ? 1 : 0, mouth: state.lampOn && state.hatchOpen ? 1 : 0, cross: crossing ? LIGHT.crossing : 1,
      low: state.night === 3 ? 1 : 0, read: state.chairAt && state.lampOn && state.hatchOpen ? 1 : 0, dawn: Math.max(0, Math.min(1, state.sky ? state.sky.dawn : 0)) };
    if (snap || first) Object.assign(cur, goal);
    else {
      cur.lamp = ease(cur.lamp, goal.lamp, dt, TAU.lamp); cur.mouth = ease(cur.mouth, goal.mouth, dt, TAU.lamp);
      cur.cross = ease(cur.cross, goal.cross, dt, TAU.cross); cur.read = ease(cur.read, goal.read, dt, TAU.lamp * 3); cur.low = ease(cur.low, goal.low, dt, TAU.moon); cur.dawn = ease(cur.dawn, goal.dawn, dt, TAU.dawn);
    }
    first = false;
    stair.intensity = LIGHT.stair * cur.lamp;
    spill.intensity = LIGHT.spill * cur.mouth * cur.cross;
    stair.visible = stair.intensity > 0.003; spill.visible = spill.intensity > 0.003;
    if (state.chairAt) read.target.position.set(state.chairAt.x, 0.7, state.chairAt.z);
    read.intensity = LIGHT.read * cur.read; read.visible = !!state.chairAt;   // switched in only on the night it is used, under the cut, so no shader rebuild lands mid-scene
    moon.position.copy(pos.lerpVectors(MOON_HIGH, MOON_LOW, cur.low));
    moon.intensity = LIGHT.moon + (LIGHT.moonLow - LIGHT.moon) * cur.low - 0.5 * cur.dawn * cur.low;
    fill.intensity = LIGHT.fill + LIGHT.fillDawn * cur.dawn;
    fill.color.copy(SKY_NIGHT).lerp(SKY_DAWN, cur.dawn * 0.6); fill.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAWN, cur.dawn * 0.6);
  }
  return {
    group, moon, fill, stair, spill, read, levels: cur, tau: TAU, update,
    setShadow(size) {
      moon.castShadow = size > 0;
      if (size && moon.shadow.mapSize.x !== size) { moon.shadow.mapSize.set(size, size); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
    },
  };
}
