// Sandboxed-iframe harness (from the technical review). Serves the single-file export inside a sandboxed iframe with the
// host's strict CSP, from fake origins, with every other request aborted and recorded.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = process.env.SH_HTML || join(here, '../../dist/small-hours.html');
export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'";
export const shotDir = (name) => { const d = join(here, '../../shots/sandbox', name); mkdirSync(d, { recursive: true }); return d; };

export async function launch() {
  const GL = process.env.SH_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
  return chromium.launch({ args: ['--mute-audio', ...GL, '--autoplay-policy=user-gesture-required'] });
}

// what every page records: console, page errors, dialogs, downloads, popups, any request that is not ours
export function watch(page, log) {
  log.console = []; log.errors = []; log.requests = []; log.dialogs = []; log.downloads = []; log.popups = []; log.cspViolations = [];
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning' || t === 'warn') log.console.push(t + ': ' + m.text()); });
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('dialog', (d) => { log.dialogs.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  page.on('download', (d) => log.downloads.push(d.suggestedFilename()));
  page.on('popup', (p) => log.popups.push(p.url()));
}

// guard script injected into every frame: records calls to APIs the game must not use, and can refuse others
export const GUARDS = ({ blockAudio = false, suspendAudio = false, refuseFullscreen = true, throwStorage = false } = {}) => `
(() => {
  const rec = (k) => { try { (window.__guard = window.__guard || {})[k] = ((window.__guard || {})[k] || 0) + 1; } catch (_) {} };
  for (const k of ['alert', 'confirm', 'prompt']) window[k] = function () { rec(k); return k === 'confirm' ? false : null; };
  const wo = window.open; window.open = function () { rec('open'); return null; };
  ${refuseFullscreen ? `
  Element.prototype.requestFullscreen = function () { rec('requestFullscreen'); return Promise.reject(new TypeError('refused')); };
  Element.prototype.requestPointerLock = function () { rec('requestPointerLock'); throw new DOMException('refused', 'NotAllowedError'); };` : ''}
  const ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) rec('download'); return ac.call(this); };
  document.addEventListener('securitypolicyviolation', (e) => { rec('csp:' + e.violatedDirective + ':' + (e.blockedURI || '')); });
  ${blockAudio ? `
  const Boom = function () { rec('AudioContext'); throw new DOMException('AudioContext is not allowed', 'NotAllowedError'); };
  window.AudioContext = Boom; window.webkitAudioContext = Boom;` : ''}
  ${suspendAudio ? `
  const AC0 = window.AudioContext;
  window.AudioContext = class extends AC0 { constructor(o) { super(o); super.suspend(); }
    resume() { rec('resume'); return Promise.reject(new DOMException('no gesture', 'NotAllowedError')); } };` : ''}
  ${throwStorage ? `
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { rec('localStorage'); throw new DOMException('denied', 'SecurityError'); } });` : ''}
})();`;

// a page whose only content is the host: an iframe, sandbox=allow-scripts, the game served with the strict CSP
export async function openSandboxed(browser, { width = 390, height = 844, touch = true, dpr = 2, guards = {}, reducedMotion = 'no-preference', wrap = true, top = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, reducedMotion });
  const log = { blocked: [] };
  const game = readFileSync(HTML_PATH, 'utf8');
  const body = wrap ? `<!doctype html><html><head><meta charset="utf-8"></head><body>${game}</body></html>` : game;
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u === 'https://host.test/') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe id="f" sandbox="allow-scripts" src="https://game.test/index.html"></iframe></body></html>` });
    if (u === 'https://game.test/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': CSP }, body });
    log.blocked.push(u); return route.abort();
  });
  await ctx.addInitScript(GUARDS(guards));
  const page = await ctx.newPage(); watch(page, log);
  await page.goto(top ? 'https://game.test/index.html' : 'https://host.test/');
  const frame = top ? page.mainFrame() : await waitFrame(page);
  await frame.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  return { ctx, page, frame, log };
}
export async function waitFrame(page) {
  for (let i = 0; i < 200; i++) { const f = page.frames().find((x) => x.url().startsWith('https://game.test')); if (f) return f; await page.waitForTimeout(50); }
  throw new Error('no game frame');
}

// A player with hands only. It reads state the way a person reads the picture, but acts only by pressing
// the screen (touch or mouse) at real pixel positions: the roof, an edge arrow, or a paper label.
export function hands(page, frame, { touch }) {
  const press = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const offset = async () => { const el = await page.$('#f'); const b = el ? await el.boundingBox() : { x: 0, y: 0 }; return b || { x: 0, y: 0 }; };
  const g = (fn, a) => frame.evaluate(fn, a);
  // where to press for an id: a DOM control if one stands for it, else the anchor on screen, else its edge arrow
  async function target(id) {
    return g((id) => {
      const G = window.__game, W = G.state.viewport.w, H = G.state.viewport.h;
      const r = G.ui().find((u) => u.name === 'choice:' + id) || null;
      if (r) return { x: r.x + r.w / 2, y: r.y + r.h / 2, via: 'label' };
      const a = G.ui().find((u) => u.name === 'arrow:' + id);
      const p = G.screenOf(id);
      if (p && !p.behind && p.x > 8 && p.x < W - 8 && p.y > 8 && p.y < H - 8 && G.pick(p.x, p.y) === id) return { x: p.x, y: p.y, via: 'roof' };
      if (a) return { x: a.x + a.w / 2, y: a.y + a.h / 2, via: 'arrow' };
      if (p && !p.behind) return { x: Math.max(4, Math.min(W - 4, p.x)), y: Math.max(4, Math.min(H - 4, p.y)), via: 'roof-clamped' };
      return null;
    }, id);
  }
  async function tapId(id) { const t = await target(id); if (!t) return null; const o = await offset(); await press(o.x + t.x, o.y + t.y); return t.via; }
  async function tapUI(name) { const r = (await g(() => window.__game.ui())).find((u) => u.name === name); if (!r) return false; const o = await offset(); await press(o.x + r.x + r.w / 2, o.y + r.y + r.h / 2); return true; }
  // the decision a person would make now (same logic as the canonical player), or null for "just watch"
  const decide = (ending) => g((ending) => {
    const G = window.__game, s = G.state, j = s.jo;
    const water = ['n1_water', 'n2_water', 'n2_more', 'n3_water'].includes(s.beat);
    const free = !['scoop', 'pour', 'pourEmpty', 'take', 'place', 'plant', 'walk', 'climb', 'descend', 'carry'].includes(j.action);
    if (!free) return null;
    if (water) {
      const dry = s.pots.filter((p) => p.present && !p.watered && s.hot.includes(p.id)); if (!dry.length) return null;
      if (j.cup > 0) return dry[0].id; if (s.barrel.scoops > 0 || !s.valve.found) return s.hot.includes('barrel') ? 'barrel' : 'valve'; return 'valve';
    }
    if (s.beat === 'turn' && s.hot.includes('tray')) return 'tray';
    if (s.beat === 'choice' && !s.ending) return ending === 'sensor' ? 'sensor' : 'cup';
    return null;
  }, ending);
  return { press, offset, g, target, tapId, tapUI, decide };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
