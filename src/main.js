// FROZEN (director). Wires the four modules and runs the loop. Order per frame: game, world, render.
import { createBus } from './core/bus.js';
import { createState } from './core/state.js';
import { EV } from './core/events.js';
import { createRender } from './render/index.js';
import { createWorld } from './world/index.js';
import { createAudio } from './audio/index.js';
import { createGame } from './game/index.js';
import { installBridge } from './game/bridge.js';

const canvas = document.getElementById('c');
const bus = createBus();
const state = createState(340);
try { state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
const render = createRender(canvas, state, bus);
const world = createWorld(render, state, bus);
const audio = createAudio(state, bus);
const game = createGame({ canvas, state, bus, render, world, audio });

// one fixed-order simulation tick. The bridge uses the same function, so stepped and live play are the same game.
function tick(dt) { game.update(dt); world.update(dt); render.update(dt); audio.update(dt); }
installBridge({ state, bus, game, world, render, audio, tick });

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const ms = now - last; last = now;
  if (state.paused) return;
  // a slow machine (8 to 20 frames a second) still plays in real time: the game is stepped in pieces of at most 50 ms,
  // the picture once. Below about 5 frames a second the game slows down rather than jump.
  if (state.auto) { const total = Math.min(0.2, ms / 1000); let left = total; while (left > 0.0501) { game.update(0.05); left -= 0.05; } game.update(left); world.update(total); render.update(total); audio.update(total); }
  else { render.update(0); }
  render.frame(world.scene, ms);
}
document.addEventListener('visibilitychange', () => {
  state.paused = document.hidden; last = performance.now();
  bus.emit(state.paused ? EV.PAUSE : EV.RESUME, {});
});
requestAnimationFrame(frame);
