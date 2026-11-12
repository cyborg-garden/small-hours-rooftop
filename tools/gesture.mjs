// Sound must not start before the first gesture: no AudioContext exists until Begin is pressed.
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const req = [];
p.on('request', (q) => { if (!q.url().startsWith('file:')) req.push(q.url()); });
await p.addInitScript(() => { const A = window.AudioContext; window.__made = 0; window.AudioContext = function (...a) { window.__made++; return new A(...a); }; });
await p.goto(pathToFileURL(join(root, 'dist/small-hours.html')).href);
await p.waitForFunction(() => window.__game && window.__game.ready); await p.waitForTimeout(3000);
const before = await p.evaluate(async () => ({ made: window.__made, status: (await window.__game.audio.renderOffline('@status')).context }));
const bb = await p.locator('#sh-ui button.begin').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(1500);
const after = await p.evaluate(async () => ({ made: window.__made, status: (await window.__game.audio.renderOffline('@status')).context }));
console.log(JSON.stringify({ before, after, requests: req.length }));
await b.close();
process.exit(before.made === 0 && after.made === 1 && req.length === 0 ? 0 : 1);
