// OWNER: B (world). The only affordance in the game: things in state.hot breathe, a slow few percent, on a
// 3.2 s sine. No outlines, no icons. Each hot thing registers the materials that carry it.
import { ANCHORS } from '../core/layout.js';

export function createHot() {
  const things = new Map();
  return {
    add(id, ...materials) { const list = things.get(id) || []; for (const m of materials.flat()) if (m && m.color) list.push({ m, k: 0 }); things.set(id, list); },
    update(dt, state) {
      const s = state.reducedMotion ? 0.5 : 0.5 - 0.5 * Math.cos(state.time * (Math.PI * 2 / 3.2));
      const e = 1 - Math.exp(-dt * 4);
      for (const [id, list] of things) {
        const on = state.hot.includes(id) ? 1 : 0, focus = state.focus === id ? 0.08 : 0;
        // what can be used breathes a little deeper than what can only be looked at: the pots, the water, the tray
        // are the way forward, and should be the first thing a stranger's eye settles on
        const use = ANCHORS[id] && ANCHORS[id].kind !== 'look' && !(id === 'sensor' && state.beat !== 'choice');
        const depth = use ? 0.04 + 0.18 * s : 0.02 + 0.09 * s;
        for (const q of list) { q.k += (on - q.k) * e; q.m.color.setScalar(1 + q.k * (depth + focus)); }
      }
    },
  };
}
