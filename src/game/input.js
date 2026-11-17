// OWNER: D (game). Pointer, touch and keyboard. One verb: tap a thing. A drag looks around, two fingers
// or the wheel lean in. Nothing here needs pointer lock, fullscreen or a keyboard.
import { ANCHORS, ALIASES } from '../core/layout.js';
import { ORBIT } from '../render/rig.js';
import { TV } from '../core/surface.js';

const TAP_SLOP = 9;                         // px a press may wander and still be a tap
const O = { yaw: 0.5, pitchUp: 0.1, pitchDown: 0.14, zoomMin: 0.85, zoomMax: 1.2, ...(ORBIT || {}) };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createInput({ canvas, state, render, world, onTap, onMiss, onBegin, onAgain, onKey }) {
  const pointers = new Map(); let down = null, pinch = 0, idle = 0, kbd = false, hover = null, mouse = null;

  // Where a thing is right now. Everything sits at its frozen anchor except the cup, which is in Jo's hand.
  function where(id) {
    const a = ANCHORS[id]; if (!a) return null;
    if (id === 'cup' && state.jo.present && state.jo.cupHeld && world && world.cupLip) {
      try { const v = world.cupLip(); if (v && isFinite(v.x + v.y + v.z)) return { x: v.x, y: v.y - 0.04, z: v.z }; } catch (_) {}
    }
    if (id === 'tam' && state.tam.present) return { x: state.tam.pos.x, y: (state.tam.y || 0) + 1.0, z: state.tam.pos.z };
    // the tray is wherever the neighbour is holding it: out in front of their chest
    if (id === 'tray' && state.tam.present && state.tam.hasTray) { const h = state.tam.heading ?? Math.PI / 2; return { x: state.tam.pos.x + Math.sin(h) * 0.45, y: (state.tam.y || 0) + 1.22, z: state.tam.pos.z + Math.cos(h) * 0.45 }; }
    return a.pos;
  }
  const radiusOf = (id, pos) => { const a = ANCHORS[id]; return Math.max(a.kind === 'pot' ? 22 : 30, a.radius * render.pxPerMetre(pos) * 1.2); };
  // distance from (x, y) to a thing on screen. A pot is its whole plant, not just the rim: a tall stem counts.
  function reach(id, x, y) {
    const a = ANCHORS[id], pos = where(id), p = render.project(pos); if (p.behind) return null;
    let d = Math.hypot(p.x - x, p.y - y);
    if (id === 'barrel') {   // the barrel is the whole barrel, its stand to its rim, not a point at its middle
      const lo = render.project({ x: pos.x, y: 0.15, z: pos.z }), hi = render.project({ x: pos.x, y: 1.1, z: pos.z });   // (its lip is at 1.0 m)
      const vx = hi.x - lo.x, vy = hi.y - lo.y, L = vx * vx + vy * vy, t = L > 0 ? clamp(((x - lo.x) * vx + (y - lo.y) * vy) / L, 0, 1) : 0;
      d = Math.min(d, Math.hypot(lo.x + vx * t - x, lo.y + vy * t - y));
    }
    if (a.kind === 'pot') {
      const pot = state.pots[a.index], q = render.project({ x: pos.x, y: pos.y + 0.14 + (pot ? pot.growth : 0) * 0.2, z: pos.z });
      const vx = q.x - p.x, vy = q.y - p.y, L = vx * vx + vy * vy, t = L > 0 ? clamp(((x - p.x) * vx + (y - p.y) * vy) / L, 0, 1) : 0;
      d = Math.hypot(p.x + vx * t - x, p.y + vy * t - y);
    }
    return { d, r: radiusOf(id, pos) };
  }
  // Screen-space picking against the anchors: generous on touch, no raycasts, no dependence on meshes.
  // Things you can use win over things you can only look at.
  function pick(x, y) {
    let best = null, bestScore = 1e9;
    const ids = [...state.hot, ...ALIASES.filter((a) => state.hot.includes(ANCHORS[a].to))];
    for (const id of ids) {
      if (!ANCHORS[id]) continue;
      const h = reach(id, x, y); if (!h || h.d > h.r) continue;
      const k = ANCHORS[id].kind, score = h.d / h.r + (k === 'look' ? 0.5 : k === 'alias' ? 0.3 : 0);
      if (score < bestScore) { best = id; bestScore = score; }
    }
    return best && ANCHORS[best].kind === 'alias' ? ANCHORS[best].to : best;
  }
  // a tap that picks nothing, but lands on a pot that has had its water tonight: the game answers it (arc.js: spent)
  function pickSpent(x, y) {
    let best = null, bd = 1e9;
    for (const p of state.pots) { if (!p.present || !p.watered || !ANCHORS[p.id]) continue; const h = reach(p.id, x, y); if (h && h.d <= h.r && h.d < bd) { best = p.id; bd = h.d; } }
    return best;
  }
  const pinchDist = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };

  canvas.addEventListener('pointerdown', (e) => {
    kbd = false; idle = 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId };
    else { if (down) down.moved = true; pinch = pinchDist(); }           // a second finger is never a tap
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {                                                  // a mouse passing over: show a hand on what can be tapped
      if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'mouse' && state.begun) { const id = pick(e.clientX, e.clientY); if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : ''; } }
      return;
    }
    p.x = e.clientX; p.y = e.clientY; idle = 0;
    const c = state.camera;
    if (pointers.size >= 2) {
      const d = pinchDist(); if (pinch > 0 && d > 0) c.zoom = clamp(c.zoom * (pinch / d), O.zoomMin, O.zoomMax); pinch = d; return;
    }
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved) { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_SLOP) return; down.moved = true; down.lx = e.clientX; down.ly = e.clientY; canvas.style.cursor = 'grabbing'; return; }
    // the same sweep of the thumb turns the roof the same amount on a phone and on a wide screen
    const k = 1.5 / Math.max(320, Math.min(state.viewport.w, 1100));
    c.yaw = clamp(c.yaw - (e.clientX - down.lx) * k, -O.yaw, O.yaw);
    c.pitch = clamp(c.pitch + (e.clientY - down.ly) * k * 0.6, -O.pitchUp, O.pitchDown);
    down.lx = e.clientX; down.ly = e.clientY;
  });
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId); pinch = 0;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null; canvas.style.cursor = hover ? 'pointer' : '';
    if (d.moved || e.type === 'pointercancel' || !state.begun) return;
    const id = pick(e.clientX, e.clientY);
    // at the choice only the two paper labels choose: a stray tap on the roof (on the cup in her hand, say) picks nothing
    if (id && !(state.beat === 'choice' && ANCHORS[id] && ANCHORS[id].kind === 'choice' && !state.breakStray)) onTap(id, { x: e.clientX, y: e.clientY }); else onMiss(e.clientX, e.clientY, pickSpent(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { mouse = null; if (hover) { hover = null; canvas.style.cursor = ''; } } });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); idle = 0; state.camera.zoom = clamp(state.camera.zoom + clamp(e.deltaY, -120, 120) * 0.0006, O.zoomMin, O.zoomMax); }, { passive: false });

  // Keyboard is a bonus: left and right walk the focus through what can be used, Enter or Space taps it.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // on the console the keys are made by the stick and cannot press a button: Enter always belongs to the roof
    const ae = document.activeElement, onButton = !TV && !!ae && ae.tagName === 'BUTTON' && !ae.disabled;
    if (e.key === 'm' || e.key === 'M') { onKey && onKey('mute'); return; }
    if (!state.begun) { if ((e.key === 'Enter' || e.key === ' ') && !onButton) { onBegin && onBegin(); e.preventDefault(); } return; }
    if (TV && state.beat === 'end') { if ((e.key === 'Enter' || e.key === ' ') && state.beatTime > 2) { onAgain && onAgain(); e.preventDefault(); } return; }
    const list = state.hot.filter((id) => ANCHORS[id] && ANCHORS[id].kind !== 'look' && ANCHORS[id].kind !== 'alias' && !(id === 'sensor' && state.beat !== 'choice'));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!list.length) return;
      const i = list.indexOf(state.focus), n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      state.focus = list[i < 0 ? (n > 0 ? 0 : list.length - 1) : (i + n + list.length) % list.length]; kbd = true; state.focusByStick = true; e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (onButton) return;
      if (state.focus && list.includes(state.focus)) { kbd = true; onTap(state.focus, null); e.preventDefault(); }
    }
  });
  return {
    pick, where, radiusOf,
    get keyboard() { return kbd || TV; },
    // left alone, the roof turns back to where the shot was framed: slowly, and only after a pause
    get hover() { return hover; },
    update(dt) {
      // the roof moves under a still mouse (the camera eases, things become tappable): the hand follows what is under it now
      if (mouse && !down && !pointers.size && state.begun) { const id = pick(mouse.x, mouse.y); if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : ''; } }
      if (down || pointers.size) return;
      idle += dt; if (idle < 6) return;
      const k = Math.exp(-dt / 2.8), c = state.camera;
      c.yaw *= k; c.pitch *= k; if (Math.abs(c.yaw) < 1e-4) c.yaw = 0; if (Math.abs(c.pitch) < 1e-4) c.pitch = 0;
    },
  };
}
