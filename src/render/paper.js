// OWNER: A (render). The sheet. One tileable 512 x 512 texture, made on the CPU from a fixed seed, that every
// "hand" effect in the post shader reads from: the tooth of the paper, its long fibres, the slow drift that
// bends edges and steers the brush, and the bristle noise that streaks a loaded stroke.
// A texture rather than shader hashes, because hashes differ between GPUs and one sheet must look the same
// on a phone and a laptop. Nothing in here changes after it is built.
// Two textures:
//   paper (512, one texel per 720-line pixel)
//     R  tooth    fine grain, four octaves, mean 0.5
//     G  body     mottle that still reads at phone size, plus long fibres
//     B  bristle  near-white noise, smoothed. Line-integrated along the brush direction for streaks.
//   drift (128, the same tile stretched four times: slow fields need no more)
//     R,G  the 2D wobble of the hand (32 px cells)
//     B    a slower field (about 100 px cells): brush angle
//     A    stroke patches and line swell (sampled in a rotated, stretched frame)
import * as THREE from 'three';

export const PAPER_SIZE = 512;

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// periodic value noise: `cells` lattice cells across the tile, so it wraps exactly
function valueNoise(N, cells, seed) {
  const out = new Float32Array(N * N), f = cells / N;
  for (let y = 0; y < N; y++) {
    const gy = y * f, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty), ya = y0 % cells, yb = (y0 + 1) % cells;
    for (let x = 0; x < N; x++) {
      const gx = x * f, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cells, xb = (x0 + 1) % cells;
      const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
function normalise(a, lo = 0, hi = 1) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
  const k = (hi - lo) / Math.max(1e-6, mx - mn);
  for (let i = 0; i < a.length; i++) a[i] = lo + (a[i] - mn) * k;
  return a;
}
// stretch so the middle 96% of values fill 0..1: keeps the mean near 0.5 and the contrast predictable
function equalise(a) {
  const s = Float32Array.from(a).sort(), lo = s[Math.floor(s.length * 0.02)], hi = s[Math.floor(s.length * 0.98)];
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, (a[i] - lo) / Math.max(1e-6, hi - lo)));
  return a;
}
function blur3(a, N) {
  const o = new Float32Array(a.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += a[((y + j + N) % N) * N + ((x + i + N) % N)] * (i === 0 && j === 0 ? 4 : i === 0 || j === 0 ? 2 : 1);
    o[y * N + x] = s / 16;
  }
  return o;
}

export function buildPaperData(seed = 340, N = PAPER_SIZE) {
  // R: tooth
  const t = new Float32Array(N * N), o1 = valueNoise(N, N / 8, seed + 1), o2 = valueNoise(N, N / 4, seed + 2), o3 = valueNoise(N, N / 2, seed + 3), o4 = valueNoise(N, N, seed + 4);
  for (let i = 0; i < t.length; i++) t[i] = o1[i] * 0.22 + o2[i] * 0.34 + o3[i] * 0.3 + o4[i] * 0.14;
  equalise(t);
  // G: body = mottle + fibres. Fibres are stamped as soft line segments at random angles, wrapping at the tile edge.
  const m1 = valueNoise(N, N / 16, seed + 5), m2 = valueNoise(N, N / 64, seed + 6), fib = new Float32Array(N * N);
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < 2400; k++) {
    const x0 = rnd() * N, y0 = rnd() * N, ang = rnd() * Math.PI, len = 14 + rnd() * rnd() * 80, w = 0.25 + rnd() * 0.5, bend = (rnd() - 0.5) * 0.02;
    let a = ang, x = x0, y = y0;
    for (let i = 0; i < len; i++) {
      a += bend; x += Math.cos(a); y += Math.sin(a);
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      for (let j = 0; j < 2; j++) for (let ii = 0; ii < 2; ii++)
        fib[(((yi + j) % N + N) % N) * N + (((xi + ii) % N + N) % N)] += w * (ii ? fx : 1 - fx) * (j ? fy : 1 - fy);
    }
  }
  normalise(fib);
  const body = new Float32Array(N * N);
  for (let i = 0; i < body.length; i++) body[i] = m1[i] * 0.5 + m2[i] * 0.5 + Math.min(1, fib[i] * 1.6) * 0.35;
  equalise(body);
  // B: bristle
  const br = equalise(blur3(blur3(valueNoise(N, N / 2, seed + 9), N), N));
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(t[i] * 255); data[i * 4 + 1] = Math.round(body[i] * 255);
    data[i * 4 + 2] = Math.round(br[i] * 255); data[i * 4 + 3] = 255;
  }
  return data;
}

export function buildDriftData(seed = 340, N = 128) {
  const mix = (a, b, w) => { const o = new Float32Array(a.length); for (let i = 0; i < o.length; i++) o[i] = a[i] * w + b[i] * (1 - w); return equalise(o); };
  const wx = mix(valueNoise(N, 16, seed + 11), valueNoise(N, 4, seed + 12), 0.62), wy = mix(valueNoise(N, 16, seed + 13), valueNoise(N, 4, seed + 14), 0.62);
  const slow = mix(valueNoise(N, 5, seed + 15), valueNoise(N, 2, seed + 16), 0.7), patch = mix(valueNoise(N, 16, seed + 17), valueNoise(N, 5, seed + 18), 0.55);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { data[i * 4] = Math.round(wx[i] * 255); data[i * 4 + 1] = Math.round(wy[i] * 255); data[i * 4 + 2] = Math.round(slow[i] * 255); data[i * 4 + 3] = Math.round(patch[i] * 255); }
  return data;
}

function tex(data, N) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
export function createPaper(seed = 340) {
  return { paper: tex(buildPaperData(seed), PAPER_SIZE), drift: tex(buildDriftData(seed), 128) };
}
