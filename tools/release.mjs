// The checks for the three places the game is served: the arcade page and Discord (rules, arcade), and the
// xbox50 console (tv, tvmix). About two minutes. Needs site/: node tools/build.mjs --site
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let failed = false;
for (const t of ['rules', 'arcade', 'tv', 'tvmix']) {
  console.log(`\n== ${t}`);
  const r = spawnSync(process.execPath, [join(here, `${t}.mjs`), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) failed = true;
}
console.log(failed ? '\nRELEASE CHECKS FAILED' : '\nRELEASE CHECKS OK');
process.exit(failed ? 1 : 0);
