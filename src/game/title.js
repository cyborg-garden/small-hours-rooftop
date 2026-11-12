// OWNER: D (game). The title lettering. Drawn, not typeset: eight capitals as brush paths, pulled with the
// flat brush in brush.js. Big first letters, small capitals after, the way a sign painter would letter a
// shop front. One line on a wide screen, two on a tall one.
import { createInk, strokeInk, paintInk, rgbOf, hash } from './brush.js';

// Each glyph: advance width, then strokes. Unit square, y down, 0 = cap line, 1 = base line.
// Stroke order and direction are how a hand would do it: top to bottom, left to right.
const G = {
  S: [0.68, [[0.58, 0.19], [0.47, 0.06], [0.31, 0.03], [0.16, 0.12], [0.13, 0.28], [0.24, 0.42], [0.42, 0.53], [0.56, 0.66], [0.56, 0.84], [0.42, 0.96], [0.25, 0.97], [0.09, 0.84]]],
  M: [1.04, [[0.15, 0.04], [0.13, 0.5], [0.1, 1.0]], [[0.15, 0.04], [0.33, 0.44], [0.51, 0.84]], [[0.87, 0.04], [0.69, 0.44], [0.51, 0.84]], [[0.87, 0.04], [0.89, 0.5], [0.92, 1.0]]],
  A: [0.86, [[0.43, 0.02], [0.25, 0.5], [0.07, 1.0]], [[0.43, 0.02], [0.61, 0.5], [0.8, 1.0]], [[0.2, 0.67], [0.43, 0.66], [0.66, 0.67]]],
  L: [0.64, [[0.15, 0.02], [0.15, 0.5], [0.15, 0.96]], [[0.13, 0.955], [0.36, 0.96], [0.59, 0.95]]],
  H: [0.9, [[0.15, 0.02], [0.15, 0.5], [0.15, 1.0]], [[0.75, 0.02], [0.75, 0.5], [0.75, 1.0]], [[0.15, 0.5], [0.45, 0.49], [0.75, 0.5]]],
  O: [0.94, [[0.5, 0.03], [0.3, 0.06], [0.14, 0.24], [0.09, 0.5], [0.15, 0.77], [0.31, 0.94], [0.47, 0.97]], [[0.44, 0.03], [0.64, 0.06], [0.8, 0.23], [0.85, 0.5], [0.79, 0.76], [0.63, 0.94], [0.47, 0.97]]],
  U: [0.88, [[0.15, 0.02], [0.15, 0.36], [0.16, 0.66], [0.25, 0.88], [0.44, 0.97], [0.62, 0.9], [0.72, 0.72]], [[0.73, 0.02], [0.73, 0.5], [0.74, 1.0]]],
  R: [0.82, [[0.15, 0.02], [0.15, 0.5], [0.15, 1.0]], [[0.13, 0.045], [0.42, 0.04], [0.6, 0.12], [0.65, 0.27], [0.57, 0.42], [0.4, 0.49], [0.15, 0.5]], [[0.4, 0.49], [0.57, 0.74], [0.76, 1.0]]],
};
const SMALL = 0.72, GAP = 0.085, SPACE = 0.36;
const measure = (word) => { let w = 0; [...word].forEach((ch, i) => { w += ch === ' ' ? SPACE : (G[ch][0] + GAP) * (i === 0 || word[i - 1] === ' ' ? 1 : SMALL); }); return w - GAP * SMALL; };

// Paints `lines` centred into the canvas. cap = cap height of the big letters in CSS px (chosen to fit).
export function drawTitle(canvas, cssW, cssH, lines, o = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
  canvas.width = W; canvas.height = H; canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H);
  const lead = 1.22, pad = 0.12;
  const widest = Math.max(...lines.map(measure));
  const cap = Math.min((W * 0.96) / widest, H / (lines.length * lead + pad * 2 - (lead - 1)));
  const ink = createInk(W, H), shade = createInk(W, H);
  const seed = o.seed || 4, nib = cap * 0.118;
  lines.forEach((word, li) => {
    let x = (W - measure(word) * cap) / 2; const base = (H - (lines.length * lead - (lead - 1)) * cap) / 2 + cap + li * lead * cap;
    [...word].forEach((ch, i) => {
      const big = i === 0 || word[i - 1] === ' ', k = cap * (big ? 1 : SMALL);
      if (ch === ' ') { x += SPACE * cap; return; }
      const [adv, ...strokes] = G[ch], id = li * 31 + i;
      // a hand does not set every letter on the line: a hair of rise and lean, never enough to look loose
      const rise = (hash(id, seed) - 0.5) * k * 0.035, lean = (hash(id + 0.5, seed * 3) - 0.5) * 0.035;
      strokes.forEach((st, si) => {
        const pts = st.map(([u, v]) => { const px = u * k, py = (v - 1) * k; return [x + px - py * lean, base + py + rise]; });
        const opt = { w: nib * (big ? 1 : 0.84), ang: -0.56, seed: seed + id * 1.7 + si * 0.9, dry: 0.34 + 0.22 * hash(id + si * 3, seed + 2) };
        strokeInk(ink, pts, opt);
        strokeInk(shade, pts.map(([a, b]) => [a + cap * 0.022, b + cap * 0.03]), { ...opt, dry: 0.1 });
      });
      x += (adv + GAP) * k;
    });
  });
  // a soft indigo under-coat first, so the letters hold over a lit window or the warm wall
  paintInk(shade, ctx, rgbOf('#171925'), { alpha: 0.5, grain: 0.2, seed: 2 });
  paintInk(ink, ctx, rgbOf(o.color || '#EFE6D2'), { alpha: 1, grain: 0.62, seed });
  return cap / dpr;
}
