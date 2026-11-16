// Saves a film's storyboard (every key moment in one image) to out/<film>-board.png in the project.
// This is the cheap review step: one image per pass instead of a render.
// usage: motion-director board <film>
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { paramsQuery } from './params.mjs';
import { projectRoot } from '../server/project.mjs';
import { pageUrl, startProjectServer } from '../server/static.mjs';

const root = projectRoot();
const name = process.argv[2];
if (!name) { console.error('usage: motion-director board <film>'); process.exit(2); }
const site = await startProjectServer(root);
const url = pageUrl(site.origin, 'film', name, `board&${paramsQuery(root, 'film', name, process.env.BG ? { background: process.env.BG } : {})}`);
mkdirSync(resolve(root, 'out'), { recursive: true });
const out = resolve(root, 'out', `${name}-board.png`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
await site.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
console.log(out);
