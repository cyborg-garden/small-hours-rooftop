// Bundles src/ and three.js into ONE self-contained file: dist/small-hours.html
// Shape: <title>, <meta viewport>, <style>, <canvas>, <script>. No doctype, html, head or body (the host wraps it).
//
//   node tools/build.mjs           the one file, as above. Every gate in tools/ plays this.
//   node tools/build.mjs --site    also writes site/: the same game as a page with its code and style in files of
//                                  their own (index.html, game.js, style.css) plus meta.json and the three.js licence. This is what the
//                                  arcade serves. A page with no inline script runs anywhere, Discord included.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [join(root, 'src/main.js')], bundle: true, format: 'iife', minify: !process.argv.includes('--dev'),
  target: 'es2020', write: false, legalComments: 'none', logLevel: 'warning',
});
const js = out.outputFiles[0].text;
const css = readFileSync(join(root, 'src/game/style.css'), 'utf8');
const problems = [];
if (/<\/script/i.test(js)) problems.push('bundle contains a literal </script');
// our own source is held to the delivery rules (three.js carries doc URLs in comments and strings; it is not scanned)
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
for (const f of walk(join(root, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const bad of ['alert(', 'confirm(', 'prompt(', 'window.open', 'fetch(', 'XMLHttpRequest', 'http://', 'https://', 'Math.random(', '\u2014', '\u2013'])
    if (src.includes(bad)) problems.push(`${f.replace(root + '/', '')} contains ${JSON.stringify(bad)}`);
}
const html = `<title>Small Hours</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<style>
${css}</style>
<canvas id="c" tabindex="0" aria-label="Small Hours. A rooftop garden at night."></canvas>
<script>
${js}
</script>
`;
if (problems.length) { console.error('BUILD FAILED:', problems.join('; ')); process.exit(1); }
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outFile = outArg ? outArg.slice(6) : join(root, 'dist/small-hours.html');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
const mb = Buffer.byteLength(html) / 1048576;
console.log(`${outFile.replace(root + '/', '')}  ${mb.toFixed(2)} MB  (${js.split('\n').length} bundle lines)`);
if (mb > 6) { console.error('BUILD FAILED: over 6 MB'); process.exit(1); }

const siteArg = process.argv.find((a) => a === '--site' || a.startsWith('--site='));
if (siteArg) {
  const site = siteArg.includes('=') ? siteArg.slice(7) : join(root, 'site');
  const meta = JSON.parse(readFileSync(join(root, 'meta.json'), 'utf8'));
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="description" content="${esc(meta.tagline)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#171925">
<link rel="stylesheet" href="style.css">
</head>
<body>
<canvas id="c" tabindex="0" aria-label="Small Hours. A rooftop garden at night."></canvas>
<noscript>Small Hours needs JavaScript to run.</noscript>
<script src="game.js"></script>
</body>
</html>
`;
  rmSync(site, { recursive: true, force: true }); mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'index.html'), page); writeFileSync(join(site, 'game.js'), js + '\n'); writeFileSync(join(site, 'style.css'), css);
  copyFileSync(join(root, 'meta.json'), join(site, 'meta.json'));
  // three.js is bundled into game.js with its comments stripped: its licence travels beside it
  copyFileSync(join(root, 'node_modules/three/LICENSE'), join(site, 'three.LICENSE.txt'));
  console.log(`${site.replace(root + '/', '')}/  index.html, game.js, style.css, meta.json, three.LICENSE.txt`);
}
