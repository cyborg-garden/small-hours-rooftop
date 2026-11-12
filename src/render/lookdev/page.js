// LOOK-DEV (render). A page of test scenes for judging the look without the game. Not part of the game bundle.
// Built and photographed by shoot.mjs. The world is injected by the bundler as "lookdev-world": either the
// frozen grey-box fixture in this folder or the live world module.
import { createBus } from '../../core/bus.js';
import { createState } from '../../core/state.js';
import { ANCHORS, JO_START, TAM_TOP, stairPoint } from '../../core/layout.js';
import { createRender, gouache } from '../index.js';
import { createWorld } from 'lookdev-world';

const canvas = document.getElementById('c');
const bus = createBus(), state = createState(340);
state.begun = true; state.auto = false;
const render = createRender(canvas, state, bus);
const world = createWorld(render, state, bus);
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

const pot = (i) => state.pots[i];
function base(night, watered = 0, present = 6) {
  Object.assign(state, { night, beat: 'n1_water', hatchOpen: true, lampOn: true, secondCup: false, stakeAsProp: false });
  state.sky.dawn = 0; state.marlow.beds = [true, true, true]; state.marlow.misting = false; state.marlow.shelfSensor = false;
  state.valve.sealed = false; state.barrel.level = night === 3 ? 0.08 : 0.8;
  state.pots.forEach((p, i) => { p.present = i < present; p.watered = i < watered; p.wet = p.watered ? 1 : 0; p.growth = Math.max(0, Math.min(2, night - 1)); });
  Object.assign(state.jo, { present: false, action: 'idle', actionT: 0, actionDur: 0, target: null, cup: 2, cupHeld: true, carrying: false, y: 0, heading: 0, walked: 0 });
  state.jo.pos.x = JO_START.x; state.jo.pos.z = JO_START.z;
  Object.assign(state.tam, { present: false, stage: 'below', t: 1, hasTray: false, bucket: false, y: -2.6 });
  state.hot = [];
}
const jo = (o) => { Object.assign(state.jo, { present: true }, o); if (o.at) { state.jo.pos.x = o.at.x; state.jo.pos.z = o.at.z; state.jo.heading = o.at.heading ?? 0; } };
const tamAt = (t, o = {}) => { const p = stairPoint(t); Object.assign(state.tam, { present: true, t, y: p.y, heading: Math.PI / 2 }, o); state.tam.pos = { x: p.x, z: p.z }; };
const POSES = {
  // the kitchen beds get their water; the gift shelf does not. Nobody is up yet.
  dry() { base(1, 0); state.marlow.misting = true; },
  // poster 1: the pour
  pour() { base(1, 2); jo({ at: ANCHORS.p2.stand, action: 'pour', actionT: 1.2, actionDur: 2.4, target: 'p2' }); },
  walk() { base(1, 3); jo({ at: { x: 1.2, z: 2.9, heading: 1.4 }, action: 'walk', walked: 1.3 }); },
  barrel() { base(1, 3); jo({ at: ANCHORS.barrel.stand, action: 'scoop', actionT: 0.7, actionDur: 1.6, cup: 0 }); },
  // poster 2: the hand-off
  handoff() { base(2, 3); tamAt(0, { stage: 'top', hasTray: true }); state.tam.pos = { x: TAM_TOP.x, z: TAM_TOP.z }; state.tam.y = 0; jo({ at: ANCHORS.tray.stand, action: 'idle' }); },
  climbing() { base(2, 3); tamAt(0.55, { stage: 'climbing', hasTray: true, walked: 2 }); jo({ at: ANCHORS.p3.stand, action: 'idle' }); },
  // night three: twelve pots, grown, first light
  dawn() { base(3, 9, 12); state.sky.dawn = 0.85; jo({ at: ANCHORS.p9.stand, action: 'pour', actionT: 1.2, actionDur: 2.4, target: 'p9' }); },
  // poster 3: nobody has to come up
  sensor() { base(4, 12, 12); state.pots.forEach((p) => { p.growth = 2; }); state.hatchOpen = false; state.lampOn = false; state.marlow.shelfSensor = true; state.marlow.misting = true; state.ending = 'sensor'; },
  hand() { base(4, 5, 12); state.pots.forEach((p) => { p.growth = 2; }); state.stakeAsProp = true; state.secondCup = true; state.valve.sealed = true; state.ending = 'hand';
    tamAt(0.45, { stage: 'climbing', bucket: true, hasTray: false, walked: 1.5 }); jo({ at: ANCHORS.p5.stand, action: 'idle', cup: 0 }); },
};
function settle(sec = 4) { for (let i = 0; i < sec * 20; i++) { world.update(0.05); render.update(0.05); } render.snap(); }

window.__look = {
  ready: true, state, render, world, errors, poses: Object.keys(POSES),
  pose(name, shot) { POSES[name](); if (shot) state.camera.shot = shot; Object.assign(state.camera, { yaw: 0, pitch: 0, zoom: 1 }); render.resize(); settle(); return name; },
  shot(name) { state.camera.shot = name; render.snap(); },
  orbit(yaw = 0, pitch = 0, zoom = 1, snap = true) { Object.assign(state.camera, { yaw, pitch, zoom }); if (snap) render.snap(); },
  step(dt = 1 / 30, n = 1) { for (let i = 0; i < n; i++) { state.time += dt; world.update(dt); render.update(dt); } },
  frame() { render.frame(world.scene); },
  quality(q) { render.setQuality(q, true); return state.quality; },
  post(o) { render.post.setOptions(o); }, uniform(k, v) { render.post.uniforms[k].value = v; },
  fade(f) { render.setFade(f); },
  set(path, value) { const ks = path.split('.'); let o = state; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = value; },
  // time a burst of frames (wall clock, includes the GPU only as far as the driver blocks)
  bench(n = 60) { const gl = render.renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
    for (let i = 0; i < n; i++) { state.time += 1 / 60; world.update(1 / 60); render.update(1 / 60); render.frame(world.scene); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / n; },
  // Camera stability. Step a slow orbit; after each step compare the new frame with the last one moved by exactly
  // the distance the roof moved on screen. What is left over is paint that slid against the picture (crawl).
  stability(pinned = true, steps = 8, pxStep = 2) {
    const L = window.__look, gl = render.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    L.pose('pour', 'follow'); L.post({ anchor: pinned }); const jx0 = state.jo.pos.x;
    const grab = () => { L.frame(); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const y = new Float32Array(W * H); for (let i = 0; i < W * H; i++) y[i] = (0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2]) / 255; return y; };
    const where = () => { const v = render.rig.anchor.clone().project(render.camera); return { x: (v.x * 0.5 + 0.5) * W, y: (v.y * 0.5 + 0.5) * H }; };
    L.orbit(0, 0, 1, true);
    // the move is a pan: the follow shot tracking Jo along the shelf (the world is not re-posed, only the camera moves)
    const where0 = (m) => { state.jo.pos.x = jx0 + m * 10; render.snap(); return where(); };
    let prev = grab(), pa = where(), crawl = 0, raw = 0, n = 0; const ax0 = pa.x, shifts = [];
    const x0 = Math.round(W * 0.3), x1 = Math.round(W * 0.8), y0 = Math.round(H * 0.3), y1 = Math.round(H * 0.7);
    for (let k = 1; k <= steps; k++) {
      // find the yaw that moves the roof by a whole number of pixels, so the comparison needs no resampling
      let lo = 0, hi = 0.2; const want = ax0 + pxStep * k * Math.sign(where0(0.01).x - ax0);
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Math.abs(where0(m).x - ax0) < Math.abs(want - ax0)) lo = m; else hi = m; }
      where0((lo + hi) / 2); const cur = grab(), a = where(), dx = Math.round(a.x - pa.x), dy = Math.round(a.y - pa.y);
      shifts.push([+(a.x - pa.x).toFixed(3), +(a.y - pa.y).toFixed(3)]);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        crawl += Math.abs(cur[(y + dy) * W + x + dx] - prev[y * W + x]); raw += Math.abs(cur[y * W + x] - prev[y * W + x]); n++;
      }
      prev = cur; pa = a;
    }
    const still = grab(), again = grab(); let same = 0; for (let i = 0; i < still.length; i += 7) same = Math.max(same, Math.abs(still[i] - again[i]));
    state.jo.pos.x = jx0; L.post({ anchor: true });
    return { pinned, crawl: +(crawl / n).toFixed(5), unaligned: +(raw / n).toFixed(5), stillFrameDiff: same, shifts: shifts.slice(0, 3) };
  },
  gouache,
  // mean luma and warm share of the frame as painted (64 x 64 samples)
  stats() { const L = window.__look, gl = render.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; L.frame();
    const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); let sum = 0, warm = 0, dark = 0, n = 0;
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const k = (Math.floor((j + 0.5) * H / 64) * W + Math.floor((i + 0.5) * W / 64)) * 4, r = b[k], g = b[k + 1], bl = b[k + 2];
      sum += (0.299 * r + 0.587 * g + 0.114 * bl) / 255; if (r > 110 && r > bl * 1.35) warm++; if (r + g + bl < 60) dark++; n++; }
    return { mean: sum / n, warm: warm / n, black: dark / n }; },
  // --- checks (run by check.mjs). Each returns { ok, ...numbers }. sab = a deliberate fault that must turn the check red.
  checks: {
    quality(sab) {
      const W = render.watch, feed = (ms, n) => { for (let i = 0; i < n; i++) W.feed(ms); }, q = () => state.quality;
      render.setQuality(2, false); feed(16.7, 600); const fast = q();
      feed(5000, 3); feed(16.7, 200); const spikes = q();
      render.setQuality(2, true); feed(sab ? 16.7 : 55, 600); const locked = q();
      render.setQuality(2, false); feed(sab ? 20 : 45, 140); const firstDrop = q(); feed(sab ? 20 : 45, 900); const floor = q();
      render.setQuality(2, true);
      return { ok: fast === 2 && spikes === 2 && locked === 2 && firstDrop === 1 && floor === 0, fast, spikes, locked, firstDrop, floor };
    },
    reducedMotion(sab) {
      const L = window.__look, yawOf = () => Math.atan2(render.camera.position.x - (-2.2), render.camera.position.z - 3.4);
      const span = (calm) => { state.reducedMotion = calm; L.pose('pour', 'shelf'); let lo = 9, hi = -9; for (let i = 0; i < 400; i++) { state.time += 0.1; render.update(0.1); const y = yawOf(); lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
      const sway = span(false), calm = span(!sab); state.reducedMotion = false;
      return { ok: sway > 0.004 && sway < 0.0095 && calm < 1e-9, sway: +sway.toFixed(5), calm: +calm.toFixed(7) };
    },
    softCamera(sab) {
      // a shot change must start gently: the first frame's move is a small part of the fastest frame's move
      const L = window.__look; L.pose('pour', 'wide'); state.camera.shot = 'shelf'; const p = render.camera.position.clone(); let first = 0, peak = 0, at = 0, total = 0;
      for (let i = 0; i < 240; i++) { state.time += 1 / 60; if (sab && i === 0) render.snap(); else render.update(1 / 60); const d = render.camera.position.distanceTo(p); p.copy(render.camera.position);
        if (i === 0) first = d; if (d > peak) { peak = d; at = i / 60; } total += d; }
      const left = (() => { render.update(1 / 60); return render.camera.position.distanceTo(p); })();
      return { ok: first < peak * 0.2 && at > 0.1 && at < 1 && left < 0.002, first: +first.toFixed(4), peak: +peak.toFixed(4), peakAt: +at.toFixed(2), stillMovingAfter4s: +left.toFixed(5) };
    },
    lamp(sab) {
      // the lamp going out is never a pop: no frame at 30 per second changes the picture by more than 1%, and it takes time
      const L = window.__look; L.pose('pour', 'shelf'); const tau = render.lighting.tau, keep = tau.lamp; if (sab) tau.lamp = 0.01;
      let prev = L.stats().mean, worst = 0, t90 = -1; const i0 = render.lighting.stair.intensity; state.lampOn = false;
      for (let i = 1; i <= 75; i++) { L.step(1 / 30); const m = L.stats().mean; worst = Math.max(worst, Math.abs(m - prev)); prev = m; if (t90 < 0 && render.lighting.stair.intensity < i0 * 0.1) t90 = i / 30; }
      tau.lamp = keep; state.lampOn = true; L.step(0.05, 60);
      return { ok: worst < 0.01 && t90 >= 0.4 && t90 < 2.5, worstStep: +worst.toFixed(4), secondsTo90: +t90.toFixed(2) };
    },
    warm(sab) {
      // one warm light. With the hatch shut and the lamp off, the lower half of the sheet has no warm paint in it at all.
      const L = window.__look; L.pose('pour', 'shelf'); const lit = L.stats().warm; L.pose('sensor', 'epilogue'); if (sab) { state.lampOn = true; state.hatchOpen = true; L.step(0.05, 80); }
      const off = L.stats(); return { ok: lit > 0.05 && off.warm < 0.012 && off.black === 0, warmLit: +lit.toFixed(3), warmOff: +off.warm.toFixed(4), blackPixels: off.black };
    },
    ink(sab) {
      // every material writes the ink channel, and water is never drawn round
      const L = window.__look; L.pose('pour', 'shelf'); L.frame(); let all = 0, patched = 0;
      world.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { all++; if (m.userData.inkPatched) patched++; } });
      const lineShare = () => { L.frame(); const T = render.post.targets.edge, W = T.width, H = T.height, b = new Uint8Array(W * H * 4); render.renderer.readRenderTargetPixels(T, 0, 0, W, H, b); let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i] > 128) n++; return n / (W * H); };
      const water = gouache('waterLit', { flat: 1 }), base = lineShare();
      water.userData.noInk = false; water.needsUpdate = true; const outlined = lineShare(); water.userData.noInk = true; water.needsUpdate = true;
      const a = sab ? outlined : base, b2 = sab ? outlined : outlined;
      return { ok: patched === all && all > 20 && a < b2, materials: all, patched, lineShare: +base.toFixed(5), lineShareIfWaterWereInked: +outlined.toFixed(5) };
    },
    tiers() {
      const gl = render.renderer.getContext(), out = {}; for (const q of [0, 1, 2, 3]) { render.setQuality(q, true); out['q' + q] = gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight; }
      render.setQuality(2, true); const px = (k) => { const [a, b] = out[k].split('x').map(Number); return a * b; };
      return { ok: px('q0') < px('q1') && px('q1') < px('q2') && px('q2') <= px('q3') && px('q3') < 4.3e6, ...out, css: state.viewport.w + 'x' + state.viewport.h };
    },
  },
  // where the time goes: time a burst with one part switched off at a time
  breakdown(n = 12) {
    const L = window.__look, base = L.bench(n), out = { all: base };
    const o = { ...render.post.options };
    L.post({ rich: false }); out.lean = L.bench(n); L.post({ rich: o.rich });
    const lights = render.lights.children.filter((c) => c.isLight), moon = lights.find((c) => c.isDirectionalLight);
    moon.castShadow = false; out.noShadow = L.bench(n); moon.castShadow = true;
    const vis = world.scene.children.map((c) => c.visible); world.scene.children.forEach((c) => { if (!c.isLight && c !== render.lights) c.visible = false; });
    out.emptyScene = L.bench(n); world.scene.children.forEach((c, i) => { c.visible = vis[i]; });
    for (const k in out) out[k] = +out[k].toFixed(1);
    return out;
  },
  info() { const gl = render.renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
    return { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, quality: state.quality, gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?', calls: render.renderer.info.render.calls, tris: render.renderer.info.render.triangles }; },
};
let raf = 0;
function loop() { raf = requestAnimationFrame(loop); if (!window.__look.manual) { window.__look.step(1 / 60); render.frame(world.scene); } }
window.__look.pose('pour', 'shelf'); loop();
