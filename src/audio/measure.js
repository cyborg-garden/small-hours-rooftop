// OWNER: C (audio). Measurement, for tests only. Takes rendered channels and returns numbers, never audio.
// Used by renderOffline (one sound) and by the scene render (a whole recorded night).
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const r1 = (x) => +x.toFixed(1);

function fft(re, im) {   // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// averaged power spectrum of d[i0..i1), Hann windows of N with half overlap
function spectrum(d, i0, i1, N = 4096) {
  const pw = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N); let frames = 0;
  for (let s = i0; s + N <= Math.max(i1, i0 + N) && s + N <= d.length; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = d[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
    fft(re, im); for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k]; frames++;
  }
  if (frames) for (let k = 0; k < N / 2; k++) pw[k] /= frames;
  return pw;
}
const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
function describe(pw, sr) {
  const N = pw.length * 2, hz = sr / N; let tot = 0, cen = 0, aw = 0;
  const bands = BANDS.map(() => 0);
  for (let k = 1; k < pw.length; k++) {
    const f = k * hz, f2 = f * f; tot += pw[k]; cen += pw[k] * f;
    // A-weighting: roughly how loud each part of the spectrum is to an ear at low level
    const ra = (148693636 * f2 * f2) / ((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148693636)) * 1.2589; aw += pw[k] * ra * ra;
    const b = Math.round(Math.log2(f / 31.5)); if (b >= 0 && b < BANDS.length) bands[b] += pw[k]; else if (b < 0) bands[0] += pw[k];
  }
  let acc = 0, roll = 0; for (let k = 1; k < pw.length; k++) { acc += pw[k]; if (acc >= tot * 0.85) { roll = k * hz; break; } }
  let top = 1; for (let k = 2; k < pw.length; k++) if (pw[k] > pw[top]) top = k;
  return { aOffsetDb: r1(10 * Math.log10(Math.max(aw, 1e-30) / Math.max(tot, 1e-30))), centroidHz: Math.round(cen / Math.max(tot, 1e-30)), peakHz: Math.round(top * hz), rolloffHz: Math.round(roll), bands: Object.fromEntries(BANDS.map((f, i) => [f, r1(10 * Math.log10(Math.max(bands[i] / Math.max(tot, 1e-30), 1e-9)))])) };
}

// Discontinuities. A step shows as one sample-to-sample jump far larger than the jumps around it.
// Returns the count and the worst, with where. A sine cut off mid-cycle scores in the hundreds; noise scores under 8.
function clicks(d, sr) {
  const w = Math.round(sr * 0.004), n = d.length; let count = 0, worst = 0, at = 0;
  const j2 = new Float64Array(n + 1);   // running sum of squared jumps
  for (let i = 1; i < n; i++) { const j = d[i] - d[i - 1]; j2[i + 1] = j2[i] + j * j; }
  for (let i = w + 1; i < n - w - 1; i++) {
    const j = Math.abs(d[i] - d[i - 1]); if (j < 0.003) continue;
    const before = Math.sqrt((j2[i] - j2[i - w]) / w), after = Math.sqrt((j2[i + 1 + w] - j2[i + 1]) / w), ref = Math.max(before, after, 1e-7), ratio = j / ref;
    if (ratio > 12) { count++; if (ratio > worst) { worst = ratio; at = i / sr; } }
  }
  return { clicks: count, worstClickRatio: r1(worst), worstClickAt: +at.toFixed(3) };
}

export function analyse(chs, sr, { deep = true } = {}) {
  const n = chs[0].length, mono = new Float32Array(n);
  let peak = 0, sq = 0, dc = 0; const win = Math.round(sr * 0.002), envl = new Float32Array(Math.ceil(n / win));
  for (const d of chs) for (let i = 0; i < n; i++) {
    const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; const k = (i / win) | 0; if (a > envl[k]) envl[k] = a; mono[i] += d[i] / chs.length; dc += d[i];
  }
  let i10 = -1, i90 = -1, rise = 0;
  for (let k = 0; k < envl.length; k++) { if (i10 < 0 && envl[k] >= peak * 0.1) i10 = k; if (i90 < 0 && envl[k] >= peak * 0.9) { i90 = k; break; } }
  // steepest climb of the 2 ms envelope across any 10 ms, in dB, ignoring the noise floor
  for (let k = 5; k < envl.length; k++) if (envl[k] > peak * 0.25) rise = Math.max(rise, db(envl[k]) - db(Math.max(envl[k - 5], peak * 0.02)));
  const out = { peakDb: r1(db(peak)), rmsDb: r1(db(Math.sqrt(sq / (n * chs.length)))), attackMs: r1((i90 - i10) * 2), maxRiseDbPer10ms: r1(rise) };
  if (!deep) return out;
  // the last 3 ms before the end of the render: a source that stops while still sounding shows here
  let tail = 0; for (const d of chs) for (let i = n - Math.round(sr * 0.003); i < n; i++) tail = Math.max(tail, Math.abs(d[i]));
  let cl = { clicks: 0, worstClickRatio: 0, worstClickAt: 0 };
  for (const d of chs) { const c = clicks(d, sr); if (c.clicks > cl.clicks || c.worstClickRatio > cl.worstClickRatio) cl = { clicks: Math.max(c.clicks, cl.clicks), worstClickRatio: Math.max(c.worstClickRatio, cl.worstClickRatio), worstClickAt: c.worstClickRatio >= cl.worstClickRatio ? c.worstClickAt : cl.worstClickAt }; }
  // the sounding part, cut in thirds: is the pitch going somewhere
  let a0 = 0, a1 = envl.length - 1; while (a0 < a1 && envl[a0] < peak * 0.1) a0++; while (a1 > a0 && envl[a1] < peak * 0.1) a1--;
  const s0 = a0 * win, s1 = Math.min(n, (a1 + 1) * win), third = Math.floor((s1 - s0) / 3);
  const th = third >= 1024 ? [0, 1, 2].map((k) => describe(spectrum(mono, s0 + k * third, s0 + (k + 1) * third, third >= 4096 ? 4096 : 1024), sr)) : null;
  const thirds = th && th.map((x) => x.centroidHz), peakThirds = th && th.map((x) => x.peakHz);
  let aq = 0; for (let i = s0; i < s1; i++) aq += mono[i] * mono[i];
  const whole = describe(spectrum(mono, s0, s1), sr), activeRmsDb = r1(db(Math.sqrt(aq / Math.max(1, s1 - s0))));
  let l = 0, r = 0; if (chs.length > 1) for (let i = 0; i < n; i++) { l += chs[0][i] * chs[0][i]; r += chs[1][i] * chs[1][i]; }
  return { ...out, ...cl, tailDb: r1(db(tail)), dcDb: r1(db(Math.abs(dc / (n * chs.length)))), balanceDb: chs.length > 1 ? r1(10 * Math.log10(Math.max(r, 1e-20) / Math.max(l, 1e-20))) : 0,
    activeRmsDb, dBA: r1(activeRmsDb + whole.aOffsetDb), ...whole, centroidThirds: thirds, peakThirds };
}

// A whole scene: level over time, the loudest moments, the fastest rises, any steps.
export function analyseScene(chs, sr, marks = []) {
  const n = chs[0].length, sec = Math.floor(n / sr), perSec = [];
  const win = Math.round(sr * 0.002), envl = new Float32Array(Math.ceil(n / win));
  let peak = 0, peakAt = 0, sq = 0;
  for (let s = 0; s < sec; s++) {
    let p = 0, q = 0;
    for (const d of chs) for (let i = s * sr; i < (s + 1) * sr; i++) { const a = Math.abs(d[i]); if (a > p) p = a; q += a * a; const k = (i / win) | 0; if (a > envl[k]) envl[k] = a; }
    if (p > peak) { peak = p; peakAt = s; } sq += q;
    perSec.push({ t: s, peakDb: r1(db(p)), rmsDb: r1(db(Math.sqrt(q / (sr * chs.length)))) });
  }
  // suddenness anywhere in the mix: the steepest 10 ms climb of anything that ends above -40 dBFS
  let rise = 0, riseAt = 0; const floor = Math.pow(10, -62 / 20), gate = Math.pow(10, -40 / 20);
  for (let k = 5; k < envl.length; k++) if (envl[k] > gate) { const r = db(envl[k]) - db(Math.max(envl[k - 5], floor)); if (r > rise) { rise = r; riseAt = k * win / sr; } }
  // loudness steps: 250 ms RMS, the biggest jump between neighbours
  const hop = Math.round(sr * 0.25), blocks = []; for (let s = 0; s + hop <= n; s += hop) { let q = 0; for (const d of chs) for (let i = s; i < s + hop; i++) q += d[i] * d[i]; blocks.push(db(Math.sqrt(q / (hop * chs.length)))); }
  let jump = 0, jumpAt = 0; for (let b = 1; b < blocks.length; b++) if (blocks[b] > -36) { const j = blocks[b] - Math.max(blocks[b - 1], -45); if (j > jump) { jump = j; jumpAt = b * 0.25; } }
  const mono = new Float32Array(n); for (const d of chs) for (let i = 0; i < n; i++) mono[i] += d[i] / chs.length;
  let cl = { clicks: 0, worstClickRatio: 0, worstClickAt: 0 };
  for (const d of chs) { const c = clicks(d, sr); cl = { clicks: cl.clicks + c.clicks, worstClickRatio: Math.max(c.worstClickRatio, cl.worstClickRatio), worstClickAt: c.worstClickRatio >= cl.worstClickRatio ? c.worstClickAt : cl.worstClickAt }; }
  // per marked span (a beat): rms and peak
  const spans = marks.map((m, i) => {
    const a = Math.max(0, Math.floor(m.t * sr)), b = Math.min(n, Math.floor((marks[i + 1] ? marks[i + 1].t : n / sr) * sr)); let p = 0, q = 0;
    for (const d of chs) for (let k = a; k < b; k++) { const v = Math.abs(d[k]); if (v > p) p = v; q += v * v; }
    const rms = db(Math.sqrt(q / Math.max(1, (b - a) * chs.length)));
    return { name: m.name, from: r1(m.t), seconds: r1((b - a) / sr), peakDb: r1(db(p)), rmsDb: r1(rms), dBA: r1(rms + describe(spectrum(mono, a, b, 4096), sr).aOffsetDb) };
  });
  const sorted = perSec.map((s) => s.rmsDb).sort((a, b) => a - b);
  return { seconds: sec, peakDb: r1(db(peak)), peakAt, rmsDb: r1(db(Math.sqrt(sq / Math.max(1, sec * sr * chs.length)))),
    rmsP10: sorted[Math.floor(sorted.length * 0.1)], rmsP50: sorted[Math.floor(sorted.length * 0.5)], rmsP95: sorted[Math.floor(sorted.length * 0.95)],
    maxRiseDbPer10ms: r1(rise), maxRiseAt: +riseAt.toFixed(2), maxJumpDbPer250ms: r1(jump), maxJumpAt: jumpAt, ...cl, ...describe(spectrum(mono, 0, n, 4096), sr), spans, perSec };
}
// A-weighted level per second of a mono mix, for seeing what the ear gets
export function loudnessPerSecond(chs, sr) {
  const n = chs[0].length, mono = new Float32Array(n), out = []; for (const d of chs) for (let i = 0; i < n; i++) mono[i] += d[i] / chs.length;
  for (let s = 0; (s + 1) * sr <= n; s++) { let q = 0; for (let i = s * sr; i < (s + 1) * sr; i++) q += mono[i] * mono[i]; out.push(Math.round(db(Math.sqrt(q / sr)) + describe(spectrum(mono, s * sr, (s + 1) * sr, 2048), sr).aOffsetDb)); }
  return out;
}
