// OWNER: B (world). The sky: a painted dome (vertex colours, repainted only when first light moves), about sixty
// fixed stars as flat flecks, a thin late moon low over the skyline. First light is a rose band in the east.
import * as THREE from 'three';
import { Batch, col, mix, paint, xf, clamp, smooth } from './kit.js';

const EAST = new THREE.Vector3(0.56, 0, -0.83).normalize();
export function buildSky(ctx) {
  const { rng } = ctx, group = new THREE.Group(), R = 185;
  const g = new THREE.SphereGeometry(R, 40, 20), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const mat = paint.flat(); mat.side = THREE.BackSide; mat.depthWrite = false;
  const dome = new THREE.Mesh(g, mat); dome.renderOrder = -10; dome.frustumCulled = false; dome.castShadow = dome.receiveShadow = false; group.add(dome);
  const top = col('skyTop'), low = col('skyLow'), haze = col('haze'), rose = col('rose'), dawnC = col('dawn'), c = new THREE.Color(), d = new THREE.Vector3();
  let painted = -1;
  function repaint(dawn) {
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < n; i++) {
      d.fromBufferAttribute(P, i).normalize(); const t = d.y;
      if (t < 0.02) c.copy(haze); else if (t < 0.16) c.copy(haze).lerp(low, smooth(0.02, 0.16, t)); else c.copy(low).lerp(top, smooth(0.16, 0.7, t));
      if (dawn > 0) {
        const az = clamp(d.x * EAST.x + d.z * EAST.z, 0, 1), band = (1 - smooth(0.0, 0.2 + 0.12 * dawn, t)) * (0.35 + 0.65 * az * az);
        c.lerp(rose, clamp(dawn * 1.25) * band * 0.9); c.lerp(dawnC, clamp(dawn - 0.25) * band * (1 - smooth(0, 0.07, t)) * 0.9);
        c.lerp(low, dawn * 0.25 * smooth(0.1, 0.6, t));
      }
      C.setXYZ(i, c.r, c.g, c.b);
    }
    C.needsUpdate = true; painted = dawn;
  }
  repaint(0);
  // stars: flat four-pointed flecks, low enough to be in frame over the skyline
  const sb = new Batch(), sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.34, 0, 0, 0.34, 0, 0, 0, -1, 0], 3)); sg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); sg.setIndex([0, 1, 2, 1, 3, 2]);
  const stars = new THREE.InstancedMesh(sg, paint.flat2(), 64), o = new THREE.Object3D(), list = [];
  for (let i = 0; i < 64; i++) { const az = rng.range(-1.5, 1.5), alt = 0.035 + Math.pow(rng(), 1.6) * 0.5, s = rng.range(0.35, 0.8) * (rng() < 0.12 ? 1.7 : 1); list.push({ az, alt, s, r: rng() * 3 }); }
  stars.frustumCulled = false; stars.castShadow = false; stars.renderOrder = -9; stars.material.depthWrite = false;
  const starC = col('star'); for (let i = 0; i < 64; i++) stars.setColorAt(i, starC);
  group.add(stars);
  function placeStars(dawn) { list.forEach((q, i) => { const r = R - 8, ca = Math.cos(q.alt); o.position.set(Math.sin(q.az) * ca * r, Math.sin(q.alt) * r + 3, -Math.cos(q.az) * ca * r); o.lookAt(0, 3, 0); o.rotateZ(q.r);
    o.scale.setScalar(q.s * Math.max(0, 1 - dawn * 1.5 - (q.s < 0.5 ? dawn : 0))); o.updateMatrix(); stars.setMatrixAt(i, o.matrix); }); stars.instanceMatrix.needsUpdate = true; }
  placeStars(0);
  // the moon: a thin waning crescent, a few degrees over the skyline, back right
  const outer = [], inner = [], Rm = 2.6;
  for (let k = 0; k <= 14; k++) { const a = -Math.PI / 2 + Math.PI * k / 14; outer.push([Math.cos(a) * Rm, Math.sin(a) * Rm]); inner.push([Math.cos(a) * Rm * 0.52 - 0.02, Math.sin(a) * Rm]); }
  const ms = new THREE.Shape([...outer, ...inner.reverse()].map(([x, y]) => new THREE.Vector2(x, y))), mb = new Batch();
  mb.add(new THREE.ShapeGeometry(ms), 'moon');
  const moon = mb.mesh(paint.flat2(), { cast: false, receive: false }); moon.material.depthWrite = false; moon.renderOrder = -8;
  moon.position.set(47, 20.5, -166); moon.lookAt(0, 3, 0); moon.rotateZ(-0.5); group.add(moon);
  return { group, update(dt, state) { const dawn = clamp(state.sky.dawn || 0); if (Math.abs(dawn - painted) > 0.004) { repaint(dawn); placeStars(dawn); } } };
}
