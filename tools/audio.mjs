// Renders every named sound OFFLINE in headless Chromium (nothing reaches a speaker) and measures it.
// Limits (BIBLE.md section 5): peak <= -9 dBFS. Attack (10% to 90% of peak) >= 5 ms always,
// >= 10 ms above -30 dBFS, >= 40 ms above -16 dBFS. The louder a sound is, the slower it must arrive.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlArg = process.argv.find((a) => a.startsWith('--html='));   // test another build, e.g. a deliberately broken one
const dist = htmlArg ? htmlArg.slice(7) : join(root, 'dist/small-hours.html');
if (!existsSync(dist)) { console.error('no dist/small-hours.html. Run: node tools/build.mjs'); process.exit(1); }
const LIMIT = { peakDb: -9 };
const minAttack = (peakDb) => (peakDb > -16 ? 40 : peakDb > -30 ? 10 : 5);
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(dist).href);
await page.waitForFunction(() => window.__game && window.__game.ready);
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = only.length ? only : await page.evaluate(() => window.__game.audio.names);
const rows = [];
for (const n of names) rows.push(await page.evaluate((name) => window.__game.audio.renderOffline(name), n));
await browser.close();
let bad = 0;
console.log('name        seconds  peak dBFS  RMS dBFS  attack ms  max rise dB/10ms');
for (const r of rows) {
  const why = [];
  if (r.peakDb > LIMIT.peakDb) why.push('too loud'); if (r.attackMs < minAttack(r.peakDb)) why.push(`sudden: attack under ${minAttack(r.peakDb)} ms at this level`);
  if (!(r.peakDb > -70)) why.push('silent');
  if (why.length) bad++;
  console.log(`${r.name.padEnd(11)} ${String(r.seconds).padStart(7)}  ${String(r.peakDb).padStart(9)}  ${String(r.rmsDb).padStart(8)}  ${String(r.attackMs).padStart(9)}  ${String(r.maxRiseDbPer10ms).padStart(8)}   ${why.length ? 'FAIL: ' + why.join(', ') : 'ok'}`);
}
mkdirSync(join(root, 'shots'), { recursive: true });
writeFileSync(join(root, 'shots/audio.json'), JSON.stringify(rows, null, 2));
if (errors.length) { console.log(errors.join('\n')); bad++; }
console.log(bad ? `AUDIO FAILED (${bad})` : 'AUDIO OK', '-> shots/audio.json');
process.exit(bad ? 1 : 0);
