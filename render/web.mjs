// A film for a web page, written into a project the way shadcn/ui writes components: as files you own, with no
// package to install. Into the folder go the player once (motion-film.js, kit/web.js with its types), each film as
// <film>.film.js, which imports the player, and in a React project MotionFilm.tsx. No iframe, no video; no sound yet.
// usage: motion-director web <film> [--out <folder>] [--react | --no-react]
//   --out    the folder in your app, such as src/films (default: the project's out/, with an example page)
//   --react  write MotionFilm.tsx (by default, when the folder's package.json lists react)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME, compValues, readManifest, valuesOf } from './params.mjs';
import { PKG, kitFile, projectRoot } from '../server/project.mjs';

/* kit files a web page doesn't use: the player is the screening room's chrome; the element replaces it */
const SKIP = new Set(['player.js', 'player.css']);

/** The film's page taken apart: its fonts, styles, markup and scripts, in the order the page loads them. */
export function readFilmPage(root, name) {
  if (!NAME.test(name || '')) throw new Error(`Not a film name: ${name}`);
  const filmDir = resolve(root, 'films', name), page = resolve(filmDir, 'index.html');
  if (!existsSync(page)) throw new Error(`No film called ${name}`);
  const kits = [resolve(root, 'kit'), resolve(PKG, 'kit')];
  // a local path as the page names it: kit files come from the project's kit, else the package's (and a kit file's
  // own @import, such as stage.css's brand.css, is looked up the same way)
  const fileOf = (from, href) => {
    const full = resolve(from, href), kit = kits.find((k) => full.startsWith(k + sep));
    if (kit) { const rel = relative(kit, full).split(sep).join('/'); return { file: kitFile(root, rel), kit: rel }; }
    if (!full.startsWith(resolve(root) + sep)) throw new Error(`${href} is outside the project`);
    return { file: full, kit: null };
  };
  const css = (file) => readFileSync(file, 'utf8').replace(/@import\s+(?:url\()?["']((?:\.\.?\/)?[^"')]+\.css)["']\)?\s*;/g, (_, href) => css(fileOf(dirname(file), href).file));

  const html = readFileSync(page, 'utf8');
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || name).trim();
  const fonts = [], styles = [], scripts = [];
  // stylesheets and <style> blocks, in order
  for (const m of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m[0].startsWith('<style')) { styles.push(m[1]); continue; }
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (!href) continue;
    if (/^https:\/\//.test(href)) { fonts.push(href); continue; }
    const f = fileOf(filmDir, href);
    if (f.kit && SKIP.has(f.kit)) continue;
    styles.push(css(f.file));
  }
  // scripts: local files and inline ones; the player is left out
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = m[1].match(/\bsrc="([^"]+)"/)?.[1];
    if (/type="module"/.test(m[1])) throw new Error('Module scripts in a film page are not supported yet');
    if (!src) { scripts.push({ from: 'inline', code: m[2] }); continue; }
    if (/^https?:\/\//.test(src)) throw new Error(`${src}: remote scripts aren't carried into the web film`);
    const f = fileOf(filmDir, src);
    if (f.kit && SKIP.has(f.kit)) continue;
    scripts.push({ from: src, code: readFileSync(f.file, 'utf8') });
  }
  // the markup: what the player wraps (<main id="player">), else the body, without its scripts and styles
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || '';
  const main = body.match(/<main\b[^>]*\bid="player"[^>]*>([\s\S]*)<\/main>/i)?.[1] ?? body;
  const markup = main.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').trim();
  return { title, fonts, css: styles.join('\n'), html: markup, scripts };
}

/** A film's stylesheet for a shadow root: variables declared on :root belong to the element there. */
export const forShadow = (css) => css.replace(/:root\b/g, ':host');

/* the files in the folder; the player's name is fixed, so every film in the folder imports the same one */
export const PLAYER_FILE = 'motion-film.js';
const PLAYER_TYPES_FILE = 'motion-film.d.ts';
const REACT_FILE = 'MotionFilm.tsx';
const GENERATED = '// Motion Director web player';

/** The version a player file says it is (kit/web.js's PLAYER_VERSION), or null for a file that isn't one. */
export function playerVersion(text) {
  const m = typeof text === 'string' && text.match(/export const PLAYER_VERSION = (\d+);/);
  return m ? Number(m[1]) : null;
}

/** The player as written into a project: kit/web.js, with a line saying what it is. */
export function buildPlayer(root) {
  const runtime = readFileSync(kitFile(root, 'web.js'), 'utf8');
  const version = playerVersion(runtime);
  if (!version) throw new Error('kit/web.js has no PLAYER_VERSION');
  return { js: `${GENERATED} v${version}, written by \`motion-director web\`. Don't edit it: export a film again to update it.\n${runtime}`, version };
}

/** The stage's shape from the film's stylesheet (--stage-w / --stage-h on #stage), as an aspect-ratio value, so a
 * page can lay the element out before the player has started (server rendering, slow scripts). */
export function stageRatio(css) {
  const px = (name, fallback) => {
    const all = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([\\d.]+)px`, 'g'))];
    return all.length ? Number(all.at(-1)[1]) : fallback; // the film's own value comes after the kit's
  };
  return `${px('--stage-w', 1920)} / ${px('--stage-h', 1080)}`;
}

/** A film's module: its markup, styles, parameters and scripts, registered with the player beside it. Film scripts
 * become functions that are handed the film's own document, window and location (kit/web.js), so nothing is
 * evaluated from strings. */
export function buildFilmModule(root, name) {
  const page = readFilmPage(root, name);
  const params = { ...compValues(root), ...valuesOf(readManifest(root, 'film', name)?.data) };
  const { version } = buildPlayer(root);
  const fns = page.scripts.map((s) => `  // ${s.from}\n  (document, window, location, Motion) => {\n${s.code}\n  }`).join(',\n');
  const css = forShadow(page.css);
  const js = `// The film "${name}" for a web page, made by \`motion-director web ${name}\` from films/${name}/index.html.
// Don't edit it: change the film and export again. It needs ./${PLAYER_FILE} (player ${version} or newer) beside it.
import { register } from './${PLAYER_FILE}';

export default register({
  name: ${JSON.stringify(name)},
  title: ${JSON.stringify(page.title)},
  player: ${version},
  ratio: ${JSON.stringify(stageRatio(css))},
  fonts: ${JSON.stringify(page.fonts)},
  params: ${JSON.stringify(params)},
  css: ${JSON.stringify(css)},
  html: ${JSON.stringify(page.html)},
  scripts: [
${fns}
  ],
});
`;
  return { js, title: page.title, scripts: page.scripts.length, player: version };
}

/** Types for the player (motion-film.d.ts beside motion-film.js): the element, the films and <motion-film> in the DOM. */
export const PLAYER_TYPES = `${GENERATED} types, written by \`motion-director web\` beside ${PLAYER_FILE}. Don't edit it.
export interface MotionFilmPoint { name: string; t: number; note?: string }
export interface MotionFilmDefinition {
  readonly name: string;
  readonly title: string;
  /** The player version the film was exported with. */
  readonly player: number;
  /** The stage's shape as a CSS aspect-ratio, such as "16 / 9" written as "1920 / 1080". */
  readonly ratio: string;
}
export interface MotionFilmElement extends HTMLElement {
  readonly ready: Promise<MotionFilmElement>;
  readonly time: number;
  readonly duration: number;
  readonly points: MotionFilmPoint[];
  readonly size: { w: number; h: number };
  readonly scrolling: boolean;
  readonly paused: boolean;
  progress: number;
  seek(target: number | string): void;
  /** Cut to a moment; with a speed, play there at that speed; with a duration, move there in that time, eased. */
  goTo(target: number | string, opts?: { speed?: number; duration?: number }): Promise<boolean>;
  /** How far through each section the film is, 0 to 1 each. A section runs from its moment to the next in the list. */
  sectionProgress(sections: (string | number)[]): number[];
  play(opts?: { from?: number | string; to?: number | string; speed?: number }): void;
  pause(): void;
}
export interface MotionFilmEvents {
  ready: CustomEvent<void>;
  timeupdate: CustomEvent<{ t: number; progress: number }>;
  pointchange: CustomEvent<{ point: MotionFilmPoint | null; index: number }>;
  arrive: CustomEvent<{ point: MotionFilmPoint | null; t: number }>;
  ended: CustomEvent<{ point: null; t: number }>;
}
export const PLAYER_VERSION: number;
export const films: Record<string, MotionFilmDefinition>;
export function register<F extends MotionFilmDefinition>(film: F): F;
export const MotionFilmElement: { new (): MotionFilmElement; prototype: MotionFilmElement };
declare global {
  interface HTMLElementTagNameMap { 'motion-film': MotionFilmElement }
}
`;

/** Types for one film (<film>.film.d.ts), so \`import tour from './tour.film.js'\` is typed. */
export const filmTypes = (name) => `// Types for ${name}.film.js, written by \`motion-director web\`.
import type { MotionFilmDefinition } from './${PLAYER_FILE}';
declare const film: MotionFilmDefinition;
export default film;
`;

/** The React component, written once into a React project. Unlike the player, it's yours: change it as you like,
 * and export leaves it alone once it's there. */
export const REACT_COMPONENT = `// MotionFilm: a Motion Director film as a React component, around the <motion-film> element in ./${PLAYER_FILE}.
// Written once by \`motion-director web\`; it's yours now, so change it as you like (export won't overwrite it).
// Needs React 19. With server rendering the film is an empty box of the film's shape until the page's script runs.
'use client';
import { useEffect, useImperativeHandle, useRef, type CSSProperties, type DetailedHTMLProps, type HTMLAttributes, type Ref } from 'react';
import './${PLAYER_FILE}'; // defines <motion-film>
import type { MotionFilmDefinition, MotionFilmElement, MotionFilmEvents, MotionFilmPoint } from './${PLAYER_FILE}';

export type { MotionFilmDefinition, MotionFilmElement, MotionFilmPoint };

export interface MotionFilmProps {
  /** The film, as its module exports it: \`import tour from './tour.film.js'\`. */
  film: MotionFilmDefinition;
  /** 'scroll' ties the film to scrolling: pin it in a tall section (position: sticky). */
  mode?: 'scroll';
  /** The section whose scrolling drives the film, as a selector (default: the element's parent). */
  track?: string;
  /** Seconds the film takes to catch up with the scroll (default 0.12; 0 follows it exactly). */
  smoothing?: number;
  /** Where the film starts: seconds or a moment's name. */
  start?: number | string;
  /** What a screen reader announces (default: the film's title). */
  label?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  /** The element itself: goTo, seek, play, pause, points, time, sectionProgress. */
  ref?: Ref<MotionFilmElement | null>;
  onReady?: (film: MotionFilmElement) => void;
  /** Every frame the film draws. film.sectionProgress([...]) here fills a progress bar per section. */
  onTimeUpdate?: (t: number, film: MotionFilmElement) => void;
  onPointChange?: (point: MotionFilmPoint | null, index: number) => void;
  onArrive?: (point: MotionFilmPoint | null, t: number) => void;
  onEnded?: () => void;
}

export function MotionFilm({ film, mode, track, smoothing, start, label, style, ref, onReady, onTimeUpdate, onPointChange, onArrive, onEnded, ...rest }: MotionFilmProps) {
  const el = useRef<MotionFilmElement>(null);
  useImperativeHandle(ref, () => el.current as MotionFilmElement, []);
  // the latest handlers, without listening again each render
  const on = useRef({ onReady, onTimeUpdate, onPointChange, onArrive, onEnded });
  useEffect(() => { on.current = { onReady, onTimeUpdate, onPointChange, onArrive, onEnded }; });

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let started = false;
    const ready = () => { started = true; on.current.onReady?.(node); };
    const listen: Record<string, (e: Event) => void> = {
      ready,
      timeupdate: (e) => on.current.onTimeUpdate?.((e as MotionFilmEvents['timeupdate']).detail.t, node),
      pointchange: (e) => { const { point, index } = (e as MotionFilmEvents['pointchange']).detail; on.current.onPointChange?.(point, index); },
      arrive: (e) => { const { point, t } = (e as MotionFilmEvents['arrive']).detail; on.current.onArrive?.(point, t); },
      ended: () => on.current.onEnded?.(),
    };
    for (const [type, fn] of Object.entries(listen)) node.addEventListener(type, fn);
    node.ready.then(() => { if (!started) ready(); }); // it may have started before this ran
    return () => { for (const [type, fn] of Object.entries(listen)) node.removeEventListener(type, fn); };
  }, [film.name]);

  return (
    <motion-film ref={el} film={film.name} mode={mode} track={track} smoothing={smoothing} start={start}
      role="img" aria-label={label ?? film.title} style={{ display: 'block', aspectRatio: film.ratio, ...style }} {...rest} />
  );
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'motion-film': DetailedHTMLProps<HTMLAttributes<MotionFilmElement>, MotionFilmElement> & {
        film: string; mode?: 'scroll'; track?: string; smoothing?: number | string; start?: number | string; label?: string;
      };
    }
  }
}
`;

/** Whether the folder is in a React project: the nearest package.json above it lists react. */
export function usesReact(dir) {
  for (let d = resolve(dir); ; d = dirname(d)) {
    const pkg = join(d, 'package.json');
    if (existsSync(pkg)) {
      try { const j = JSON.parse(readFileSync(pkg, 'utf8')); return !!(j.dependencies?.react || j.devDependencies?.react || j.peerDependencies?.react); } catch { return false; }
    }
    if (dirname(d) === d) return false;
  }
}

/** Writes a film into a folder: the film and its types always; the player when the folder has none or an older one
 * (a newer one is kept: it plays older films); MotionFilm.tsx when asked for and not there yet.
 * Returns what was written and what was left, with a line for each. */
export function writeWebFilm(root, name, dir, { react = false, example = false } = {}) {
  const film = buildFilmModule(root, name), player = buildPlayer(root);
  mkdirSync(dir, { recursive: true });
  const written = [], notes = [];
  const playerAt = join(dir, PLAYER_FILE), existing = existsSync(playerAt) ? readFileSync(playerAt, 'utf8') : null;
  const had = existing == null ? null : playerVersion(existing);
  if (existing != null && (had == null || !existing.startsWith(GENERATED))) {
    throw new Error(`${playerAt} is already there and isn't a Motion Director player; move it, or export into another folder`);
  }
  if (had != null && had > player.version) {
    notes.push(`Kept the newer player already in the folder (v${had}; this Motion Director has v${player.version}).`);
  } else {
    writeFileSync(playerAt, player.js); writeFileSync(join(dir, PLAYER_TYPES_FILE), PLAYER_TYPES);
    written.push(PLAYER_FILE, PLAYER_TYPES_FILE);
    if (had != null && had < player.version) notes.push(`Updated the player from v${had} to v${player.version}; the films already there still play.`);
  }
  writeFileSync(join(dir, `${name}.film.js`), film.js); writeFileSync(join(dir, `${name}.film.d.ts`), filmTypes(name));
  written.push(`${name}.film.js`, `${name}.film.d.ts`);
  if (react) {
    if (existsSync(join(dir, REACT_FILE))) notes.push(`Left ${REACT_FILE} as it is: it's yours once written.`);
    else { writeFileSync(join(dir, REACT_FILE), REACT_COMPONENT); written.push(REACT_FILE); }
  }
  if (example) { writeFileSync(join(dir, `${name}.web.html`), demoPage(name, film.title)); written.push(`${name}.web.html`); }
  return { written, notes, title: film.title, bytes: Buffer.byteLength(film.js), player: player.version };
}

/** A page that shows the exported film both ways: pinned to scrolling, and moved by buttons. */
export function demoPage(name, title, module = `./${name}.film.js`) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: on a web page</title>
<script type="module" src="${esc(module)}"></script>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1c1f24; background: #f6f6f3; }
  header, .after { max-width: 760px; margin: 0 auto; padding: 64px 24px; }
  /* the pinned film: as wide as the screen allows while it fits the height */
  .track { height: 400vh; }
  .track motion-film { position: sticky; top: 0; width: min(100%, calc(100vh * 16 / 9)); margin: 0 auto; }
  .points { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid #c9c9c2; background: #fff; cursor: pointer; }
  button[aria-current="true"] { background: #1c1f24; color: #fff; border-color: #1c1f24; }
  #clicked { max-width: 960px; margin: 0 auto; }
</style>
</head>
<body>
<header>
  <h1>${esc(title)}</h1>
  <p>Scroll: the film below follows the page. The buttons jump the page to each moment.</p>
  <nav class="points" id="scrollPoints" aria-label="Moments in the film"></nav>
</header>
<section class="track"><motion-film film="${esc(name)}" mode="scroll" id="scrolled"></motion-film></section>
<div class="after">
  <h2>Moved by buttons</h2>
  <p>The same film without scrolling: each button cuts to its moment and plays on from there.</p>
  <nav class="points" id="clickPoints" aria-label="Moments in the film"></nav>
</div>
<motion-film film="${esc(name)}" id="clicked"></motion-film>
<div class="after"></div>
<script type="module">
  // the element's API: points, goTo, and pointchange to show where it is
  for (const [id, nav] of [['scrolled', 'scrollPoints'], ['clicked', 'clickPoints']]) {
    const film = document.getElementById(id), bar = document.getElementById(nav);
    film.ready.then(() => film.points.forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
      b.onclick = () => (film.scrolling ? film.goTo(p.name) : film.play({ from: p.name }));
      bar.append(b);
    }));
    film.addEventListener('pointchange', (e) => [...bar.children].forEach((b, i) => b.setAttribute('aria-current', String(i === e.detail.index))));
  }
</script>
</body>
</html>
`;
}

/* the command */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), name = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const outAt = args.indexOf('--out'), root = projectRoot(), cwd = process.env.MD_CWD || process.cwd();
  if (!name) { console.error('usage: motion-director web <film> [--out <folder>] [--react | --no-react]'); process.exit(2); }
  const intoApp = outAt >= 0, out = intoApp ? resolve(cwd, args[outAt + 1] || '.') : resolve(root, 'out');
  const react = args.includes('--react') || (!args.includes('--no-react') && intoApp && usesReact(out));
  try {
    const r = writeWebFilm(root, name, out, { react, example: !intoApp });
    for (const f of r.written) console.log(resolve(out, f));
    for (const n of r.notes) console.log(n);
    if (intoApp) console.log(react
      ? `\nimport { MotionFilm } from './${relative(cwd, out).split(sep).join('/') || '.'}/MotionFilm';\nimport ${name.replace(/\W(\w)/g, (_, c) => c.toUpperCase())} from './${relative(cwd, out).split(sep).join('/') || '.'}/${name}.film.js';`
      : `\n<script type="module" src="…/${name}.film.js"></script>  then  <motion-film film="${name}"></motion-film>`);
  } catch (err) { console.error(err.message); process.exit(1); }
}
