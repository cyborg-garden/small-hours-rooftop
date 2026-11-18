// OWNER: B (world). Where feet go on the stairs (shared by both people). On the deck the walk is a real clip;
// on the stairs the legs of the real rig are solved onto these targets, so each foot stands on a real tread.
import * as THREE from 'three';
import { RUN, RISE, STAIR_X } from './hatch.js';
import { clamp, smooth } from './kit.js';
const fract = (x) => x - Math.floor(x);
// Each foot holds its tread until the body has passed, then swings to the next but one.
export function stairGait(p, fig, worldX, facing) {
  // climbing, the feet go half a tread further up than the body and the hips ride higher over them: the standing leg
  // is straight and the body upright (round ten: with the feet trailing behind the hips the knees bent and crossed,
  // and the climb looked crouched). Going down is as it was.
  const up = facing > 0, phi = (STAIR_X - worldX) / RUN - (up ? 0.5 : 0), w = new THREE.Vector3();
  for (const [n, f] of [['L', 0], ['R', 1]]) {
    const v = (phi - f) / 2 + 0.25, s = smooth(0.5, 1, fract(v)), q = f + 2 * (Math.floor(v) + s);
    w.set(STAIR_X - q * RUN, -RISE * clamp(q, 0, 13) + Math.sin(Math.PI * s) * 0.075 - fig.root.position.y, 0);
    const fz = (w.x - fig.root.position.x) * facing;        // figure faces +x (facing 1) or -x (facing -1)
    p['f' + n + 'z'] = fz - 0.05; p['f' + n + 'y'] = w.y; p['f' + n + 'p'] = Math.sin(Math.PI * s) * 0.3;
  }
  p.legIK = 1; p.hipY += up ? 0.05 : -0.06; p.toe = 0.06;
}
// How fast a walk clip really travels: the speed of a foot while it is on the ground. Used to tie the clip's
// phase to distance walked, so a planted foot stays where it was put.
export function clipSpeed(fig, name, dur, key = 'cWalk') {
  // (round seventeen: the foot on the ground is the lower of the two, by a centimetre. Read off the lowest point of one
  // foot it caught the bottom of the swing too, once the walk's knee came down, and the walk ran 10 percent off its feet)
  const p = fig.rest(); p.cIdle = 0; p[key] = 1; const z = [], y = [], zr = [], yr = [], N = 60, v = new THREE.Vector3();
  fig.place(0, 0, 0, 0);
  for (let i = 0; i <= N; i++) { fig.time[name] = dur * i / N; fig.solve(p); v.setFromMatrixPosition(fig.bones.foot_l.matrixWorld); z.push(v.z); y.push(v.y); v.setFromMatrixPosition(fig.bones.foot_r.matrixWorld); zr.push(v.z); yr.push(v.y); }
  const sp = []; let strike = 0, zmax = -9;
  for (let i = 0; i < N; i++) {
    if (y[i] < yr[i] - 0.01 && y[i + 1] < yr[i + 1] - 0.01) sp.push((z[i] - z[i + 1]) / (dur / N));
    if (yr[i] < y[i] - 0.01 && yr[i + 1] < y[i + 1] - 0.01) sp.push((zr[i] - zr[i + 1]) / (dur / N));
    if (z[i] > zmax) { zmax = z[i]; strike = i / N; } }
  sp.sort((a, b) => a - b); fig.time[name] = 0;
  return { speed: sp.length ? sp[Math.floor(sp.length / 2)] : 1.4, strike };
}
