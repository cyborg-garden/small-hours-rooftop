// OWNER: D (game). A flat brush and a sheet of paper, in code. Everything the chrome shows that is not
// type is painted with this at load: the title lettering, the wash behind a caption, the paper of the
// tags, the edge arrow. No images, no fonts, no built-in random. The same hash drives all of it, so
// the same seed paints the same picture.
const fract = (v) => v - Math.floor(v);
export const hash = (x, y = 0) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
export function vnoise(x, y = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// paper tooth, 0..1: fine grain, a slower mottle, and long fibres lying mostly along the sheet
export const tooth = (x, y) => 0.5 * hash(x, y) + 0.3 * vnoise(x * 0.31, y * 0.31) + 0.2 * vnoise(x * 0.035 + 9.1, y * 0.42);

// Catmull-Rom through the points, resampled to an even step in pixels
export function resample(pts, step = 1) {
  if (pts.length < 2) return pts.slice();
  const out = [], P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let carry = 0, last = pts[0]; out.push([last[0], last[1], 0]);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / Math.max(0.5, step) * 2));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3);
      const d = Math.hypot(x - last[0], y - last[1]); carry += d; total += d; last = [x, y];
      if (carry >= step) { carry = 0; out.push([x, y, total]); }
    }
  }
  out.push([last[0], last[1], total]);
  return out;
}

// An ink layer is a float coverage buffer. Strokes are stamped in with max(), so a stroke crossing itself
// or a neighbour does not double up: one coat of paint, like gouache.
export function createInk(w, h) { return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), a: new Float32Array(Math.max(1, Math.round(w)) * Math.max(1, Math.round(h))) }; }
function stamp(ink, x, y, r, v) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(ink.w - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(ink.h - 1, Math.ceil(y + r + 1));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const c = v * Math.max(0, Math.min(1, r + 0.5 - Math.hypot(xx - x, yy - y)));
    const i = yy * ink.w + xx; if (c > ink.a[i]) ink.a[i] = c;
  }
}
// A flat brush held at a fixed angle, pulled along a path. Width comes from the direction of travel, the way
// it does with a real one: full across the brush, a hairline along it. Each bristle carries its own load of
// paint and runs dry toward the end of the stroke.
//   o: { w: brush width px, ang: brush angle radians (0 = flat, negative leans right), seed, dry 0..1, press 0..1 }
export function strokeInk(ink, pts, o) {
  const { w, ang = -0.52, seed = 1, dry = 0.5, press = 1 } = o;
  const P = resample(pts, 0.8), n = P.length; if (n < 2) return;
  const L = P[n - 1][2] || 1, nb = Math.max(4, Math.round(w / 1.25)), nx = Math.cos(ang), ny = Math.sin(ang), r = Math.max(0.55, (w / nb) * 0.62);
  for (let b = 0; b < nb; b++) {
    const u = nb === 1 ? 0 : b / (nb - 1) - 0.5, load = 0.5 + 0.8 * hash(seed * 3.1 + b * 7.7, 1.3);
    const edge = 1 - 0.3 * Math.pow(Math.abs(u) * 2, 5);
    for (let i = 0; i < n; i++) {
      const s = P[i][2] / L;
      const streak = vnoise(s * (3 + L * 0.012) + b * 13.1 + seed, b * 1.7 + seed * 0.3);
      // the brush lands (first 4 px), travels, then lifts and runs dry
      const land = Math.min(1, (P[i][2] + 1.5) / 4), lift = Math.min(1, (L - P[i][2] + 1) / 5);
      let a = load + 0.75 - dry * (0.2 + 1.25 * Math.pow(s, 1.8)) * (0.45 + 1.1 * streak);
      a = Math.max(0, Math.min(1, a * 1.5)) * edge * press * (0.55 + 0.45 * land) * (0.5 + 0.5 * lift);
      if (a <= 0.02) continue;
      const wob = (vnoise(s * 7 + seed * 2.3, b * 0.9 + 4.2) - 0.5) * w * 0.07;
      stamp(ink, P[i][0] + (u * w + wob) * nx, P[i][1] + (u * w + wob) * ny, r, a);
    }
  }
}
// Lay the coverage down as one colour. Where the coat is thin the paper tooth shows through it.
export function paintInk(ink, ctx, rgb, o = {}) {
  const { alpha = 1, grain = 0.55, ox = 0, oy = 0, seed = 0 } = o;
  const img = ctx.createImageData(ink.w, ink.h), d = img.data;
  for (let y = 0, i = 0; y < ink.h; y++) for (let x = 0; x < ink.w; x++, i++) {
    const c = ink.a[i]; if (c <= 0) continue;
    const t = tooth(x + seed * 17, y + seed * 5) * grain, lo = t - 0.08, k = Math.max(0, Math.min(1, (c - lo) / 0.3));
    const v = k * k * (3 - 2 * k) * (0.9 + 0.1 * c) * alpha;
    d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = Math.round(255 * v);
  }
  const tmp = document.createElement('canvas'); tmp.width = ink.w; tmp.height = ink.h; tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(tmp, ox, oy);
}
export const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const urlOf = (c) => { try { return `url(${c.toDataURL('image/png')})`; } catch (_) { return 'none'; } };

// A sheet of toned paper for tags and labels: grain, mottle, a few fibres. Tiles.
export function paperSheet(hex = '#EFE6D2', size = 128, seed = 3) {
  const c = canvasOf(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, col = rgbOf(hex);
  const wrap = (fn, x, y) => {   // blend the noise across the edges so the sheet tiles without a seam
    const u = x / size, v = y / size;
    return (fn(x, y) * (1 - u) + fn(x - size, y) * u) * (1 - v) + (fn(x, y - size) * (1 - u) + fn(x - size, y - size) * u) * v;
  };
  const f = (x, y) => 0.55 * vnoise(x * 0.9 + seed, y * 0.9) + 0.3 * vnoise(x * 0.07 + seed * 2, y * 0.07) + 0.15 * vnoise(x * 0.02 + 5, y * 0.5 + seed);
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    const k = 0.93 + 0.11 * wrap(f, x, y);
    d[i] = Math.min(255, col[0] * k); d[i + 1] = Math.min(255, col[1] * k); d[i + 2] = Math.min(255, col[2] * k * 0.985); d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return urlOf(c);
}
// The wash a caption sits on: two or three pulls of a wide, nearly dry brush, darker in the middle,
// streaking out at both ends. Stretched behind the text, so it is long and thin.
export function washPlate(hex = '#171925', w = 720, h = 132, seed = 11, strength = 0.8) {
  const c = canvasOf(w, h), ctx = c.getContext('2d'), ink = createInk(w, h);
  const pulls = [[0.5, 0.86, 0.02, 0.985, 0.55], [0.34, 0.5, 0.06, 0.95, 0.75], [0.69, 0.42, 0.045, 0.93, 0.8]];
  pulls.forEach(([cy, bw, x0, x1, dry], k) => {
    const y = h * cy, pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([w * (x0 + (x1 - x0) * t), y + (vnoise(t * 3 + seed + k * 5, k) - 0.5) * h * 0.07]); }
    if (k === 1) pts.reverse();
    strokeInk(ink, pts, { w: h * bw, ang: Math.PI / 2 - 0.06, seed: seed + k * 3, dry, press: k ? 0.8 : 1 });
  });
  paintInk(ink, ctx, rgbOf(hex), { alpha: strength, grain: 0.5, seed });
  return urlOf(c);
}
// The edge arrow: a paper chevron, two short pulls of the brush, over its own ink shadow.
export function chevron(size = 88, seed = 5) {
  const c = canvasOf(size, size), ctx = c.getContext('2d'), s = size;
  const draw = (hex, dx, dy, a) => {
    const ink = createInk(s, s);
    strokeInk(ink, [[s * 0.4 + dx, s * 0.24 + dy], [s * 0.52 + dx, s * 0.37 + dy], [s * 0.64 + dx, s * 0.5 + dy]], { w: s * 0.15, ang: -0.9, seed, dry: 0.25 });
    strokeInk(ink, [[s * 0.64 + dx, s * 0.5 + dy], [s * 0.52 + dx, s * 0.63 + dy], [s * 0.4 + dx, s * 0.76 + dy]], { w: s * 0.15, ang: 0.9, seed: seed + 2, dry: 0.45 });
    paintInk(ink, ctx, rgbOf(hex), { alpha: a, grain: 0.35, seed });
  };
  draw('#171925', s * 0.03, s * 0.04, 0.85); draw('#EFE6D2', 0, 0, 1);
  return urlOf(c);
}
