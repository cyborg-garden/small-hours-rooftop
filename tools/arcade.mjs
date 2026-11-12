// Gate: the page in the arcade. site/ is served over http under a policy stricter than Discord's Activity proxy
// (no inline script, no eval, no inline style, nothing from any other origin) and played to both endings by the
// canonical player. Nothing may be refused by the policy, nothing may be asked of any other origin, and the picture
// must be there. Sound is muted and never reaches a speaker.
//   node tools/arcade.mjs [--site=dir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { root, GL } from './gates/drive.mjs';

const siteArg = process.argv.find((a) => a.startsWith('--site='));
const site = siteArg ? siteArg.slice(7) : join(root, 'site');
if (!existsSync(join(site, 'index.html'))) { console.error('no site build. Run: node tools/build.mjs --site'); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const CSP = process.env.SH_CSP || "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'";   // SH_CSP: try another policy, to see this check fail
const PREFIX = '/games/small-hours/';
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url.startsWith(PREFIX) ? normalize(url.slice(PREFIX.length) || 'index.html') : null, file = rel && join(site, rel);
  if (!rel || rel.startsWith('..') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--mute-audio', ...GL] });
let failed = false;
const report = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
for (const ending of ['hand', 'sensor']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [], asked = [], refused = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); (/Content Security Policy|Refused to/i.test(t) ? refused : errors).push(t); } });
  page.on('request', (q) => { const u = q.url(); if (!u.startsWith('data:')) asked.push(u); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await page.goto(origin + PREFIX); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  // one real click on Begin, so the sound engine starts as it would for a player (muted)
  await page.click('#sh-ui button.begin');
  const r = await page.evaluate((e) => {
    const G = window.__game, s = G.state; G.setQuality(0, true); G.auto(false);
    G.goto('n1_water', { ending: e, settle: 3 }); const mid = G.frameStats();
    G.goto('end', { ending: e, settle: 2 });
    return { beat: s.beat, ending: s.ending, mid, end: G.frameStats(), csp: window.__csp, paper: getComputedStyle(document.querySelector('#sh-ui .again')).backgroundImage.slice(0, 22) };
  }, ending);
  const audio = await page.evaluate(() => window.__game.audio.renderOffline('@status'));
  const outside = asked.filter((u) => !u.startsWith(origin + PREFIX));
  report(r.beat === 'end' && r.ending === ending, `${ending}: played to the end under the policy`);
  report(r.csp.length === 0 && refused.length === 0, `${ending}: the policy refused nothing${r.csp.length || refused.length ? ': ' + [...new Set([...r.csp, ...refused])].slice(0, 4).map((t) => t.slice(0, 90)).join(' | ') : ''}`);
  report(outside.length === 0, `${ending}: asked for ${asked.length} files, all its own (${asked.map((u) => u.slice(origin.length + PREFIX.length) || 'index.html').join(', ')})${outside.length ? ' EXCEPT ' + outside.join(', ') : ''}`);
  report(r.mid.colours > 12 && r.mid.spread > 0.03 && r.end.colours > 12, `${ending}: the picture is there (${r.mid.colours} colours mid-game, ${r.end.colours} at the end)`);
  report(r.paper.startsWith('url("data:image/png'), `${ending}: the paper on the tags is painted`);
  report(audio.context === 'running' || audio.context === 'suspended', `${ending}: the sound engine started (${audio.context}, muted)`);
  report(errors.length === 0, `${ending}: no page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  await page.close();
}
await browser.close(); server.close();
console.log(failed ? 'ARCADE FAILED' : 'ARCADE OK');
process.exit(failed ? 1 : 0);
