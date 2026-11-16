import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, mergeOrganised, toOrganise } from '../server/organise.mjs';
import { validateLibrary } from '../kit/sound.mjs';

const files = [{ path: 'a/click 01.wav' }, { path: 'a/thing.wav' }, { path: 'b/whoosh.wav' }];
const lib = { sounds: { 'a/thing.wav': { gain: -6, family: 'impacts', organised: '2026-11-01' } } };

test('only sounds not organised yet are listed, with the count of those that are', () => {
  const r = toOrganise(files, lib, {});

  assert.deepEqual([r.total, r.organised, r.waiting], [3, 1, 2]);
  assert.deepEqual(r.sounds.map((s) => s.path), ['a/click 01.wav', 'b/whoosh.wav']);
  assert.equal(toOrganise(files, lib, {}, { all: true }).sounds.length, 3);
  assert.deepEqual(toOrganise(files, lib, {}, { folder: 'b' }).sounds.map((s) => s.path), ['b/whoosh.wav']);
  assert.equal(toOrganise(files, lib, {}, { n: 1 }).sounds.length, 1);
});

test('a sound says where the studio files it now and why', () => {
  assert.equal(describe('a/click 01.wav').familyFrom, 'name');
  assert.equal(describe('a/thing.wav', { family: 'impacts' }).familyFrom, 'set');
  assert.equal(describe('a/thing.wav').familyFrom, 'none');
});

test("a batch replaces the given fields, keeps the sound's own settings and marks it organised today", () => {
  const { entries, errors } = mergeOrganised(lib, { 'a/thing.wav': { family: 'paper', tags: ['Rustle'], description: 'A dry rustle.' } }, '2026-11-16');

  assert.deepEqual(errors, []);
  assert.deepEqual(entries['a/thing.wav'], { gain: -6, family: 'paper', tags: ['rustle'], description: 'A dry rustle.', organised: '2026-11-16' });
  assert.ok(!validateLibrary({ sounds: entries }).error);
});

test('an empty value clears a field; a field left out is kept', () => {
  const { entries } = mergeOrganised({ sounds: { 'x.wav': { tags: ['a'], description: 'old' } } }, { 'x.wav': { tags: [] } }, '2026-11-16');

  assert.deepEqual(entries['x.wav'], { description: 'old', organised: '2026-11-16' });
});

test('bad entries are reported and skipped, not the whole batch', () => {
  const known = new Set(files.map((f) => f.path));
  const { entries, errors } = mergeOrganised(lib, {
    'a/click 01.wav': { family: 'clicks' },
    'a/thing.wav': { family: 'spaceships' },
    'b/whoosh.wav': { gain: 3 },
    'nope.wav': { family: 'clicks' },
  }, '2026-11-16', known);

  assert.deepEqual(Object.keys(entries), ['a/click 01.wav']);
  assert.equal(errors.length, 3);
  assert.match(errors.join('\n'), /Unknown family/);
  assert.match(errors.join('\n'), /not gain/);
  assert.match(errors.join('\n'), /not in the library/);
});

test('the organised mark must be a date', () => {
  assert.match(validateLibrary({ sounds: { 'x.wav': { organised: 'yesterday' } } }).error, /YYYY-MM-DD/);
  assert.ok(!validateLibrary({ sounds: { 'x.wav': { organised: '2026-11-16' } } }).error);
});
