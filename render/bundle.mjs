// Inlines the kit into a film so it is one self-contained HTML file, for sharing or publishing.
// usage: motion-director bundle <film>      -> out/<film>.html in the project
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { compValues, readManifest, valuesOf } from './params.mjs';
import { kitFile, projectRoot } from '../server/project.mjs';

const promo = projectRoot();
const name = process.argv[2];
if (!name) { console.error('usage: motion-director bundle <film>'); process.exit(2); }
const filmDir = resolve(promo, 'films', name);
// a path as the page names it: kit files come from the project's kit, else the package's (server/project.mjs)
const fileOf = (from, href) => {
  const full = resolve(from, href), kit = resolve(promo, 'kit');
  return full.startsWith(kit + sep) ? kitFile(promo, relative(kit, full).split(sep).join('/')) : full;
};
// a stylesheet with its local @imports inlined, so a kit stylesheet that imports the brand comes along
const css = (file) => readFileSync(file, 'utf8').replace(/@import\s+(?:url\()?["']((?:\.\.?\/)?[^"')]+\.css)["']\)?\s*;/g, (_, href) => css(fileOf(dirname(file), href)));
const read = (href) => (href.endsWith('.css') ? css(fileOf(filmDir, href)) : readFileSync(fileOf(filmDir, href), 'utf8'));

let html = readFileSync(resolve(filmDir, 'index.html'), 'utf8');
let inlined = 0;
// the film's parameter values (and every composition's) are baked in, so the single file plays as set
const baked = { ...compValues(promo), ...valuesOf(readManifest(promo, 'film', name)?.data) };
html = html.replace(/<script src="/, () => `<script>window.__promoParams = ${JSON.stringify(baked)};</script>\n<script src="`);
// only local files are inlined; fonts and other remote links stay as they are
html = html.replace(/<link rel="stylesheet" href="((?:\.\.?\/)[^"]+\.css)">/g, (_, href) => { inlined++; return `<style>\n${read(href)}</style>`; });
html = html.replace(/<script src="((?:\.\.?\/)[^"]+\.js)"><\/script>/g, (_, src) => { inlined++; return `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}</script>`; });

mkdirSync(resolve(promo, 'out'), { recursive: true });
const out = resolve(promo, 'out', `${name}.html`);
writeFileSync(out, html);
console.log(`${out} (${inlined} kit files inlined)`);
