// Captures frames of a film with headless Chromium, one PNG per frame, through the film's ?still view.
// usage: node capture.mjs <film> <outDir> <fps> [fromFrame] [toFrame]   (the project is MD_ROOT, see server/project.mjs)
// env:   BG  = white | textured, overriding the film's background parameter (the window takes the film's stage size)
//        DSF = device scale factor: 1.3333333333 (default) = 2560×1440 (or 1440×2560), 1 = native, 2 = 4K
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { paramsQuery } from './params.mjs';
import { projectRoot } from '../server/project.mjs';
import { pageUrl, startProjectServer } from '../server/static.mjs';

const [, , film, outDir, fpsArg, fromArg, toArg] = process.argv;
if (!film || !outDir) { console.error('usage: node capture.mjs <film> <outDir> <fps> [from] [to]'); process.exit(2); }
const FPS = +fpsArg || 25;
const DSF = +(process.env.DSF || 1.3333333333);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
// the film's parameter values (and every composition's) go to the page in its URL
const root = projectRoot(), site = await startProjectServer(root);
// PROMO_PARAMS='{"logo-reveal.pattern":"helix"}' overrides values for one render without saving them
const overrides = { ...(process.env.BG ? { background: process.env.BG } : {}), ...(process.env.PROMO_PARAMS ? JSON.parse(process.env.PROMO_PARAMS) : {}) };
const params = paramsQuery(root, 'film', film, overrides);
await page.goto(pageUrl(site.origin, 'film', film, `still&t=0${params ? `&${params}` : ''}`), { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__film);
const { duration, size } = await page.evaluate(() => ({ duration: window.__film.duration, size: window.__film.size }));
// the window matches the stage, so a vertical film fills it too
if (size.w !== 1920 || size.h !== 1080) {
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const from = fromArg ? +fromArg : 0, to = toArg ? +toArg : Math.round(duration * FPS);
// the first capture also saves the film's sound moments, so the mix follows the animation as it is now
if (from === 0) writeFileSync(`${outDir}/moments.json`, JSON.stringify(await page.evaluate(() => window.Motion.moments || [])));
// Every frame should be a pure function of time, but a film can leave state behind (an element styled on the
// way through and never reset). The studio plays a film from the start, so each process first draws every
// earlier frame (drawing only, no screenshots), and its frames match the film played through, even when it
// starts partway in. `npm run promo:purity -- <film>` finds what a film leaves behind.
if (from > 0) await page.evaluate(([a, fps]) => { for (let i = 0; i < a; i++) window.__film.render(i / fps); }, [from, FPS]);
let unreported = 0;
for (let i = from; i < to; i++) {
  await page.evaluate((tt) => window.__film.seek(tt), i / FPS);
  await page.screenshot({ path: `${outDir}/f${String(i).padStart(5, '0')}.png` });
  // progress for the studio: frames captured since the last report
  if (++unreported === 25) { console.log('captured 25'); unreported = 0; }
}
if (unreported) console.log(`captured ${unreported}`);
await browser.close();
await site.close();
console.log('done', to - from);
