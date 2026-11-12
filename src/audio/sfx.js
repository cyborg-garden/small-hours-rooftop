// OWNER: C (audio). The sound library. Every sound is a pure function (ctx, out, t0, opts) -> duration in seconds.
// It must work on an OfflineAudioContext as well as a live one (tools/audio.mjs renders each name offline).
// House rule: nothing is sudden. Every envelope has an attack and falls all the way to zero before its source stops.
// The four long layers (bed, wind, stairTone, pad) are built by build*() so the ambience can hold them open and
// steer them; their entries in SOUNDS are a slice of the same graph, so what is measured is what plays.

// ---- buffers (made once per context, seeded, so offline renders repeat exactly) ---------------------
const cache = new WeakMap();
const lcg = (seed) => { let s = Math.max(1, Math.floor(seed) % 2147483646); return () => (s = (s * 16807) % 2147483647) / 2147483647; };
function slot(ctx, key, make) {
  if (!cache.has(ctx)) cache.set(ctx, {});
  const c = cache.get(ctx); return c[key] || (c[key] = make());
}
// white noise, 4 s
export const noiseBuffer = (ctx) => slot(ctx, 'white', () => {
  const len = Math.floor(ctx.sampleRate * 4), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), r = lcg(22222);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
});
// brown-ish noise, 6 s, with its tail folded into its head so the loop point has no step in it
export const softBuffer = (ctx) => slot(ctx, 'soft', () => {
  const sr = ctx.sampleRate, len = Math.floor(sr * 6), x = Math.floor(sr * 0.5), raw = new Float32Array(len + x), r = lcg(9173);
  let y = 0, peak = 0;
  for (let i = 0; i < raw.length; i++) { y = 0.985 * y + (r() * 2 - 1) * 0.12; raw[i] = y; if (Math.abs(y) > peak) peak = Math.abs(y); }
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const k = i < x ? i / x : 1; d[i] = (raw[i] * k + (i < x ? raw[len + i] * (1 - k) : 0)) * (0.9 / peak); }
  return buf;
});
// the roof's echo: 2.4 s of falling noise under 3 kHz, with three faint slaps off the buildings opposite
export const reverbBuffer = (ctx) => slot(ctx, 'verb', () => {
  const sr = ctx.sampleRate, len = Math.floor(sr * 2.4), buf = ctx.createBuffer(2, len, sr), a = 1 - Math.exp(-2 * Math.PI * 3000 / sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), r = lcg(4441 + ch * 977), pre = Math.floor(sr * 0.012), fade = Math.floor(sr * 0.006); let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr; y += a * ((r() * 2 - 1) - y);
      d[i] = y * Math.exp(-t * 2.9) * Math.min(1, (i - pre) / fade) * Math.min(1, (len - i) / (sr * 0.05));
    }
    [[0.055, 0.5], [0.097, 0.34], [0.141, 0.22]].forEach(([at, g], k) => {
      if ((k + ch) % 2) return; const i0 = Math.floor(at * sr), n = Math.floor(sr * 0.004);
      for (let i = 0; i < n; i++) d[i0 + i] += g * 0.5 * Math.sin(Math.PI * i / n) * (r() * 2 - 1);
    });
  }
  return buf;
});

// ---- small parts ------------------------------------------------------------------------------------
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const G = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
// 0 up to peak over a, hold, fall 80 dB over r, then a last few ms to true zero. Never a step.
function env(ctx, out, t0, a, hold, r, peak) {
  const g = ctx.createGain(), p = g.gain;
  p.value = 0;   // shut before t0 as well: a gain is 1 until told otherwise, and a source may start before its envelope
  p.setValueAtTime(0, t0); p.linearRampToValueAtTime(peak, t0 + a);
  p.setValueAtTime(peak, t0 + a + hold); p.exponentialRampToValueAtTime(peak * 1e-4, t0 + a + hold + r);
  p.linearRampToValueAtTime(0, t0 + a + hold + r + 0.012);
  g.connect(out); return g;
}
const END = 0.06;   // sources run this long past their envelope
function src(ctx, buffer, t0, dur, rate = 1, offset = 0) {
  const n = ctx.createBufferSource(); n.buffer = buffer; n.loop = true; n.playbackRate.value = rate;
  n.start(t0, offset % buffer.duration); if (dur != null) n.stop(t0 + dur + END); return n;
}
const noise = (ctx, t0, dur, rate = 1, offset = 0) => src(ctx, noiseBuffer(ctx), t0, dur, rate, offset);
const soft = (ctx, t0, dur, rate = 1, offset = 0) => src(ctx, softBuffer(ctx), t0, dur, rate, offset);
function filt(ctx, type, f, q = 0.7, gain) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (gain != null) b.gain.value = gain; return b;
}
function osc(ctx, type, f, t0, dur) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.start(t0); if (dur != null) o.stop(t0 + dur + END); return o;
}
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
const panner = (ctx, v = 0) => { if (!ctx.createStereoPanner) return G(ctx); const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
// one bead of water: a sine that rises as it rings
function bead(ctx, out, t, f, g, len = 0.07) {
  const o = osc(ctx, 'sine', f, t, len + 0.03); o.frequency.exponentialRampToValueAtTime(f * 1.85, t + len * 0.7);
  o.connect(env(ctx, out, t, 0.009, 0.004, len, g));
}

// ---- the long layers --------------------------------------------------------------------------------
// The city. Low, wide, slow. Left and right are different stretches of the same noise.
export function buildBed(ctx, out, t0, dur) {
  const master = G(ctx, 0), body = G(ctx, 1), m = ctx.createChannelMerger(2), lps = [];
  [0, 1].forEach((ch) => {
    const lp = filt(ctx, 'lowpass', 210, 0.5); lps.push(lp);
    chain(soft(ctx, t0, dur, 1.5 + ch * 0.11, 1.3 + ch * 2.9), filt(ctx, 'highpass', 60, 0.5), lp, G(ctx, 0.2)).connect(m, 0, ch);
  });
  m.connect(body); body.connect(master);
  // air: the hiss of a whole city, barely
  const air = G(ctx, 0.03); chain(noise(ctx, t0, dur, 0.93, 0.7), filt(ctx, 'bandpass', 900, 0.4), air, master);
  // a rooftop fan somewhere to the right: two sines beating, and their octaves so a phone can find it
  const fan = G(ctx, 1), fanPan = panner(ctx, 0.35); fan.connect(fanPan); fanPan.connect(master);
  [[98, 0.0045], [98.7, 0.0045], [196, 0.002], [197.4, 0.002]].forEach(([f, g]) => chain(osc(ctx, 'sine', f, t0, dur), G(ctx, g), fan));
  // the whole bed breathes on a 20 s cycle
  const lfo = osc(ctx, 'sine', 0.05, t0, dur), depth = G(ctx, 0.16); lfo.connect(depth); depth.connect(body.gain);
  master.connect(out);
  return { level: master.gain, air: air.gain, fan: fan.gain, fanPan: fanPan.pan, lp: lps.map((l) => l.frequency) };
}
// Wind: one band of noise that swells and moves, and the leaves that answer it.
export function buildWind(ctx, out, t0, dur) {
  const bp = filt(ctx, 'bandpass', 420, 1.1), g = G(ctx, 0), pan = panner(ctx, 0), level = G(ctx, 1);
  chain(noise(ctx, t0, dur, 0.81, 2.2), bp, g, pan, level, out);
  const hp = filt(ctx, 'highpass', 4600, 0.7), leaf = G(ctx, 0), flutter = G(ctx, 0.6);
  chain(noise(ctx, t0, dur, 1.07, 0.4), hp, flutter, leaf, pan);
  const f1 = osc(ctx, 'sine', 5.3, t0, dur), f2 = osc(ctx, 'sine', 8.9, t0, dur), fd = G(ctx, 0.2); f1.connect(fd); f2.connect(fd); fd.connect(flutter.gain);
  return {
    level: level.gain,
    // one swell: rise for about a third, fall for the rest. lo and hi are the band's travel.
    gust(t, len, strength = 1, lo = 300, hi = 700, p0 = -0.3, p1 = 0.3) {
      g.gain.setTargetAtTime(0.13 * strength, t, len * 0.2); g.gain.setTargetAtTime(0.016, t + len * 0.45, len * 0.2);
      leaf.gain.setTargetAtTime(0.009 * strength, t + len * 0.1, len * 0.15); leaf.gain.setTargetAtTime(0, t + len * 0.45, len * 0.15);
      bp.frequency.setTargetAtTime(hi, t, len * 0.25); bp.frequency.setTargetAtTime(lo, t + len * 0.5, len * 0.25);
      if (pan.pan) { pan.pan.setTargetAtTime(p0, t, len * 0.2); pan.pan.setTargetAtTime(p1, t + len * 0.4, len * 0.3); }
    },
  };
}
// The stairwell: the building asleep under the open hatch. A warm room tone that breathes very slowly.
export function buildStair(ctx, out, t0, dur) {
  const master = G(ctx, 0), body = G(ctx, 0.18), pan = panner(ctx, -0.45);
  chain(soft(ctx, t0, dur, 1.25, 3.7), filt(ctx, 'bandpass', 310, 0.7), filt(ctx, 'lowpass', 760, 0.5), body, master, pan, out);
  chain(osc(ctx, 'sine', 100, t0, dur), G(ctx, 0.0018), master); chain(osc(ctx, 'sine', 200, t0, dur), G(ctx, 0.0008), master);   // the bulkhead lamp
  const lfo = osc(ctx, 'sine', 0.11, t0, dur), depth = G(ctx, 0.065); lfo.connect(depth); depth.connect(body.gain);
  return { level: master.gain, pan: pan.pan };
}
// The pad: someone else knows. Two detuned triangles on D and two on A, under 600 Hz.
export function buildPad(ctx, out, t0, dur) {
  const master = G(ctx, 0), lp = filt(ctx, 'lowpass', 600, 0.5);
  [[146.83, -4, 0.058, -0.35], [146.83, 4, 0.058, 0.35], [220, -3.5, 0.044, 0.25], [220, 3.5, 0.044, -0.25]].forEach(([f, cents, g, p]) => {
    const o = osc(ctx, 'triangle', f, t0, dur); o.detune.value = cents; chain(o, G(ctx, g), panner(ctx, p), lp);
  });
  const lfo = osc(ctx, 'sine', 0.07, t0, dur), depth = G(ctx, 70); lfo.connect(depth); depth.connect(lp.frequency);
  chain(lp, master, out);
  return { level: master.gain };
}

// ---- the sounds -------------------------------------------------------------------------------------
export const SOUNDS = {
  // Marlow's relay. A small dry click with a little solenoid under it.
  tick(ctx, out, t0, { v = 0.5 } = {}) {
    chain(noise(ctx, t0, 0.07, 1, v * 3), filt(ctx, 'bandpass', 1800 * (0.96 + v * 0.08), 3), env(ctx, out, t0, 0.007, 0.005, 0.045, 0.18));
    const o = osc(ctx, 'sine', 230, t0, 0.08); o.frequency.exponentialRampToValueAtTime(170, t0 + 0.06); o.connect(env(ctx, out, t0, 0.008, 0.004, 0.05, 0.012));
    return 0.1;
  },
  // The feed valve opening before the mist: a soft low knock and the line taking pressure.
  valveOpen(ctx, out, t0) {
    const o = osc(ctx, 'sine', 90, t0, 0.2); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.08); o.connect(env(ctx, out, t0, 0.02, 0.03, 0.1, 0.08));
    const o2 = osc(ctx, 'sine', 180, t0, 0.2); o2.frequency.exponentialRampToValueAtTime(120, t0 + 0.08); o2.connect(env(ctx, out, t0, 0.02, 0.02, 0.08, 0.025));
    chain(noise(ctx, t0, 0.3, 1, 1.1), filt(ctx, 'highpass', 2500), env(ctx, out, t0 + 0.02, 0.05, 0.03, 0.2, 0.012));
    return 0.32;
  },
  // Mist over the beds. Two sides, never quite the same, fading in over most of a second.
  mist(ctx, out, t0, { dur = 5.6, near = false } = {}) {
    const g = env(ctx, out, t0, 0.8, Math.max(0.1, dur - 2), 1.2, near ? 0.05 : 0.042), m = ctx.createChannelMerger(2);
    [0, 1].forEach((ch) => {
      const side = G(ctx, 0.85), lfo = osc(ctx, 'sine', 0.61 + ch * 0.27, t0, dur), d = G(ctx, 0.14); lfo.connect(d); d.connect(side.gain);
      chain(noise(ctx, t0, dur, 1 + ch * 0.06, ch * 1.7 + (near ? 0.9 : 0)), filt(ctx, 'highpass', 3200), filt(ctx, 'peaking', near ? 5400 : 6200, 0.8, 5), filt(ctx, 'lowpass', near ? 10500 : 9000, 0.5), side).connect(m, 0, ch);
    });
    m.connect(g); return dur;
  },
  // Marlow speaking. A log line, not a voice. up: 660 then 880. The others are what it does with a leak.
  blip(ctx, out, t0, { variant = 'up', down = false } = {}) {
    const fs = { up: [660, 880], down: [880, 660], again: [880, 660, 660], seal: [880, 660, 495], wake: [660, 880, 1320], flat: [660, 660] }[down ? 'down' : variant] || [660, 880];
    fs.forEach((f, i) => {
      const t = t0 + i * 0.115, last = i === fs.length - 1;
      osc(ctx, 'sine', f, t, 0.4).connect(env(ctx, out, t, 0.018, 0.035, last ? 0.22 : 0.13, 0.1 * Math.pow(660 / f, 0.5)));
    });
    return 0.2 + fs.length * 0.115 + 0.15;
  },
  // A foot. Jo is in slippers on roof membrane; the neighbour is in work boots on wooden stairs.
  step(ctx, out, t0, { foot = 0, surface = 'deck', who = 'jo', v = 0.5 } = {}) {
    const tam = who === 'tam', k = (tam ? 0.84 : 1) * (0.95 + v * 0.1), len = tam ? 1.4 : 1, g = (tam ? 1.2 : 1) * (0.85 + v * 0.3);
    const stair = surface === 'stair';
    chain(soft(ctx, t0, 0.2 * len, 1.4, v * 5), filt(ctx, 'lowpass', (stair ? 700 : 420) * k), env(ctx, out, t0, 0.011, 0.008, 0.09 * len, (stair ? 0.11 : 0.06) * g));
    osc(ctx, 'sine', ((stair ? 150 : 105) + foot * 9) * k, t0, 0.16 * len).connect(env(ctx, out, t0, 0.011, 0.008, 0.07 * len, (stair ? 0.036 : 0.02) * g));
    if (stair) chain(noise(ctx, t0, 0.1, 1, v * 2 + foot), filt(ctx, 'bandpass', 520 * k, 4), env(ctx, out, t0, 0.011, 0.006, 0.06 * len, 0.26 * g));   // the tread
    else chain(noise(ctx, t0, 0.08, 1, v * 2 + foot), filt(ctx, 'bandpass', 950, 1.2), env(ctx, out, t0, 0.011, 0.004, 0.045, 0.15 * g));              // the slipper
    return 0.22 * len;
  },
  // The cup going into the barrel: it breaks the surface, sloshes, three bubbles come up, two drops fall back.
  scoop(ctx, out, t0, { source = 'barrel' } = {}) {
    const bucket = source === 'bucket', lo = bucket ? 500 : 620;
    const f = filt(ctx, 'bandpass', lo, 1.1); f.frequency.setValueAtTime(lo, t0); f.frequency.linearRampToValueAtTime(lo + 280, t0 + 0.5);
    chain(noise(ctx, t0, 0.85, 0.6, 0.3), f, env(ctx, out, t0, 0.06, 0.25, 0.45, 0.15));
    const o = osc(ctx, 'sine', 210, t0, 0.3); o.frequency.exponentialRampToValueAtTime(128, t0 + 0.2); o.connect(env(ctx, out, t0 + 0.01, 0.03, 0.03, 0.18, 0.05));
    for (let i = 0; i < (bucket ? 2 : 3); i++) {
      const t = t0 + 0.12 + i * 0.13, b = osc(ctx, 'sine', 380 + i * 60, t, 0.14); b.frequency.exponentialRampToValueAtTime(820 + i * 90, t + 0.09);
      b.connect(env(ctx, out, t, 0.015, 0.01, 0.09, 0.06));
    }
    bead(ctx, out, t0 + 0.78, 1150, 0.022); bead(ctx, out, t0 + 1.02, 1380, 0.014);
    return 1.25;
  },
  // Copper on the barrel lip. A small FM bell.
  cupRing(ctx, out, t0) {
    const c = osc(ctx, 'sine', 1240, t0, 1.0), m = osc(ctx, 'sine', 1240 * 2.76, t0, 1.0), d = G(ctx, 0);
    d.gain.setValueAtTime(900, t0); d.gain.exponentialRampToValueAtTime(30, t0 + 0.35); m.connect(d); d.connect(c.frequency);
    c.connect(env(ctx, out, t0, 0.014, 0.008, 0.9, 0.09));
    return 1.0;
  },
  // The cup scraping the bottom of an empty barrel. Hollow.
  dry(ctx, out, t0) {
    const c = osc(ctx, 'sine', 310, t0, 0.4), m = osc(ctx, 'sine', 310 * 1.41, t0, 0.4), d = G(ctx, 0);
    d.gain.setValueAtTime(230, t0); d.gain.exponentialRampToValueAtTime(40, t0 + 0.3); m.connect(d); d.connect(c.frequency);
    c.connect(env(ctx, out, t0, 0.022, 0.06, 0.22, 0.05));
    const bp = filt(ctx, 'bandpass', 1700, 2.5); bp.frequency.setValueAtTime(1700, t0); bp.frequency.exponentialRampToValueAtTime(1050, t0 + 0.3);
    const rough = G(ctx, 0.6), am = osc(ctx, 'sine', 37, t0, 0.4), ad = G(ctx, 0.4); am.connect(ad); ad.connect(rough.gain);
    chain(noise(ctx, t0, 0.35, 1, 1.9), bp, rough, env(ctx, out, t0 + 0.01, 0.03, 0.12, 0.16, 0.15));
    chain(soft(ctx, t0, 0.75, 2.2, 0.8), filt(ctx, 'bandpass', 132, 7), env(ctx, out, t0 + 0.02, 0.04, 0.08, 0.6, 0.2));   // the empty barrel answering
    return 0.75;
  },
  // The brass tap on line two: a thin stream into the cup, and the cup's note rising as it fills.
  valveFill(ctx, out, t0, { dur = 2.5 } = {}) {
    chain(noise(ctx, t0, dur, 1, 0.5), filt(ctx, 'bandpass', 3000, 3), env(ctx, out, t0, 0.12, dur - 0.5, 0.36, 0.1));
    const res = filt(ctx, 'bandpass', 500, 14); res.frequency.setValueAtTime(500, t0); res.frequency.exponentialRampToValueAtTime(1100, t0 + dur);
    chain(noise(ctx, t0, dur, 0.9, 2.6), res, env(ctx, out, t0 + 0.1, 0.2, dur - 0.7, 0.36, 0.8));
    const o = osc(ctx, 'sine', 500, t0, dur); o.frequency.exponentialRampToValueAtTime(1100, t0 + dur); o.connect(env(ctx, out, t0 + 0.15, 0.3, dur - 0.9, 0.4, 0.03));
    const r = lcg(31);
    for (let t = 0.25; t < dur - 0.4; t += 0.09 + r() * 0.08) bead(ctx, out, t0 + t, 700 + r() * 500 + (t / dur) * 500, 0.03, 0.045);
    return dur;
  },
  // The pour. A ribbon of water, the weight of it landing, bubbles, and the pitch climbing as the pot fills,
  // which is what makes it feel like enough. Then the last drops off the lip of the cup.
  pour(ctx, out, t0, { dur = 1.55, seed = 7, tail = true } = {}) {
    const f = filt(ctx, 'bandpass', 1100, 1.3); f.frequency.setValueAtTime(1100, t0); f.frequency.exponentialRampToValueAtTime(2300, t0 + dur);
    chain(noise(ctx, t0, dur, 1, seed * 0.37), f, env(ctx, out, t0, 0.12, dur - 0.44, 0.32, 0.27));
    const f2 = filt(ctx, 'bandpass', 360, 0.9); f2.frequency.setValueAtTime(360, t0); f2.frequency.exponentialRampToValueAtTime(540, t0 + dur);
    chain(soft(ctx, t0, dur, 2.4, seed * 0.61), f2, env(ctx, out, t0 + 0.04, 0.16, dur - 0.52, 0.3, 0.26));
    chain(noise(ctx, t0, dur, 1.1, seed * 0.83 + 1), filt(ctx, 'highpass', 4800), env(ctx, out, t0 + 0.02, 0.2, dur - 0.55, 0.3, 0.02));
    const r = lcg(seed * 131 + 17);
    for (let t = 0.1; t < dur - 0.2; t += 0.04 + r() * 0.032) {
      const k = t / dur, f0 = 480 + r() * 620 + k * 720, len = 0.045 + r() * 0.03;
      const o = osc(ctx, 'sine', f0, t0 + t, len + 0.03); o.frequency.exponentialRampToValueAtTime(f0 * (1.5 + r() * 0.4), t0 + t + len * 0.8);
      o.connect(env(ctx, out, t0 + t, 0.012, 0.004, len, (0.022 + r() * 0.02) * Math.sin(Math.PI * Math.min(1, k * 1.15))));
    }
    if (!tail) return dur;
    bead(ctx, out, t0 + dur + 0.1, 1500, 0.026); bead(ctx, out, t0 + dur + 0.36, 1720, 0.018); bead(ctx, out, t0 + dur + 0.82, 1960, 0.011);
    return dur + 1.0;
  },
  // Soil drinking: a high fizz and a few grains settling. Very quiet.
  soil(ctx, out, t0, { dur = 1.5, seed = 3 } = {}) {
    chain(noise(ctx, t0, dur, 1, seed * 0.29), filt(ctx, 'highpass', 5000), env(ctx, out, t0, 0.15, 0.2, dur - 0.36, 0.014));
    const r = lcg(seed * 77 + 5);
    for (let i = 0; i < 12; i++) {
      const t = t0 + 0.1 + r() * (dur - 0.5);
      chain(noise(ctx, t, 0.04, 1, r() * 3), filt(ctx, 'bandpass', 5200 + r() * 3200, 6), env(ctx, out, t, 0.005, 0.002, 0.022, 0.022 * (1 - (t - t0) / dur)));
    }
    return dur;
  },
  // A page turning: two soft brushes of paper, the second shorter, and a tap as it lands.
  page(ctx, out, t0, { seed = 9 } = {}) {
    const r = lcg(seed * 31 + 7);
    chain(noise(ctx, t0, 0.22, 1, r() * 2), filt(ctx, 'bandpass', 2600 + r() * 600, 1.1), env(ctx, out, t0, 0.07, 0.03, 0.12, 0.05));
    chain(noise(ctx, t0 + 0.3, 0.14, 1, r() * 2), filt(ctx, 'bandpass', 3400, 1.4), env(ctx, out, t0 + 0.3, 0.04, 0.02, 0.08, 0.034));
    chain(noise(ctx, t0 + 0.46, 0.05, 1, r() * 2), filt(ctx, 'lowpass', 900), env(ctx, out, t0 + 0.46, 0.012, 0.006, 0.03, 0.03));
    return 0.6;
  },
  // One pot's note. Felt and wood, long tail. A plant that has grown rings fuller and longer.
  // strict: the same note as a music box plays it. Shorter, harder, exactly alike every time.
  potNote(ctx, out, t0, { midi = 69, gain = 1, growth = 0, strict = false, attack = 0.016 } = {}) {
    const f = mtof(midi), k = gain * Math.min(1, Math.pow(440 / f, 0.25)), decay = strict ? 1.25 : 2.4 + growth * 0.3;
    if (strict) osc(ctx, 'sine', f, t0, decay).connect(env(ctx, out, t0, attack, 0.012, decay, 0.16 * k));
    else for (const c of [-1.3, 1.3]) { const o = osc(ctx, 'sine', f, t0, decay + 0.1); o.detune.value = c; o.connect(env(ctx, out, t0, attack, 0.02, decay, 0.08 * k)); }
    osc(ctx, 'sine', f * 2, t0, 1.4).connect(env(ctx, out, t0, attack, 0.01, strict ? 0.7 : 1.1 + growth * 0.15, (strict ? 0.076 : 0.057 + growth * 0.01) * k));
    if (growth >= 2 && !strict) osc(ctx, 'sine', f * 3, t0, 1.8).connect(env(ctx, out, t0, attack + 0.01, 0.01, 1.5, 0.017 * k));
    osc(ctx, 'sine', f * 4.2, t0, 0.14).connect(env(ctx, out, t0, Math.min(attack, 0.012), 0.005, strict ? 0.09 : 0.07, (strict ? 0.05 : 0.034) * k));
    return decay + 0.1;
  },
  // The tray: wood set down on wood.
  tray(ctx, out, t0, { quiet = false } = {}) {
    const g = quiet ? 0.5 : 1;
    [[0, 180, 1], [0.075, 205, 0.45]].forEach(([dt, f, a]) => {
      const t = t0 + dt, o = osc(ctx, 'sine', f, t, 0.12); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.06);
      o.connect(env(ctx, out, t, 0.013, 0.008, 0.06, 0.14 * a * g));
      chain(noise(ctx, t, 0.08, 1, dt * 9), filt(ctx, 'lowpass', 900), env(ctx, out, t, 0.012, 0.004, 0.04, 0.05 * a * g));
    });
    return 0.3;
  },
  // Terracotta against terracotta, three times.
  clink(ctx, out, t0, { n = 3 } = {}) {
    [[0, 2200], [0.13, 2650], [0.31, 1950]].slice(0, n).forEach(([dt, f], i) => {
      const t = t0 + dt, a = 1 - i * 0.2;
      chain(noise(ctx, t, 0.07, 1, i * 0.9), filt(ctx, 'bandpass', f, 8), env(ctx, out, t, 0.013, 0.004, 0.05, 0.5 * a));
      osc(ctx, 'sine', f, t, 0.1).connect(env(ctx, out, t, 0.011, 0.003, 0.07, 0.02 * a));
    });
    return 0.5;
  },
  // A door, four floors down: a thump with a slow front, then a small latch. Heard through the building.
  door(ctx, out, t0) {
    const lp = filt(ctx, 'lowpass', 700, 0.5); lp.connect(out);
    const o = osc(ctx, 'sine', 70, t0, 0.4); o.frequency.exponentialRampToValueAtTime(54, t0 + 0.2); o.connect(env(ctx, lp, t0, 0.024, 0.03, 0.24, 0.085));
    osc(ctx, 'sine', 140, t0, 0.3).connect(env(ctx, lp, t0, 0.024, 0.02, 0.14, 0.035));
    chain(soft(ctx, t0, 0.3, 2.6, 2.2), filt(ctx, 'lowpass', 420), env(ctx, lp, t0, 0.024, 0.02, 0.18, 0.3));
    chain(noise(ctx, t0 + 0.17, 0.06, 1, 0.2), filt(ctx, 'bandpass', 1100, 3), env(ctx, out, t0 + 0.17, 0.008, 0.003, 0.035, 0.07));
    return 0.5;
  },
  // The sensor stake going into soil.
  stake(ctx, out, t0) {
    chain(soft(ctx, t0, 0.2, 2.0, 4.1), filt(ctx, 'lowpass', 300), env(ctx, out, t0, 0.03, 0.03, 0.12, 0.3));
    chain(noise(ctx, t0, 0.15, 1, 3.3), filt(ctx, 'bandpass', 1800, 1.5), env(ctx, out, t0 + 0.005, 0.015, 0.02, 0.08, 0.016));
    return 0.3;
  },
  // Begin, and the choice: two pot voices with a slow front.
  dyad(ctx, out, t0, { notes = [62, 69], gain = 1 } = {}) {
    notes.forEach((m, i) => SOUNDS.potNote(ctx, out, t0 + i * 0.045, { midi: m, gain: 0.46 * gain, attack: 0.06, growth: 1 }));
    return 3.0;
  },
  // One drop off an empty cup.
  drip(ctx, out, t0, { f = 1300, gain = 1 } = {}) { bead(ctx, out, t0, f, 0.03 * gain); return 0.14; },
  // A far train: a low swell with wheels in it, crossing slowly. Sometimes it sounds its horn once, on A.
  train(ctx, out, t0, { dur = 17, horn = false, from = -0.55, to = 0.5 } = {}) {
    const pan = panner(ctx, from), trem = G(ctx, 0.72), wob = osc(ctx, 'sine', 3, t0, dur), wd = G(ctx, 0.26); wob.connect(wd); wd.connect(trem.gain);
    if (pan.pan) { pan.pan.setValueAtTime(from, t0); pan.pan.linearRampToValueAtTime(to, t0 + dur); }
    const g = G(ctx, 0); g.gain.setValueAtTime(0, t0); g.gain.setTargetAtTime(1, t0 + 0.05, 2.7); g.gain.setTargetAtTime(0, t0 + 8, 2.2);
    chain(soft(ctx, t0, dur, 0.5, 4.4), filt(ctx, 'lowpass', 92, 0.6), G(ctx, 0.09), trem); chain(soft(ctx, t0, dur, 1.3, 0.9), filt(ctx, 'bandpass', 260, 0.8), G(ctx, 0.5), trem);
    chain(trem, g, env(ctx, pan, t0, 0.05, dur - 1.6, 1.5, 1));
    pan.connect(out);
    if (horn) [[220, 0.014], [277.18, 0.01], [440, 0.0025]].forEach(([f, a]) => {
      chain(osc(ctx, 'triangle', f, t0 + 4.5, 3.4), filt(ctx, 'lowpass', 650, 0.5), env(ctx, pan, t0 + 4.5, 0.4, 0.9, 1.8, a));
    });
    return dur;
  },
  // A far car: the city turning over once.
  car(ctx, out, t0, { dur = 7, from = 0.4, to = -0.3 } = {}) {
    const pan = panner(ctx, from), bp = filt(ctx, 'bandpass', 420, 0.8), g = G(ctx, 0);
    if (pan.pan) { pan.pan.setValueAtTime(from, t0); pan.pan.linearRampToValueAtTime(to, t0 + dur); }
    bp.frequency.setValueAtTime(430, t0); bp.frequency.linearRampToValueAtTime(300, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.setTargetAtTime(0.2, t0 + 0.05, dur * 0.16); g.gain.setTargetAtTime(0, t0 + dur * 0.42, dur * 0.11);
    chain(soft(ctx, t0, dur, 1.7, 1.1), bp, g, env(ctx, pan, t0, 0.05, dur - 1.1, 1.0, 1));
    pan.connect(out);
    return dur;
  },
  // First light: one bird, three or four notes, far off.
  bird(ctx, out, t0, { seed = 1 } = {}) {
    const r = lcg(seed * 53 + 11), n = 3 + (r() > 0.5 ? 1 : 0); let t = t0;
    for (let i = 0; i < n; i++) {
      const len = 0.07 + r() * 0.045, up = r() > 0.3, f0 = 2500 + r() * 500, f1 = 3400 + r() * 600;
      const o = osc(ctx, 'sine', up ? f0 : f1, t, len + 0.05); o.frequency.exponentialRampToValueAtTime(up ? f1 : f0, t + len);
      o.connect(env(ctx, out, t, 0.014, 0.006, len, 0.03 * (0.7 + r() * 0.5)));
      t += len + 0.07 + r() * 0.07;
    }
    return t - t0 + 0.15;
  },
  // Slices of the long layers, for measuring.
  bed(ctx, out, t0, { dur = 8 } = {}) {
    const e = env(ctx, out, t0, 0.05, dur - 1.6, 1.5, 1); buildBed(ctx, e, t0, dur).level.setTargetAtTime(1, t0, 0.7);
    return dur;
  },
  wind(ctx, out, t0, { dur = 11 } = {}) { const e = env(ctx, out, t0, 0.05, dur - 1.6, 1.5, 1); buildWind(ctx, e, t0, dur).gust(t0, dur - 1, 1, 300, 700, -0.3, 0.3); return dur; },
  stairTone(ctx, out, t0, { dur = 8 } = {}) { const e = env(ctx, out, t0, 0.05, dur - 1.6, 1.5, 1); buildStair(ctx, e, t0, dur).level.setTargetAtTime(1, t0, 0.6); return dur; },
  pad(ctx, out, t0, { dur = 14 } = {}) { const e = env(ctx, out, t0, 0.05, dur - 3.1, 3.0, 1); buildPad(ctx, e, t0, dur).level.setTargetAtTime(1, t0, 2.0); return dur; },
};
// Where each sound goes by default: which bus, how much into the roof's echo, and a trim so the table of levels
// (BIBLE.md section 5) is met at the output. Callers may override any of it.
export const META = {
  tick: { send: 0.1, gain: 1 }, valveOpen: { send: 0.05, gain: 1 }, mist: { send: 0.05, gain: 1 }, blip: { send: 0.22, gain: 1 },
  step: { send: 0.06, gain: 1 }, scoop: { send: 0.1, gain: 1.6 }, cupRing: { send: 0.3, gain: 1 }, dry: { send: 0.28, gain: 1.6 },
  valveFill: { send: 0.08, gain: 0.7 }, pour: { send: 0.1, gain: 0.9 }, soil: { send: 0, gain: 1 }, potNote: { send: 0.25, gain: 1, bus: 'music' },
  tray: { send: 0.1, gain: 1.3 }, clink: { send: 0.16, gain: 1 }, door: { send: 0.3, gain: 1 }, stake: { send: 0.06, gain: 1 },
  dyad: { send: 0.3, gain: 1, bus: 'music' }, drip: { send: 0.2, gain: 1 }, train: { send: 0.2, gain: 1, bus: 'amb' }, car: { send: 0.1, gain: 1, bus: 'amb' },
  bird: { send: 0.4, gain: 1, bus: 'amb' }, bed: { send: 0, gain: 1, bus: 'amb' }, wind: { send: 0, gain: 1, bus: 'amb' },
  stairTone: { send: 0, gain: 1, bus: 'amb' }, pad: { send: 0.1, gain: 1, bus: 'music' }, page: { send: 0.12, gain: 1 },
};
export const SOUND_NAMES = Object.keys(SOUNDS);
