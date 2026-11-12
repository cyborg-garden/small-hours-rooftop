// Gate: the console's sound. Every named sound is rendered offline (nothing reaches a speaker) four ways and measured:
//   desk          the mix as it is everywhere else, full range. The reference.
//   desk on a TV  that same mix through a speaker that carries nothing under 150 Hz. What the console would lose.
//   tv on a TV    the console's voicing through the same speaker. What the console plays.
// Rules: on a TV, with the console's voicing, no sound is more than 4 dB quieter than the reference, none is more than
// 9 dB louder, and none peaks above -6 dBFS. And the check must be able to fail: at least one sound must lose more
// than 4 dB without the voicing, or the speaker model is not doing anything.
//   node tools/tvmix.mjs [--html=path]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GL, htmlPath } from './gates/drive.mjs';

const dist = htmlPath(); if (!existsSync(dist)) { console.error('no build. Run: node tools/build.mjs'); process.exit(1); }
const HZ = 150, LOSS = 4, GAIN = 9, PEAK = -6;
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(dist).href); await page.waitForFunction(() => window.__game && window.__game.ready);
const rows = await page.evaluate(async (HZ) => {
  const A = window.__game.audio, out = [];
  for (const name of A.names) {
    const desk = await A.renderOffline(name, { tv: false }), lost = await A.renderOffline(name, { tv: false, speaker: HZ }), tv = await A.renderOffline(name, { tv: true, speaker: HZ });
    out.push({ name, desk: desk.rmsDb, lost: lost.rmsDb, tv: tv.rmsDb, tvPeak: tv.peakDb });
  }
  return out;
}, HZ);
await browser.close();
let bad = 0, wouldLose = 0;
console.log('name         desk RMS   desk on a TV   console on a TV   peak');
for (const r of rows) {
  const why = [], d = r.tv - r.desk; if (r.lost - r.desk < -LOSS) wouldLose++;
  if (d < -LOSS) why.push(`${(-d).toFixed(1)} dB quieter than the desk mix`); if (d > GAIN) why.push(`${d.toFixed(1)} dB louder than the desk mix`); if (r.tvPeak > PEAK) why.push('peaks too high');
  if (why.length) bad++;
  console.log(`${r.name.padEnd(11)} ${String(r.desk).padStart(9)}   ${String(r.lost).padStart(7)} (${(r.lost - r.desk).toFixed(1).padStart(5)})   ${String(r.tv).padStart(8)} (${(d >= 0 ? '+' : '') + d.toFixed(1)})   ${String(r.tvPeak).padStart(6)}   ${why.length ? 'FAIL: ' + why.join(', ') : 'ok'}`);
}
if (!wouldLose) { console.log('FAIL: nothing is lost on the TV speaker even without the voicing, so this check proves nothing'); bad++; }
else console.log(`${wouldLose} sound(s) would lose more than ${LOSS} dB on a TV without the console's voicing`);
if (errors.length) { console.log(errors.join('\n')); bad++; }
console.log(bad ? `TVMIX FAILED (${bad})` : 'TVMIX OK');
process.exit(bad ? 1 : 0);
