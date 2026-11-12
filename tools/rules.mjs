// Gate: the arcade's rules for a page, checked on site/ without a browser. The same rules the Discord arcade's
// own games are held to (arcade-rooms, games/the-serial/client.test.mjs), since Discord refuses a page that breaks
// them, plus the copy rules for the listing.
//   the page has no inline script and no on* attributes
//   our own code and style ask for nothing from anywhere: no address, no @import, no fetch, no XMLHttpRequest,
//     no new Audio, no eval, no document.write (three.js is not ours and is checked at run time by tools/arcade.mjs)
//   the page names only files that are in site/
//   the listing (meta.json) has what the site needs, and its words have no em dash and no exclamation mark
//   node tools/rules.mjs [--site=dir]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteArg = process.argv.find((a) => a.startsWith('--site='));
const site = siteArg ? siteArg.slice(7) : join(root, 'site');
if (!existsSync(join(site, 'index.html'))) { console.error('no site build. Run: node tools/build.mjs --site'); process.exit(1); }
let failed = false;
const report = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

const html = readFileSync(join(site, 'index.html'), 'utf8');
report(!/<script(?![^>]*\bsrc=)/i.test(html), 'the page has no inline script');
report(!/\son[a-z]+\s*=/i.test(html), 'the page has no on* attributes');
report(!/<style[\s>]/i.test(html) && !/\sstyle\s*=/i.test(html), 'the page has no inline style');
report(/^<!doctype html>/i.test(html), 'the page starts with a doctype');
const named = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
report(named.length > 0 && named.every((f) => !/^[a-z]+:|^\/\//i.test(f) && existsSync(join(site, f))), `the page names only its own files (${named.join(', ')})`);

// our own source: everything under src/ that ends up in game.js or style.css
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const BAD = /https?:\/\/|@import|\bfetch\(|XMLHttpRequest|new Audio\b|document\.write|\beval\(|new Function\b|WebSocket|sendBeacon|EventSource|importScripts/;
const offenders = walk(join(root, 'src')).filter((f) => !f.includes('/lookdev/') && BAD.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root + '/', ''));
report(offenders.length === 0, `our own code asks for nothing from anywhere${offenders.length ? ': ' + offenders.join(', ') : ''}`);
const css = readFileSync(join(site, 'style.css'), 'utf8');
report(!/@import|url\(/.test(css), 'the style sheet loads nothing');

const meta = JSON.parse(readFileSync(join(site, 'meta.json'), 'utf8'));
report(['title', 'blurb', 'status', 'updated'].every((k) => typeof meta[k] === 'string' && meta[k]), 'the listing has a title, a blurb, a status and a date');
report(['published', 'announced', 'draft'].includes(meta.status) && /^\d{4}-\d{2}-\d{2}$/.test(meta.updated), `status "${meta.status}", updated ${meta.updated}`);
report(!/[!—–]/.test(meta.title + meta.tagline + meta.blurb), 'no em dash and no exclamation mark in the listing');
report(/^https:\/\/github\.com\//.test(meta.source || ''), 'the listing links to its source');
const pad = meta.xbox50 && meta.xbox50.pad;
report(!!pad && ['arrows', 'wasd'].includes(pad.stick) && typeof pad.click === 'string' && pad.cursor === false && typeof pad.hint === 'string', 'the listing carries the console pad map');
report(existsSync(join(site, 'three.LICENSE.txt')), 'the three.js licence ships with the page');
console.log(failed ? 'RULES FAILED' : 'RULES OK');
process.exit(failed ? 1 : 0);
