// OWNER: C (audio). The mixer. One of these is built on the live context after Begin, and one on an offline
// context for every measurement, so what is measured is the same graph the player hears.
//
//   voices -> [amb | fx | music] -> duck gains -> scene -> volume -> limiter -> trim -> soft ceiling -> out
//                     \-> send -> convolver (the roof's echo) -> scene
//
// The limiter is a safety net, not a sound. The mix is built to sit under it: see the level table in BIBLE.md.
import { SOUNDS, META, reverbBuffer } from './sfx.js';
import { TV } from '../core/surface.js';

export const TRIM = 0.5;   // after the limiter. The compressor adds its own make-up gain; this takes most of it back.

// On the console the sound comes out of TV speakers, which carry next to nothing under about 150 Hz. The same mix,
// voiced for them: what they can carry goes through a little louder, and what they cannot (footsteps on the stairs,
// the door, the barrel, the low of the pad) is folded up an octave and more, so it is heard as its own overtones.
//
//   in -> high-pass 140 -----------------------------\
//   in -> low-pass 190 -> fold (|x|) -> band 150..900 -> lift -> out
export const TV_VOICE = { cut: 140, low: 170, fold: 1.3, lift: 1.5 };
export function tvVoicing(ctx) {
  const V = TV_VOICE, inp = ctx.createGain(), out = ctx.createGain(); out.gain.value = V.lift;
  const filt = (type, f, q = 0.707) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const hp = filt('highpass', V.cut); inp.connect(hp); hp.connect(out);
  // |x| has no fundamental: a tone at f comes out at 2f, 4f, 6f, as loud as it went in, however quiet it is
  const fold = ctx.createWaveShaper(), n = 4097, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.abs((i / (n - 1)) * 2 - 1);
  fold.curve = curve; fold.oversample = '4x';
  const lo = filt('lowpass', V.low), lo2 = filt('lowpass', V.low), up = filt('highpass', 150), up2 = filt('highpass', 150), top = filt('lowpass', 900), g = ctx.createGain(); g.gain.value = V.fold;
  inp.connect(lo); lo.connect(lo2); lo2.connect(fold); fold.connect(up); up.connect(up2); up2.connect(top); top.connect(g); g.connect(out);
  return { input: inp, output: out };
}

export function masterChain(ctx, volume, tv = false) {
  const vol = ctx.createGain(); vol.gain.value = volume;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -14; lim.knee.value = 6; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
  const trim = ctx.createGain(); trim.gain.value = TRIM;
  // last of all, a ceiling that is a straight line below half scale and bends above it. It never works in normal play.
  const shaper = ctx.createWaveShaper(), n = 2049, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); curve[i] = Math.sign(x) * (a <= 0.5 ? a : 0.5 + 0.38 * Math.tanh((a - 0.5) / 0.38)); }
  shaper.curve = curve;
  vol.connect(lim); lim.connect(trim); trim.connect(shaper); shaper.connect(ctx.destination);
  if (tv) { const voice = tvVoicing(ctx); voice.output.connect(vol); return { input: voice.input, volume: vol.gain, output: shaper }; }
  return { input: vol, volume: vol.gain, output: shaper };
}

export function createEngine(ctx, { volume = 0.6, solo = null, tv = TV } = {}) {
  const master = masterChain(ctx, volume, tv);
  const scene = ctx.createGain(); scene.connect(master.input);
  const mk = (name) => {
    const bus = ctx.createGain(), duck = ctx.createGain();
    bus.gain.value = solo && solo !== name ? 0 : 1; bus.connect(duck); duck.connect(scene);
    return { bus, duck: duck.gain };
  };
  const amb = mk('amb'), fx = mk('fx'), music = mk('music');
  const buses = { amb: amb.bus, fx: fx.bus, music: music.bus };
  const verbIn = ctx.createGain(), verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
  const verb = ctx.createConvolver(); verb.buffer = reverbBuffer(ctx);
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(scene);
  // each bus has its own way into the echo, so a soloed render keeps only its own tail
  const sends = {};
  for (const k of Object.keys(buses)) { sends[k] = ctx.createGain(); sends[k].gain.value = solo && solo !== k ? 0 : 1; sends[k].connect(verbIn); }

  let live = [], tap = null;
  const pan = (v) => { if (!ctx.createStereoPanner) return null; const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.85, Math.min(0.85, v)); return p; };
  return {
    ctx, buses, scene: scene.gain, volume: master.volume, voices: () => live.length,
    // what is leaving the mixer right now (tests only: proves the live graph is sounding, without a speaker)
    meter() {
      if (!tap) { tap = ctx.createAnalyser(); tap.fftSize = 2048; master.output.connect(tap); return { peakDb: -120, rmsDb: -120 }; }
      const d = new Float32Array(tap.fftSize); tap.getFloatTimeDomainData(d); let p = 0, q = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; q += a * a; }
      return { peakDb: +(20 * Math.log10(Math.max(p, 1e-6))).toFixed(1), rmsDb: +(20 * Math.log10(Math.max(Math.sqrt(q / d.length), 1e-6))).toFixed(1) };
    },
    // Play one named sound at time t. opts: gain, pan (-1..1), send (0..1 into the echo), lp (low-pass Hz, for
    // things heard through the stairwell), bus, and whatever the sound itself takes.
    voice(name, opts = {}, t = ctx.currentTime + 0.03) {
      const fn = SOUNDS[name]; if (!fn) return 0;
      const m = META[name] || {}, busName = opts.bus || m.bus || 'fx';
      const p = opts.pan ? pan(opts.pan) : null;
      // a panned sound keeps the peak it has unpanned: its louder side is never above what tools/audio.mjs measured
      const hold = p ? 1 / Math.sin((Math.abs(p.pan.value) + 1) * Math.PI / 4) : 1;
      const g = ctx.createGain(); g.gain.value = (opts.gain ?? 1) * (m.gain ?? 1) * hold;
      const nodes = [g]; let tail = g;
      if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = 0.5; tail.connect(f); tail = f; nodes.push(f); }
      if (p) { tail.connect(p); p.connect(buses[busName]); nodes.push(p); } else tail.connect(buses[busName]);
      const send = opts.send ?? m.send ?? 0;
      if (send > 0) { const s = ctx.createGain(); s.gain.value = send; tail.connect(s); s.connect(sends[busName]); nodes.push(s); }
      const dur = fn(ctx, g, Math.max(t, ctx.currentTime), { ...opts, gain: undefined }) || 1;   // gain is applied once, here
      live.push({ nodes, end: t + dur + 0.6 });
      return dur;
    },
    // let go of finished voices so the graph stays small over a long night
    sweep(now = ctx.currentTime) {
      if (!live.some((v) => v.end <= now)) return;
      live = live.filter((v) => { if (v.end > now) return true; for (const n of v.nodes) { try { n.disconnect(); } catch (_) {} } return false; });
    },
    // dip a bus and let it come back: depth is the gain while ducked
    duck(busName, depth, t, hold, tauIn = 0.12, tauOut = 0.6) {
      const p = { amb: amb.duck, fx: fx.duck, music: music.duck }[busName]; if (!p) return;
      p.setTargetAtTime(depth, t, tauIn); p.setTargetAtTime(1, t + hold, tauOut);
    },
  };
}
