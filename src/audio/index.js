// OWNER: C (audio). createAudio(state, bus) -> { start(), update(dt), play(name, opts), setVolume(v), setMuted(bool),
//   names, renderOffline(name, opts) }.
// Nothing sounds before EV.BEGIN (the first click or tap). Audio hears the game only through the bus and reads state.
//
//   sfx.js       every sound, as a pure function of (ctx, out, t0, opts)
//   engine.js    buses, the roof's echo, ducking, the limiter
//   ambience.js  the continuous night: city, wind, stairwell, cars, train, birds
//   music.js     the garden tune and its two endings, and the pad
//   cues.js      bus events and state, turned into the calls above. createRig() builds the lot on any context.
//   measure.js   numbers for tests
//
// renderOffline(name) renders one sound through the real mixer on an OfflineAudioContext and returns measurements.
// It also answers four test commands, so the bridge needs no changes (see NOTES-C.md):
//   '@record' { on }                  start or stop recording bus events with state snapshots
//   '@scene'  { from, to, sr, solo }  render the recording offline through the whole instrument and measure it
//   '@chain'  {}                      the master chain alone: small-signal gain, ceiling under abuse
//   '@status' {}                      live context state, voices in flight, errors swallowed
import { EV } from '../core/events.js';
import { SOUNDS, SOUND_NAMES, META } from './sfx.js';
import { createEngine } from './engine.js';
import { createRig, snap } from './cues.js';
import { analyse, analyseScene, loudnessPerSecond } from './measure.js';

export function createAudio(state, bus) {
  let ctx = null, rig = null, rec = null, recPoll = 0, ahead = 0, lastCtx = 0, warp = false;
  const errors = [];
  const note = (e) => { if (errors.length < 20) errors.push(String(e && e.stack || e)); };
  const now = () => ctx.currentTime + 0.03;
  const level = () => (state.muted ? 0 : state.volume);

  function start() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); rig = createRig(ctx, { volume: level(), seed: state.seed }); lastCtx = ctx.currentTime;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { note(e); ctx = null; rig = null; }
  }
  // a context that was refused at Begin (no gesture) may be woken by the next real one
  const wake = () => { if (ctx && ctx.state === 'suspended' && !state.paused) ctx.resume().catch(() => {}); };
  try { for (const n of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(n, wake, { passive: true }); } catch (_) {}

  bus.on('*', (name, payload) => {
    if (name === EV.BEGIN) { start(); if (rec) rec.length = 0; }
    if (rec) rec.push({ t: state.time, name, payload: payload ? { ...payload } : {}, view: snap(state) });
    if (name === EV.PAUSE) { if (ctx) ctx.suspend().catch(() => {}); return; }
    if (name === EV.RESUME) { if (ctx && state.begun) ctx.resume().catch(() => {}); return; }
    if (!rig || warp || ctx.state !== 'running') return;
    try { rig.handle(name, payload, now(), state); } catch (e) { note(e); }
  });

  // ---- offline ------------------------------------------------------------------------------------
  async function renderSound(name, opts) {
    const sr = opts.sr || 44100, probe = new OfflineAudioContext(1, 128, sr);
    const send = opts.send ?? (META[name] || {}).send ?? 0;
    const dur = (SOUNDS[name](probe, probe.createGain(), 0, opts) || 1) + (send > 0 ? 2.5 : 0.3);
    const off = new OfflineAudioContext(2, Math.ceil((dur + 0.05) * sr), sr), eng = createEngine(off, { volume: opts.volume ?? 0.6 });
    eng.voice(name, opts, 0.05);
    const buf = await off.startRendering();
    const chs = [buf.getChannelData(0), buf.getChannelData(1)], res = { name, seconds: +dur.toFixed(2), ...analyse(chs, sr) };
    if (opts.env) {   // peak per window, in dB, for looking at the shape of a sound
      const w = Math.round(sr * (opts.envMs || 10) / 1000); res.env = [];
      for (let i = 0; i + w <= chs[0].length; i += w) { let p = 0; for (const d of chs) for (let k = i; k < i + w; k++) p = Math.max(p, Math.abs(d[k])); res.env.push(Math.round(20 * Math.log10(Math.max(p, 1e-6)))); }
    }
    return res;
  }
  // The recording, replayed through a fresh instrument on an offline context, half a second at a time.
  async function renderScene(opts) {
    const records = opts.records || rec; if (!records || !records.length) return { error: 'nothing recorded' };
    const from = opts.from ?? 0, to = opts.to ?? records[records.length - 1].t + 3, sr = opts.sr || 32000, dur = to - from;
    const off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr), r = createRig(off, { volume: opts.volume ?? 0.6, seed: opts.seed ?? state.seed, solo: opts.solo || null });
    let i = records.findIndex((x) => x.t >= from), last = null; if (i < 0) i = records.length;
    const CH = 0.5, marks = [], faults = [];
    if (from > 0 && records[i]) r.sync(records[i].view, 0.02);
    const pump = (T) => {
      try {
        while (i < records.length && records[i].t - from < T + CH && records[i].t < to) {
          const x = records[i++], t = Math.max(T, x.t - from) + 0.02; last = x.view;
          if (x.name) { r.handle(x.name, x.payload, t, x.view); if (x.name === EV.BEAT_ENTER) marks.push({ t: x.t - from, name: x.payload.beat }); }
          r.tick(x.view, t);
        }
        if (last) r.tick(last, T + CH - 0.26);
      } catch (e) { if (faults.length < 5) faults.push(String(e && e.stack || e)); }
    };
    pump(0);
    for (let T = CH; T < dur - 0.05; T += CH) off.suspend(T).then(() => { pump(T); off.resume(); }).catch((e) => faults.push(String(e)));
    const buf = await off.startRendering();
    const chs = [buf.getChannelData(0), buf.getChannelData(1)], res = analyseScene(chs, sr, marks);
    if (!opts.perSec) delete res.perSec; else res.dbaPerSec = loudnessPerSecond(chs, sr);
    if (opts.env) {   // peak per window, in dB: the shape of a passage
      const w = Math.round(sr * (opts.envMs || 100) / 1000); res.env = [];
      for (let k = 0; k + w <= chs[0].length; k += w) { let p = 0; for (const d of chs) for (let j = k; j < k + w; j++) p = Math.max(p, Math.abs(d[j])); res.env.push(Math.round(20 * Math.log10(Math.max(p, 1e-6)))); }
    }
    return { from, to, sr, solo: opts.solo || null, events: records.filter((x) => x.name).length, faults, ...res };
  }
  // The master chain by itself. A quiet sine tells us its gain; a wall of everything at once tells us its ceiling.
  async function renderChain() {
    const sr = 44100, run = async (build, secs) => {
      const off = new OfflineAudioContext(2, sr * secs, sr), eng = createEngine(off, { volume: 0.6 }); build(off, eng);
      const b = await off.startRendering(); return analyse([b.getChannelData(0), b.getChannelData(1)], sr, { deep: false });
    };
    const sine = (amp) => (off, eng) => { const o = off.createOscillator(), g = off.createGain(); o.frequency.value = 1000; g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(amp, 0.2); o.connect(g); g.connect(eng.buses.fx); o.start(0); };
    const quiet = await run(sine(0.01), 2), loud = await run(sine(4), 2);
    const abuse = await run((off, eng) => { for (let k = 0; k < 40; k++) { eng.voice('pour', { seed: k + 1 }, 0.1 + k * 0.01); eng.voice('potNote', { midi: 62 + (k % 12) }, 0.5 + k * 0.01); eng.voice('step', {}, 0.6); } }, 4);
    return { smallSignalGainDb: +(quiet.peakDb - 20 * Math.log10(0.01)).toFixed(1), fullScaleSineIn12dBHotPeakDb: loud.peakDb, fortyPoursAtOncePeakDb: abuse.peakDb, fortyPoursMaxRise: abuse.maxRiseDbPer10ms };
  }

  return {
    names: SOUND_NAMES, start,
    get context() { return ctx; },
    play(name, opts) { if (!rig || !SOUNDS[name]) return; try { rig.engine.voice(name, opts || {}, now()); } catch (e) { note(e); } },
    update(dt) {
      if (rec && state.begun) { recPoll -= dt; if (recPoll <= 0) { recPoll = 0.2; rec.push({ t: state.time, view: snap(state) }); } }
      if (!ctx || !rig) return;
      // Tests step the game much faster than sound can follow. While game time is running away from the audio
      // clock, stay quiet; when the two agree again, take the state as it is.
      const c = ctx.currentTime, dc = c - lastCtx; lastCtx = c;
      ahead = Math.max(0, ahead + dt - dc); if (dt <= 0.06 && dc >= dt * 0.5) ahead *= 0.9;
      const w = ahead > 0.75 || ctx.state !== 'running';
      try {
        if (w !== warp) { warp = w; if (!w) rig.sync(state, now()); }
        if (!warp && !state.paused) rig.tick(state, now());
      } catch (e) { note(e); }
    },
    setVolume(v) { state.volume = v; if (rig) rig.engine.volume.setTargetAtTime(level(), ctx.currentTime, 0.2); },
    setMuted(m) { state.muted = !!m; if (rig) rig.engine.volume.setTargetAtTime(level(), ctx.currentTime, 0.2); },
    async renderOffline(name, opts = {}) {
      if (name === '@record') { rec = opts.on === false ? null : []; recPoll = 0; return { recording: !!rec }; }
      if (name === '@scene') return renderScene(opts);
      if (name === '@chain') return renderChain();
      if (name === '@status') return { context: ctx ? ctx.state : 'none', sampleRate: ctx ? ctx.sampleRate : 0, voices: rig ? rig.engine.voices() : 0, meter: rig ? rig.engine.meter() : null, time: ctx ? +ctx.currentTime.toFixed(2) : 0, warp, mode: rig ? rig.music.mode : null, errors: errors.slice(), recorded: rec ? rec.length : 0 };
      if (!SOUNDS[name]) return { name, error: 'no such sound' };
      return renderSound(name, opts);
    },
  };
}
