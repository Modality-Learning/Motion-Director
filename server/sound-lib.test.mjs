import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { importName, importTarget, listSounds, mixPlan, readSheet, saveLibraryEntry, saveSheet, soundFile } from './sound-lib.mjs';

function promo() {
  const dir = mkdtempSync(join(tmpdir(), 'promo-sound-'));
  mkdirSync(join(dir, 'films', 'one'), { recursive: true });
  mkdirSync(join(dir, 'sounds', 'whooshes'), { recursive: true });
  writeFileSync(join(dir, 'sounds', 'whooshes', 'air.wav'), 'x');
  writeFileSync(join(dir, 'sounds', 'notes.txt'), 'x');
  writeFileSync(join(dir, 'sounds', '.hidden.wav'), 'x');
  return dir;
}

test('the library lists audio files by their path inside it, skipping hidden and other files', () => {
  delete process.env.PROMO_SOUNDS;
  const dir = promo();
  assert.deepEqual(listSounds(dir).map((f) => f.path), ['whooshes/air.wav']);
});

test('sound paths resolve only inside the library, also through PROMO_SOUNDS', () => {
  const dir = promo(), other = mkdtempSync(join(tmpdir(), 'promo-lib-'));
  writeFileSync(join(other, 'bang.wav'), 'x');
  delete process.env.PROMO_SOUNDS;
  assert.equal(soundFile(dir, 'whooshes/air.wav'), join(dir, 'sounds', 'whooshes', 'air.wav'));
  assert.equal(soundFile(dir, '../films/x.wav'), null);
  process.env.PROMO_SOUNDS = other;
  try {
    assert.deepEqual(listSounds(dir).map((f) => f.path), ['bang.wav']);
    assert.equal(soundFile(dir, 'bang.wav'), join(other, 'bang.wav'));
  } finally { delete process.env.PROMO_SOUNDS; }
});

test('cue sheets and defaults are validated before they are written', () => {
  const dir = promo();
  assert.equal(saveSheet(dir, 'one', { cues: [{ id: 'c1', sound: 'whooshes/air.wav', at: 2.5 }] }).error, undefined);
  assert.equal(readSheet(dir, 'one').cues[0].at, 2.5);
  assert.match(saveSheet(dir, 'one', { cues: [{ id: 'c1', sound: '/etc/passwd.wav', moment: 'm' }] }).error, /library/);
  assert.equal(saveSheet(dir, '../one', { cues: [] }).error, 'Unknown film');
  assert.equal(saveSheet(dir, 'nope', { cues: [] }).error, 'Unknown film');

  saveLibraryEntry(dir, 'whooshes/air.wav', { gain: -6 });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'sounds', 'library.json'), 'utf8')), { sounds: { 'whooshes/air.wav': { gain: -6 } } });
  saveLibraryEntry(dir, 'whooshes/air.wav', null);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'sounds', 'library.json'), 'utf8')), { sounds: {} });
  assert.match(saveLibraryEntry(dir, 'whooshes/air.wav', { rate: 10 }).error, /Speed/);
});

test('the mix plan gives each voice its file, and leaves out sounds missing from the library', () => {
  const v = (sound, at) => ({ cue: 'c', sound, at, from: 0.1, to: null, gain: -6, rate: 2, keepPitch: false, fadeIn: 0, fadeOut: 0.2 });

  const plan = mixPlan([v('w.wav', 1.5), v('w.wav', 3), v('gone.wav', 4)], { 'w.wav': '/lib/w.wav' }, 35);

  assert.equal(plan.duration, 35);
  assert.deepEqual(plan.voices.map((x) => [x.file, x.at]), [['/lib/w.wav', 1.5], ['/lib/w.wav', 3]]);
  assert.deepEqual(Object.keys(plan.voices[0]).sort(), ['at', 'fadeIn', 'fadeOut', 'file', 'from', 'gain', 'keepPitch', 'rate', 'to']);
});

test('a symlink out of the library is still refused by path', () => {
  const dir = promo();
  try { symlinkSync('/etc', join(dir, 'sounds', 'etc')); } catch { return; }
  assert.equal(soundFile(dir, 'etc/../../x.wav'), null);
});

test('files dropped from Finder keep their name, made safe, and never replace a sound', () => {
  delete process.env.PROMO_SOUNDS;
  const dir = promo();
  assert.equal(importName('Big Whoosh (long).WAV'), 'Big Whoosh (long).WAV');
  assert.equal(importName('café ding.aiff'), 'café ding.aiff');
  assert.equal(importName('../../etc/evil.wav'), 'evil.wav');
  assert.equal(importName('.hidden.wav'), 'hidden.wav');
  assert.equal(importName('a:b*c?.mp3'), 'a-b-c-.mp3');
  for (const bad of ['notes.txt', 'script.wav.sh', '', '...', null]) assert.equal(importName(bad), null, String(bad));

  writeFileSync(join(dir, 'sounds', 'boom.wav'), 'x');
  assert.deepEqual(importTarget(dir, 'boom.wav'), { rel: 'boom 2.wav', file: join(dir, 'sounds', 'boom 2.wav') });
  assert.equal(importTarget(dir, 'fresh.wav').rel, 'fresh.wav');
});
