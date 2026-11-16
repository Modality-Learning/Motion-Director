import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pageOwner, paramsQuery, readManifest, saveValues, validateValues } from './params.mjs';

const MANIFEST = {
  title: 'Film', duration: 10, other: 'kept',
  params: {
    background: { label: 'Background', type: 'choice', options: ['white', 'textured'], value: 'white' },
    speed: { label: 'Speed', type: 'number', min: 0.5, max: 2, value: 1 },
    title: { label: 'Title', type: 'text', maxLength: 20, value: 'Hello.' },
  },
};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'promo-params-'));
  mkdirSync(join(dir, 'films', 'one'), { recursive: true });
  writeFileSync(join(dir, 'films', 'one', 'film.json'), JSON.stringify(MANIFEST));
  mkdirSync(join(dir, 'comps', 'logo'), { recursive: true });
  writeFileSync(join(dir, 'comps', 'logo', 'comp.json'), JSON.stringify({ params: { pattern: { type: 'choice', options: ['pulse', 'helix'], value: 'pulse' } } }));
  return dir;
}

test('accepts a listed choice and an in-range number', () => {
  assert.deepEqual(validateValues(MANIFEST, { background: 'textured', speed: 1.5 }), { values: { background: 'textured', speed: 1.5 } });
});

test('refuses unknown parameters, unlisted choices and out-of-range numbers', () => {
  assert.match(validateValues(MANIFEST, { colour: 'red' }).error, /Unknown parameter/);
  assert.match(validateValues(MANIFEST, { background: 'red' }).error, /must be one of/);
  assert.match(validateValues(MANIFEST, { speed: 3 }).error, /out of range/);
  assert.match(validateValues(MANIFEST, { speed: '1' }).error, /out of range/);
  assert.equal(validateValues(MANIFEST, null).error, 'No values');
  assert.equal(validateValues(MANIFEST, ['white']).error, 'No values');
});

test('saving writes only the values and keeps the rest of the manifest', () => {
  const dir = fixture();

  assert.deepEqual(saveValues(dir, 'film', 'one', { background: 'textured' }), { values: { background: 'textured', speed: 1, title: 'Hello.' } });
  const saved = JSON.parse(readFileSync(join(dir, 'films', 'one', 'film.json'), 'utf8'));
  assert.equal(saved.other, 'kept');
  assert.equal(saved.params.background.value, 'textured');
  assert.equal(saveValues(dir, 'film', 'one', { background: 'red' }).error.includes('must be one of'), true);
  assert.equal(JSON.parse(readFileSync(join(dir, 'films', 'one', 'film.json'), 'utf8')).params.background.value, 'textured');
});

test('names are checked, so a path cannot reach another manifest', () => {
  const dir = fixture();

  assert.equal(readManifest(dir, 'film', '../comps/logo'), null);
  assert.equal(readManifest(dir, 'film', '_template'), null);
  assert.equal(saveValues(dir, 'film', '../../etc', { background: 'white' }).error, 'Unknown film or composition');
});

test('the query carries the page\'s values, every composition\'s, and overrides last', () => {
  const dir = fixture();
  const q = new URLSearchParams(paramsQuery(dir, 'film', 'one', { background: 'textured' }));

  assert.equal(q.get('background'), 'textured');
  assert.equal(q.get('speed'), '1');
  assert.equal(q.get('logo.pattern'), 'pulse');
});

test('finds which film or composition a page belongs to', () => {
  assert.deepEqual(pageOwner('/x/promo/films/one/index.html'), { kind: 'film', name: 'one' });
  assert.deepEqual(pageOwner('/x/promo/comps/logo/index.html'), { kind: 'comp', name: 'logo' });
  assert.equal(pageOwner('/x/promo/kit/player.js'), null);
});

test('text must be non-empty, within its length, and free of control characters other than line breaks', () => {
  assert.deepEqual(validateValues(MANIFEST, { title: 'Life gets busy.' }), { values: { title: 'Life gets busy.' } });
  assert.match(validateValues(MANIFEST, { title: '' }).error, /must be text/);
  assert.match(validateValues(MANIFEST, { title: '   ' }).error, /must be text/);
  assert.match(validateValues(MANIFEST, { title: 'x'.repeat(21) }).error, /must be text/);
  assert.deepEqual(validateValues(MANIFEST, { title: 'a\r\nb' }), { values: { title: 'a\nb' } }); // line breaks are kept, normalised
  assert.match(validateValues(MANIFEST, { title: 'a\tb' }).error, /must be text/);
  assert.match(validateValues(MANIFEST, { title: 42 }).error, /must be text/);
});
