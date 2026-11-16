import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyProgressLine, filmOutputs, insideDir, listComps, listFilms, planRender } from './lib.mjs';

function promoFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'promo-studio-'));
  const film = (name, json, html) => { mkdirSync(join(dir, 'films', name), { recursive: true }); if (json) writeFileSync(join(dir, 'films', name, 'film.json'), JSON.stringify(json)); if (html) writeFileSync(join(dir, 'films', name, 'index.html'), html); };
  const bg = (value) => ({ background: { label: 'Background', type: 'choice', options: ['white', 'textured'], value } });
  film('wide', { title: 'Wide', duration: 35, params: bg('white') }, '<div id="stage"></div>');
  film('tall', { title: 'Tall', duration: 35, derivedFrom: 'wide', params: bg('textured') }, '<style>#stage { --stage-w: 1080px; }</style><script src="../../comps/logo/logo.js"></script>');
  mkdirSync(join(dir, 'comps', 'logo'), { recursive: true });
  writeFileSync(join(dir, 'comps', 'logo', 'comp.json'), JSON.stringify({ title: 'Logo', duration: 2, params: { pattern: { type: 'choice', options: ['a', 'b'], value: 'b' } } }));
  writeFileSync(join(dir, 'comps', 'logo', 'index.html'), '<div></div>');
  film('_template', { title: 'T' }, '<div></div>');
  film('broken', null, '<div></div>');
  mkdirSync(join(dir, 'out'));
  for (const f of ['wide_1440p.mp4', 'wide-board.png', 'tall_1440p_prores422hq.mov', 'wide.html', 'notes.txt']) writeFileSync(join(dir, 'out', f), 'x');
  return dir;
}

test('lists films with a manifest and page, skipping templates, and reads orientation', () => {
  const films = listFilms(promoFixture());

  assert.deepEqual(films.map((f) => [f.name, f.orientation]), [['tall', 'vertical'], ['wide', 'landscape']]);
  assert.equal(films[0].derivedFrom, 'wide');
});

test('films carry the query that passes their values, compositions included, and know which compositions they use', () => {
  const dir = promoFixture(), films = listFilms(dir);
  const tall = films.find((f) => f.name === 'tall');

  assert.deepEqual(tall.comps, ['logo']);
  assert.equal(new URLSearchParams(tall.query).get('background'), 'textured');
  assert.equal(new URLSearchParams(tall.query).get('logo.pattern'), 'b');
  assert.deepEqual(listComps(dir, films).map((c) => [c.name, c.usedBy]), [['logo', ['tall']]]);
});

test('plans a render with a file name per combination', () => {
  const films = listFilms(promoFixture());

  const share = planRender({ film: 'wide', preset: 'share', size: '1440p' }, films);
  const master = planRender({ film: 'tall', preset: 'master', size: '4k' }, films);

  // the look comes from the film's own parameters; the name notes a textured background
  assert.deepEqual(share, { film: 'wide', file: 'wide_1440p.mp4', env: { CODEC: 'h264', DSF: '1.3333333333', SOUND: '1', WAV: '0' } });
  assert.equal(master.file, 'tall_4k_textured_prores422hq.mov');
  assert.equal(master.env.CODEC, 'prores422hq');
});

test('sound is mixed in unless the render asks to be silent', () => {
  const films = listFilms(promoFixture());
  assert.equal(planRender({ film: 'wide', preset: 'share', size: '1080p', sound: false }, films).env.SOUND, '0');
  assert.equal(planRender({ film: 'wide', preset: 'share', size: '1080p', sound: true }, films).env.SOUND, '1');
});

test('the mix is kept as a separate WAV only when asked for, and never for a silent render', () => {
  const films = listFilms(promoFixture()), plan = (o) => planRender({ film: 'wide', preset: 'share', size: '1080p', ...o }, films).env.WAV;
  assert.equal(plan({ sound: true }), '0');
  assert.equal(plan({ sound: true, wav: true }), '1');
  assert.equal(plan({ sound: false, wav: true }), '0');
});

test('refuses unknown films and options, including path tricks in the film name', () => {
  const films = listFilms(promoFixture());
  const ok = { film: 'wide', preset: 'share', size: '1440p' };

  assert.equal(planRender({ ...ok, film: '../../etc' }, films).error, 'Unknown film');
  assert.equal(planRender({ ...ok, film: '_template' }, films).error, 'Unknown film');
  assert.equal(planRender({ ...ok, preset: 'gif' }, films).error, 'Unknown preset');
  assert.equal(planRender({ ...ok, size: '8k' }, films).error, 'Unknown size');
  assert.equal(planRender(null, films).error, 'Unknown film');
});

test('keeps paths inside the directory', () => {
  assert.equal(insideDir('/promo/out', 'film.mp4'), '/promo/out/film.mp4');
  assert.equal(insideDir('/promo/out', '/film.mp4'), '/promo/out/film.mp4');
  assert.equal(insideDir('/promo/out', '../films/x/index.html'), null);
  assert.equal(insideDir('/promo/out', '../../../etc/passwd'), null);
  assert.equal(insideDir('/promo/out', ''), null);
  assert.equal(insideDir('/promo/out', 42), null);
  assert.equal(insideDir('/promo/out', 'a\0b'), null);
});

test('lists only a film\'s own videos, storyboard and bundle', () => {
  const dir = promoFixture();

  assert.deepEqual(filmOutputs(join(dir, 'out'), 'wide').map((o) => o.file).sort(), ['wide-board.png', 'wide.html', 'wide_1440p.mp4']);
  assert.deepEqual(filmOutputs(join(dir, 'out'), 'tall').map((o) => o.kind), ['Video (ProRes)']);
  assert.deepEqual(filmOutputs(join(dir, 'missing'), 'wide'), []);
});

test('turns render output into progress: capture is 90%, encoding the rest', () => {
  const job = {};
  applyProgressLine(job, 'study: UI sources changed since b4a6591f');
  applyProgressLine(job, 'capturing 100 frames (white background, scale 1, 25 fps) in 4 processes');
  ['captured 25', 'captured 25'].forEach((l) => applyProgressLine(job, l));

  assert.equal(job.phase, 'Capturing frames');
  assert.equal(job.progress, 45);

  ['captured 25', 'captured 25', 'encoded 0 / 100'].forEach((l) => applyProgressLine(job, l));
  assert.equal(job.phase, 'Encoding');
  assert.equal(job.progress, 90);

  applyProgressLine(job, 'ok 100 frames -> /out/x.mp4');
  assert.equal(job.phase, 'Done');
  assert.equal(job.progress, 100);
});

test('a changed file says what an open studio should update', async () => {
  const { changeOf } = await import('./lib.mjs');
  assert.deepEqual(changeOf('films', 'tall/sound.json'), { type: 'sound', film: 'tall' });
  assert.deepEqual(changeOf('films', 'tall/film.json'), { type: 'piece', film: 'tall' });
  assert.deepEqual(changeOf('films', 'tall/BRIEF.md'), { type: 'brief', film: 'tall' });
  assert.deepEqual(changeOf('comps', 'logo/BRIEF.md'), { type: 'brief', comp: 'logo' });
  assert.equal(changeOf('films', 'tall/notes/BRIEF.md'), null);
  assert.deepEqual(changeOf('films', 'tall/index.html'), { type: 'code', film: 'tall' });
  assert.deepEqual(changeOf('comps', 'logo-reveal/comp.json'), { type: 'piece', comp: 'logo-reveal' });
  assert.deepEqual(changeOf('comps', 'logo-reveal/logo.js'), { type: 'code', comp: 'logo-reveal' });
  assert.deepEqual(changeOf('kit', 'player.js'), { type: 'code', kit: true });
  assert.deepEqual(changeOf('sounds', 'library.json'), { type: 'library' });
  assert.deepEqual(changeOf('sounds', 'whooshes/air.wav'), { type: 'sounds' });
  // the template, hidden and temp files, tests and notes need nothing
  for (const [where, rel] of [['films', '_template/index.html'], ['films', 'tall/.index.html.swp'], ['kit', 'sound.test.mjs'], ['sounds', 'README.md'], ['films', 'tall/notes.txt'], ['films', 'tall']]) assert.equal(changeOf(where, rel), null, rel);
});
