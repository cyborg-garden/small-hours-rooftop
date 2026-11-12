// OWNER: C (audio). A closer look than tools/audio.mjs, for the audio builder and the critic. Nothing reaches a speaker.
//   node tools/audio-deep.mjs sounds [name ...]     every sound: level, attack, steps, spectrum, where the pitch goes
//   node tools/audio-deep.mjs env <name> [ms]       the shape of one sound, a row of dB per window
//   node tools/audio-deep.mjs chain                 the master chain: gain for quiet signals, ceiling under abuse
//   node tools/audio-deep.mjs scene [hand|sensor]   plays the whole game with the canonical player, records every
//                                                   event, renders all of it offline through the real mixer, measures it
//   node tools/audio-deep.mjs layers [hand|sensor]  the same, with ambience, effects and music each rendered alone
// Takes --html=<path> like the other tools. Exit code 1 if a limit is broken. Writes shots/audio-deep.json.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlArg = process.argv.find((a) => a.startsWith('--html='));
const dist = htmlArg ? htmlArg.slice(7) : join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no build at ' + dist); process.exit(1); }
const args = process.argv.slice(2).filter((a) => !a.startsWith('-')), cmd = args[0] || 'sounds';
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(dist).href);
await page.waitForFunction(() => window.__game && window.__game.ready);
const R = (name, opts) => page.evaluate(([n, o]) => window.__game.audio.renderOffline(n, o), [name, opts || {}]);
const pad = (v, n) => String(v).padStart(n);
let bad = 0; const out = { when: new Date().toISOString(), cmd };
const fail = (m) => { bad++; console.log('  FAIL: ' + m); };

// the house limits, per sound (BIBLE.md section 5), plus the ones this tool adds: no steps, nothing cut off
const minAttack = (peakDb) => (peakDb > -16 ? 40 : peakDb > -30 ? 10 : 5);
function judge(r) {
  const why = [];
  if (r.peakDb > -9) why.push('too loud'); if (r.attackMs < minAttack(r.peakDb)) why.push(`sudden (attack ${r.attackMs} ms, needs ${minAttack(r.peakDb)})`);
  if (!(r.peakDb > -70)) why.push('silent'); if (r.clicks) why.push(`${r.clicks} steps in the waveform, worst x${r.worstClickRatio} at ${r.worstClickAt}s`);
  if (r.tailDb > -66) why.push(`cut off while still sounding (${r.tailDb} dB at the end)`); if (r.dcDb > -50) why.push('DC offset');
  return why;
}

if (cmd === 'sounds') {
  const names = args.length > 1 ? args.slice(1) : await page.evaluate(() => window.__game.audio.names);
  console.log('name        secs   peak    dBA  attack rise/10ms steps  tail   L/R  centroid  thirds (Hz)          loudest bin/third    63   125   250   500    1k    2k    4k    8k   16k');
  out.sounds = [];
  for (const n of names) {
    const r = await R(n); out.sounds.push(r); const why = judge(r), b = r.bands;
    console.log(`${n.padEnd(10)} ${pad(r.seconds, 5)} ${pad(r.peakDb, 6)} ${pad(r.dBA, 6)} ${pad(r.attackMs, 7)} ${pad(r.maxRiseDbPer10ms, 7)} ${pad(r.clicks, 6)} ${pad(r.tailDb, 6)} ${pad(r.balanceDb, 5)} ${pad(r.centroidHz, 8)}  ${(r.centroidThirds ? r.centroidThirds.join(' > ') : '').padEnd(20)} ${(r.peakThirds ? '[' + r.peakThirds.join(' ') + ']' : '').padEnd(18)} ${[63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((f) => pad(Math.round(b[f]), 5)).join(' ')}`);
    for (const w of why) fail(`${n}: ${w}`);
  }
} else if (cmd === 'env') {
  const r = await R(args[1], { env: true, envMs: +(args[2] || 10) });
  console.log(args[1], 'peak', r.peakDb, 'attack', r.attackMs, 'clicks', r.clicks, r.worstClickRatio, '@', r.worstClickAt);
  for (let i = 0; i < r.env.length; i += 20) console.log(pad((i * (+(args[2] || 10)) / 1000).toFixed(2), 6) + 's ' + r.env.slice(i, i + 20).map((v) => pad(v, 4)).join(''));
} else if (cmd === 'chain') {
  out.chain = await R('@chain'); console.log(out.chain);
  if (out.chain.fortyPoursAtOncePeakDb > -6) fail('the ceiling does not hold');
} else if (cmd === 'live') {
  // node tools/audio-deep.mjs live [seconds]: Begin with a real click, then play in real time with the canonical player
  // and watch the live context: is it running, is sound leaving the mixer, do voices pile up, does pause hold, does a jump recover
  const secs = +(args[1] || 45);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);
  const st0 = await R('@status'); console.log('before Begin:', st0.context); if (st0.context !== 'none') fail('an audio context exists before Begin');
  const bb = await page.locator('#sh-ui button.begin').boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.evaluate(() => { const g = window.__game; g.auto(false); window.__drive = setInterval(() => g.step(1 / 30, true), 1000 / 30); });
  let maxVoices = 0, loud = -120, sounding = 0, n = 0;
  for (let t = 0; t < secs; t += 1) {
    await page.waitForTimeout(1000); const st = await R('@status'); n++;
    maxVoices = Math.max(maxVoices, st.voices); loud = Math.max(loud, st.meter.peakDb); if (st.meter.rmsDb > -70) sounding++;
    if (t % 5 === 4) console.log(`  ${pad(t + 1, 3)}s  ctx ${st.context} ${pad(st.time, 6)}s  beat ${await page.evaluate(() => window.__game.state.beat)}  voices ${pad(st.voices, 3)}  out peak ${pad(st.meter.peakDb, 6)} rms ${pad(st.meter.rmsDb, 6)}  mode ${st.mode}  warp ${st.warp}  errors ${st.errors.length}`);
    if (st.context !== 'running') fail('context is ' + st.context); if (st.errors.length) { for (const e of st.errors) fail(e); break; }
  }
  console.log(`  sounding in ${sounding}/${n} samples, loudest instant ${loud} dBFS, most voices at once ${maxVoices}`);
  if (sounding < n * 0.8) fail('the live graph is mostly silent'); if (loud > -9) fail('live output above -9 dBFS'); if (maxVoices > 80) fail('voices pile up');
  // pause as the page does when hidden, then resume
  await page.evaluate(() => { clearInterval(window.__drive); window.__game.bus.emit('pause', {}); }); await page.waitForTimeout(600);
  const p1 = await R('@status'); await page.waitForTimeout(500); const p2 = await R('@status');
  console.log(`  paused: ctx ${p1.context}, clock ${p1.time} -> ${p2.time}`); if (p2.context !== 'suspended' || p2.time !== p1.time) fail('pause did not stop the audio clock');
  await page.evaluate(() => { window.__game.bus.emit('resume', {}); }); await page.waitForTimeout(500);
  const p3 = await R('@status'); console.log(`  resumed: ctx ${p3.context}`); if (p3.context !== 'running') fail('resume did not restart audio');
  // a jump: the game leaps ahead of the audio clock (as tests do), then real time again
  await page.evaluate(() => { const g = window.__game; g.goto('n2_more'); window.__drive = setInterval(() => g.step(1 / 30, true), 1000 / 30); });
  await page.waitForTimeout(4000); const j = await R('@status');
  console.log(`  after a jump to n2_more: warp ${j.warp}, voices ${j.voices}, mode ${j.mode}, out rms ${j.meter.rmsDb}, errors ${j.errors.length}`);
  if (j.warp) fail('still in warp four seconds after a jump'); if (j.voices > 80) fail('the jump left a pile of voices'); if (j.meter.rmsDb < -70) fail('silent after a jump'); for (const e of j.errors) fail(e);
  // mute and unmute
  await page.locator('#sh-ui button.snd').click(); await page.waitForTimeout(1500); const m1 = await R('@status');
  console.log(`  Sound toggle off: muted ${await page.evaluate(() => window.__game.state.muted)}, out rms ${m1.meter.rmsDb}`); if (m1.meter.rmsDb > -80) fail('mute does not silence the output');
  await page.locator('#sh-ui button.snd').click(); await page.waitForTimeout(1500); const m2 = await R('@status');
  console.log(`  Sound toggle on: out rms ${m2.meter.rmsDb}`); if (m2.meter.rmsDb < -70) fail('unmute does not bring the sound back');
  await page.evaluate(() => clearInterval(window.__drive));
} else if (cmd === 'window') {
  // node tools/audio-deep.mjs window <from> <to> [ms] [amb|fx|music] [hand|sensor]: the shape of a passage of the real game
  const from = +args[1], to = +args[2], ms = +(args[3] || 100), solo = ['amb', 'fx', 'music'].includes(args[4]) ? args[4] : null, ending = args.includes('sensor') ? 'sensor' : 'hand';
  const evs = await page.evaluate(async ([ending, from, to]) => {
    const g = window.__game; g.auto(false); await g.audio.renderOffline('@record', { on: true });
    const log = []; g.bus.on('*', (n, p) => { const t = g.state.time; if (t >= from && t <= to && !/^(text|input|look)/.test(n)) log.push(t.toFixed(2) + ' ' + n + ' ' + JSON.stringify(p || {})); });
    g.goto('end', { ending }); g.step(14, false); return log;
  }, [ending, from, to]);
  const r = await R('@scene', { from, to, env: true, envMs: ms, solo, sr: 44100 });
  console.log(`${from}s to ${to}s${solo ? ', ' + solo + ' alone' : ''}: peak ${r.peakDb}, rms ${r.rmsDb}, fastest rise ${r.maxRiseDbPer10ms} dB/10ms at ${(from + r.maxRiseAt).toFixed(2)}s, steps ${r.clicks}`);
  const per = Math.round(2000 / ms);
  for (let i = 0; i < r.env.length; i += per) console.log(pad((from + i * ms / 1000).toFixed(1), 7) + 's ' + r.env.slice(i, i + per).map((v) => pad(v, 4)).join(''));
  if (!args.includes('quiet')) for (const e of evs) console.log('   ' + e);
} else if (cmd === 'scene' || cmd === 'layers') {
  const ending = args[1] === 'sensor' ? 'sensor' : 'hand';
  const t0 = Date.now();
  const played = await page.evaluate(async (ending) => {
    const g = window.__game; g.auto(false); await g.audio.renderOffline('@record', { on: true });
    g.goto('end', { ending }); g.step(14, false);
    return { beat: g.state.beat, seconds: g.state.time, status: await g.audio.renderOffline('@status') };
  }, ending);
  console.log(`played to "${played.beat}" in ${played.seconds.toFixed(1)} s of game (${((Date.now() - t0) / 1000).toFixed(1)} s real). recorded ${played.status.recorded} entries.`);
  if (played.beat !== 'end') fail('the canonical player did not reach the end');
  const show = (s, label) => {
    console.log(`\n${label}: ${s.seconds} s, ${s.events} events. peak ${s.peakDb} dBFS at ${s.peakAt}s. rms ${s.rmsDb} (per second: p10 ${s.rmsP10}, median ${s.rmsP50}, p95 ${s.rmsP95}).`);
    console.log(`  fastest rise ${s.maxRiseDbPer10ms} dB in 10 ms at ${s.maxRiseAt}s. biggest loudness step ${s.maxJumpDbPer250ms} dB in 250 ms at ${s.maxJumpAt}s. steps in the waveform: ${s.clicks}${s.clicks ? ' (worst x' + s.worstClickRatio + ' at ' + s.worstClickAt + 's)' : ''}.`);
    console.log(`  centroid ${s.centroidHz} Hz. bands: ` + Object.entries(s.bands).map(([f, v]) => `${f}:${Math.round(v)}`).join(' '));
    for (const sp of s.spans) console.log(`    ${sp.name.padEnd(11)} from ${pad(sp.from, 6)}s  ${pad(sp.seconds, 6)}s  peak ${pad(sp.peakDb, 6)}  rms ${pad(sp.rmsDb, 6)}  dBA ${pad(sp.dBA, 6)}`);
    for (const f of s.faults) fail('scheduler fault: ' + f);
  };
  const full = await R('@scene', { perSec: true }); out.scene = full; show(full, `full mix, ${ending} ending`);
  // a row per 10 s, one figure per second: the shape of the whole game
  console.log('\n  rms per second (dBFS):');
  for (let i = 0; i < full.perSec.length; i += 20) console.log('  ' + pad(i, 4) + 's ' + full.perSec.slice(i, i + 20).map((p) => pad(Math.round(p.rmsDb), 4)).join(''));
  console.log('\n  A-weighted level per second (what the ear gets):');
  for (let i = 0; i < full.dbaPerSec.length; i += 20) console.log('  ' + pad(i, 4) + 's ' + full.dbaPerSec.slice(i, i + 20).map((p) => pad(p, 4)).join(''));
  if (full.peakDb > -9) fail(`mix peaks at ${full.peakDb} dBFS (limit -9)`);
  if (full.clicks) fail(`${full.clicks} steps in the mix`);
  if (full.maxJumpDbPer250ms > 14) fail(`loudness jumps ${full.maxJumpDbPer250ms} dB in a quarter second at ${full.maxJumpAt}s`);
  if (cmd === 'layers') for (const solo of ['amb', 'fx', 'music']) { const s = await R('@scene', { solo }); out[solo] = s; show(s, `${solo} alone`); }
  const st = await R('@status'); if (st.errors.length) { for (const e of st.errors) fail('live audio error: ' + e); }
}
await browser.close();
for (const e of errors) fail('page: ' + e);
mkdirSync(join(root, 'shots'), { recursive: true });
writeFileSync(join(root, `shots/audio-deep-${cmd}.json`), JSON.stringify(out, null, 1));
console.log(bad ? `\nAUDIO-DEEP FAILED (${bad})` : '\nAUDIO-DEEP OK');
process.exit(bad ? 1 : 0);
