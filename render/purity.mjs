// Checks that a film draws the same frame whether it was played up to a moment or opened at it, so the export
// (and the storyboard) match what the studio shows. A film breaks this when render(t) styles an element on the
// way through and never resets it: opened partway in, that element is left in its unstyled default.
// usage: motion-director purity <film> [step seconds, default 1]
// Exit codes: 0 every sampled moment matches, 1 something differs (listed), 2 usage.
import { chromium } from 'playwright';
import { explainOnCrash } from './blocked.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { paramsQuery } from './params.mjs';
import { compareStates, pageState } from './purity-lib.mjs';
import { projectRoot } from '../server/project.mjs';
import { pageUrl, startProjectServer } from '../server/static.mjs';

const ROOT = projectRoot();
const [, , film, stepArg] = process.argv;
explainOnCrash(`npx motion-director purity ${film}`); // a sandbox blocking the browser or a port says so
if (!film || !existsSync(join(ROOT, 'films', film, 'index.html'))) { console.error('usage: motion-director purity <film> [step seconds]'); process.exit(2); }
const STEP = +stepArg || 1, FPS = 25;

const params = paramsQuery(ROOT, 'film', film, {}), site = await startProjectServer(ROOT);
const urlAt = (t) => pageUrl(site.origin, 'film', film, `still&t=${t}${params ? `&${params}` : ''}`);
const browser = await chromium.launch();
async function open(t) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(urlAt(t), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__film);
  const size = await page.evaluate(() => window.__film.size);
  if (size.w !== 1920 || size.h !== 1080) await page.setViewportSize({ width: size.w, height: size.h });
  return page;
}
const state = (page, t) => page.evaluate(`(() => { window.__film.seek(${t}); return (${pageState.toString()})(); })()`);

const played = await open(0), duration = await played.evaluate(() => window.__film.duration);
const findings = new Map(); // element → the first moment it differs, and how
let frame = 0;
for (let t = STEP / 2; t < duration; t += STEP) {
  const at = Math.round(t * 100) / 100;
  // the played page draws every frame up to this one, as the studio does when it plays the film
  await played.evaluate(([a, b, fps]) => { for (let i = a; i < b; i++) window.__film.render(i / fps); }, [frame, Math.round(at * FPS), FPS]);
  frame = Math.round(at * FPS);
  const fresh = await open(at);
  for (const d of compareStates(await state(fresh, at), await state(played, at))) if (!findings.has(d.element)) findings.set(d.element, { at, what: d.what });
  await fresh.close();
}
await browser.close();
await site.close();

if (!findings.size) { console.log(`${film}: every sampled moment (every ${STEP} s) looks the same opened fresh and played through.`); process.exit(0); }
console.log(`${film}: ${findings.size} element${findings.size === 1 ? ' looks' : 's look'} different opened fresh than played through. render(t) must set what it`);
console.log('changes on every frame, not only on the way past it:\n');
for (const [el, f] of findings) console.log(`  ${f.at.toFixed(2)} s  ${el}\n           ${f.what.join('; ')}`);
process.exit(1);
