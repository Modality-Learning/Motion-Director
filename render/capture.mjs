// Captures frames of a film with headless Chromium, one PNG per frame, through the film's ?still view.
// usage: node capture.mjs <film> <outDir> <fps> [fromFrame] [toFrame] [step]   (the project is MD_ROOT, see server/project.mjs)
//        step: capture every step-th frame from fromFrame (render.sh gives each of its workers one in every JOBS
//        frames, so frames arrive roughly in order and the encoder can work alongside). Each frame is written under
//        a temporary name and renamed when complete, so a reader never sees half a file.
// env:   BG  = white | textured, overriding the film's background parameter (the window takes the film's stage size)
//        DSF = device scale factor: 1.3333333333 (default) = 2560×1440 (or 1440×2560), 1 = native, 2 = 4K
import { renameSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { explainOnCrash } from './blocked.mjs';
import { paramsQuery } from './params.mjs';
import { projectRoot } from '../server/project.mjs';
import { pageUrl, startProjectServer } from '../server/static.mjs';

const [, , film, outDir, fpsArg, fromArg, toArg, stepArg] = process.argv;
explainOnCrash(`npx motion-director render ${film}`); // a sandbox blocking the browser or a port says so
if (!film || !outDir) { console.error('usage: node capture.mjs <film> <outDir> <fps> [from] [to] [step]'); process.exit(2); }
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
const from = fromArg ? +fromArg : 0, to = toArg ? +toArg : Math.round(duration * FPS), step = Math.max(1, +stepArg || 1);
// the first capture also saves the film's sound moments, so the mix follows the animation as it is now
if (from === 0) writeFileSync(`${outDir}/moments.json`, JSON.stringify(await page.evaluate(() => window.Motion.moments || [])));
// Every frame should be a pure function of time, but a film can leave state behind (an element styled on the
// way through and never reset). The studio plays a film from the start, so each process draws every frame in
// order (drawing only, no screenshots, for the frames it doesn't capture), and its frames match the film played
// through. `motion-director purity <film>` finds what a film leaves behind.
const drawUpTo = (a, b) => (b > a ? page.evaluate(([a, b, fps]) => { for (let i = a; i < b; i++) window.__film.render(i / fps); }, [a, b, FPS]) : null);
await drawUpTo(0, from);
// Chrome's own capture with optimizeForSpeed: the same pixels as Playwright's screenshot (checked frame by frame)
// at about half the time, since it compresses the PNG less. The clip carries the device scale, without which
// Chrome captures at CSS size.
const cdp = await page.context().newCDPSession(page);
const { innerWidth: vw, innerHeight: vh } = await page.evaluate(() => ({ innerWidth, innerHeight }));
const clip = { x: 0, y: 0, width: vw, height: vh, scale: DSF };
let unreported = 0;
for (let i = from; i < to; i += step) {
  await page.evaluate((tt) => window.__film.seek(tt), i / FPS);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip });
  const file = `${outDir}/f${String(i).padStart(5, '0')}.png`;
  writeFileSync(`${file}.part`, Buffer.from(data, 'base64'));
  renameSync(`${file}.part`, file);
  await drawUpTo(i + 1, Math.min(i + step, to)); // the frames between, which other processes capture
  // progress for the studio: frames captured since the last report
  if (++unreported === 25) { console.log('captured 25'); unreported = 0; }
}
if (unreported) console.log(`captured ${unreported}`);
await browser.close();
await site.close();
console.log('done', Math.ceil(Math.max(0, to - from) / step));
