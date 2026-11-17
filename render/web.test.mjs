import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLAYER_FILE, buildFilmModule, buildPlayer, demoPage, forShadow, playerVersion, readFilmPage, stageRatio, usesReact, writeWebFilm } from './web.mjs';
import { filmOutputs } from '../server/lib.mjs';

const EXAMPLE = resolve(fileURLToPath(new URL('..', import.meta.url)), 'example');

test('the film page is taken apart: markup inside the player, its own scripts, the kit without the player', () => {
  const page = readFilmPage(EXAMPLE, 'tour');
  assert.match(page.html, /^<div id="stage">/);
  assert.doesNotMatch(page.html, /<script|<main/);
  assert.deepEqual(page.scripts.map((s) => s.from), ['../../kit/motion.js', 'inline']);
  assert.ok(page.fonts.every((f) => f.startsWith('https://')) && page.fonts.length);
  // stage.css came in with the brand it imports; player.css (the screening room) did not
  assert.match(page.css, /--cream:/);
  assert.doesNotMatch(page.css, /\.controls\b/);
});

test('variables on :root move to the element in a shadow root', () => {
  assert.equal(forShadow(':root { --a: 1 }\n:root,#x{}'), ':host { --a: 1 }\n:host,#x{}');
});

test('a film module imports the player beside it, runs film scripts as functions and carries the parameters', () => {
  const { js, player } = buildFilmModule(EXAMPLE, 'tour');
  assert.doesNotMatch(js, /new Function|eval\(/);
  assert.match(js, /^import \{ register \} from '\.\/motion-film\.js';$/m);
  assert.match(js, /\(document, window, location, Motion\) => \{/);
  assert.match(js, /"title-0":/);
  assert.match(js, new RegExp(`player: ${player},`));
  assert.match(js, /ratio: "1920 \/ 1080",/);
  assert.doesNotMatch(js, /class MotionFilmElement/); // the player isn't copied into each film
  const dir = mkdtempSync(join(tmpdir(), 'md-web-'));
  writeFileSync(join(dir, 'tour.film.mjs'), js);
  const r = spawnSync(process.execPath, ['--check', join(dir, 'tour.film.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the player says what it is and which version, and a vertical stage keeps its shape', () => {
  const { js, version } = buildPlayer(EXAMPLE);
  assert.match(js, /^\/\/ Motion Director web player v\d+, written by/);
  assert.equal(playerVersion(js), version);
  assert.equal(playerVersion('export const x = 1;'), null);
  assert.equal(stageRatio('#stage { width: var(--stage-w, 1920px) } #stage { --stage-w: 1080px; --stage-h: 1920px; }'), '1080 / 1920');
  assert.equal(stageRatio(''), '1920 / 1080');
});

test('written into a folder, films share one player, and a server can import them (nothing runs without a browser)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md-web-into-'));
  const a = writeWebFilm(EXAMPLE, 'tour', dir);
  assert.deepEqual(a.written, [PLAYER_FILE, 'motion-film.d.ts', 'tour.film.js', 'tour.film.d.ts']);
  const b = writeWebFilm(EXAMPLE, 'hello', dir);
  assert.ok(b.written.includes('hello.film.js') && existsSync(join(dir, 'tour.film.js')));
  const tour = (await import(pathToFileURL(join(dir, 'tour.film.js')).href)).default;
  const player = await import(pathToFileURL(join(dir, PLAYER_FILE)).href);
  assert.equal(tour.name, 'tour');
  assert.equal(tour.title, 'A tour of Motion Director');
  assert.equal(player.films.tour, tour); // registered with the one player
  assert.equal(globalThis.customElements, undefined);
});

test('an older player in the folder is replaced, a newer one kept, and a file that is not one is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md-web-ver-'));
  const at = join(dir, PLAYER_FILE), { version } = buildPlayer(EXAMPLE);
  writeFileSync(at, '// Motion Director web player v0\nexport const PLAYER_VERSION = 0;\n');
  assert.match(writeWebFilm(EXAMPLE, 'tour', dir).notes.join(' '), new RegExp(`from v0 to v${version}`));
  assert.equal(playerVersion(readFileSync(at, 'utf8')), version);
  writeFileSync(at, '// Motion Director web player v99\nexport const PLAYER_VERSION = 99;\n');
  const kept = writeWebFilm(EXAMPLE, 'tour', dir);
  assert.ok(!kept.written.includes(PLAYER_FILE) && /Kept the newer player/.test(kept.notes.join(' ')));
  assert.equal(playerVersion(readFileSync(at, 'utf8')), 99);
  writeFileSync(at, 'export const mine = true;\n');
  assert.throws(() => writeWebFilm(EXAMPLE, 'tour', dir), /isn't a Motion Director player/);
});

test('in a React project the component is written once, and then it is yours', () => {
  const app = mkdtempSync(join(tmpdir(), 'md-web-react-'));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }));
  const dir = join(app, 'src', 'films');
  assert.equal(usesReact(dir), true);
  assert.equal(usesReact(mkdtempSync(join(tmpdir(), 'md-web-plain-'))), false);
  assert.ok(writeWebFilm(EXAMPLE, 'tour', dir, { react: true }).written.includes('MotionFilm.tsx'));
  writeFileSync(join(dir, 'MotionFilm.tsx'), '// changed by me');
  const again = writeWebFilm(EXAMPLE, 'tour', dir, { react: true });
  assert.ok(!again.written.includes('MotionFilm.tsx') && /it's yours/.test(again.notes.join(' ')));
  assert.equal(readFileSync(join(dir, 'MotionFilm.tsx'), 'utf8'), '// changed by me');
});

test('only film names are built, and a script from elsewhere is refused', () => {
  assert.throws(() => readFilmPage(EXAMPLE, '../tour'), /Not a film name/);
  assert.throws(() => readFilmPage(EXAMPLE, 'no-such-film'), /No film called/);
  const root = mkdtempSync(join(tmpdir(), 'md-web-root-'));
  mkdirSync(join(root, 'films', 'x'), { recursive: true });
  writeFileSync(join(root, 'films', 'x', 'index.html'), '<body><script src="../../../outside.js"></script></body>');
  assert.throws(() => readFilmPage(root, 'x'), /outside the project/);
  writeFileSync(join(root, 'films', 'x', 'index.html'), '<body><script src="https://cdn.example/x.js"></script></body>');
  assert.throws(() => readFilmPage(root, 'x'), /remote scripts/);
});

test('the example page escapes the title and drives both copies through the element', () => {
  const html = demoPage('tour', 'A <b>"tour"</b>');
  assert.match(html, /<title>A &lt;b&gt;&quot;tour&quot;&lt;\/b&gt;: on a web page<\/title>/);
  assert.match(html, /mode="scroll"/);
  assert.match(html, /film\.goTo\(p\.name\)/);
  assert.match(html, /src="\.\/tour\.film\.js"/);
});

test('web exports are listed with the film\'s files, and other scripts are not', () => {
  const out = mkdtempSync(join(tmpdir(), 'md-web-out-'));
  for (const f of ['tour.film.js', 'tour.web.html', 'tour.html', 'tour.js', 'tour.film.d.ts', 'motion-film.js']) writeFileSync(join(out, f), 'x');
  const kinds = Object.fromEntries(filmOutputs(out, 'tour').map((o) => [o.file, o.kind]));
  assert.deepEqual(kinds, { 'tour.film.js': 'Web film', 'tour.web.html': 'Web film example page', 'tour.html': 'Single-file preview' });
});

test('a React site typechecks against the written files, and a wrong prop does not', () => {
  const REPO = resolve(EXAMPLE, '..'), app = join(REPO, 'node_modules', '.cache', 'md-web-tsc'); // inside the repo, so react's types resolve
  const dir = join(app, 'src', 'films');
  rmSync(app, { recursive: true, force: true }); // MotionFilm.tsx is only written into a folder without one
  writeWebFilm(EXAMPLE, 'tour', dir, { react: true });
  writeFileSync(join(app, 'src', 'Page.tsx'), `import { useRef } from 'react';
import { MotionFilm, type MotionFilmElement } from './films/MotionFilm';
import tour from './films/tour.film.js';
export function Page() {
  const film = useRef<MotionFilmElement>(null);
  const moments: string[] = tour.title ? (film.current?.points ?? []).map((p) => p.note ?? p.name) : [];
  return <>
    <MotionFilm film={tour} ref={film} mode="scroll" smoothing={0.2} onPointChange={(p, i) => console.log(p?.name, i, moments)} />
    <motion-film film="tour" mode="scroll" />
    {/* @ts-expect-error only "scroll" is a mode */}
    <MotionFilm film={tour} mode="sideways" />
    <button onClick={() => film.current?.goTo('Step 2', { duration: 1 })}>Step 2</button>
  </>;
}
`);
  writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, types: [] }, include: ['src'] }));
  const r = spawnSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', app], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
