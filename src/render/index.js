// OWNER: A (render). createRender(canvas, state, bus) -> the contract in BIBLE.md section 7.
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { createPost } from './post.js';
import { createRig } from './rig.js';
import { createLights } from './lights.js';
import { tier, pixelRatio, createWatch } from './quality.js';
export { gouache } from './materials.js';

export function createRender(canvas, state, bus) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setClearColor(0x171925, 1);
  const post = createPost(renderer, state.seed);
  const rig = createRig(state);
  const L = createLights(state);

  let w = 2, h = 2, lost = false;
  const watch = createWatch(state, (q) => setQuality(q));
  // if the browser takes the GPU away, stop drawing until it is back: three rebuilds its programs on restore
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; watch.hold(60); });
  function applySize() {
    const t = tier(state.quality), dpr = pixelRatio(state.quality, w, h, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    post.setOptions({ rich: t.rich });
    post.setSize(Math.max(2, Math.round(w * dpr)), Math.max(2, Math.round(h * dpr)));
    rig.resize(w, h); watch.hold(45);
  }
  function setQuality(n, lock) {
    const q = Math.max(0, Math.min(3, n | 0)), changed = q !== state.quality;
    state.quality = q; if (lock !== undefined) state.qualityLocked = !!lock;
    L.setShadow(tier(q).shadow); applySize();
    if (changed) bus.emit(EV.QUALITY, { quality: q });
  }
  function resize() {
    w = Math.max(2, canvas.clientWidth || window.innerWidth); h = Math.max(2, canvas.clientHeight || window.innerHeight);
    state.viewport.w = w; state.viewport.h = h; state.viewport.portrait = h > w * 1.05;
    applySize(); rig.update(0, true);
  }
  const v = new THREE.Vector3();
  L.setShadow(tier(state.quality).shadow); resize();
  window.addEventListener('resize', resize);
  return {
    renderer, camera: rig.camera, lights: L.group, lighting: L, post, rig, watch, resize, setQuality,
    update(dt) {
      post.uniforms.uDawn.value = state.sky ? state.sky.dawn : 0;
      L.update(dt);
      rig.update(dt);
    },
    get lost() { return lost; },
    // the lost flag can lag the loss itself by a frame: ask the context too, so nothing compiles against a dead GPU
    frame(scene, ms) { if (lost || renderer.getContext().isContextLost()) return; post.render(scene, rig.camera, rig.anchor); if (ms) watch.feed(ms); },
    // a cut. The camera always jumps; the lights jump only if the sheet is dark (a cut under a fade), so a lamp never pops in view
    snap() { rig.update(0, true); L.update(0, post.uniforms.uFade.value < 0.06); },
    setFade(f) { post.uniforms.uFade.value = Math.max(0, Math.min(1, f)); },
    // world position -> CSS pixels. Game uses this for picking, labels and edge arrows.
    project(p) {
      v.set(p.x, p.y, p.z).project(rig.camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1, on: v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    },
    // how many CSS pixels one metre covers at this world point (for tap radii)
    pxPerMetre(p) {
      const d = v.set(p.x, p.y, p.z).distanceTo(rig.camera.position);
      return h / (2 * Math.tan((rig.camera.fov * Math.PI) / 360) * d);
    },
  };
}
