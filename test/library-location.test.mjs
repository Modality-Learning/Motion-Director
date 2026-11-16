import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLibrary, saveLibraryEntry } from '../server/sound-lib.mjs';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'md-proj-')), shared = mkdtempSync(join(tmpdir(), 'md-sfx-'));
  mkdirSync(join(root, 'sounds'), { recursive: true });
  writeFileSync(join(shared, 'pop.wav'), '');
  return { root, shared };
}
const withSounds = (dir, fn) => { const had = process.env.MD_SOUNDS; process.env.MD_SOUNDS = dir; try { return fn(); } finally { if (had === undefined) delete process.env.MD_SOUNDS; else process.env.MD_SOUNDS = had; } };

test("a shared library's settings live beside its audio, not in the project", () => {
  const { root, shared } = setup();
  withSounds(shared, () => saveLibraryEntry(root, 'pop.wav', { gain: -3 }));

  assert.deepEqual(JSON.parse(readFileSync(join(shared, 'library.json'), 'utf8')), { sounds: { 'pop.wav': { gain: -3 } } });
  assert.ok(!existsSync(join(root, 'sounds', 'library.json')));
});

test("a library just moved out is read from the project's old file until its first save", () => {
  const { root, shared } = setup();
  writeFileSync(join(root, 'sounds', 'library.json'), JSON.stringify({ sounds: { 'pop.wav': { gain: -6, family: 'clicks' } } }));

  withSounds(shared, () => {
    assert.equal(readLibrary(root).sounds['pop.wav'].gain, -6);
    saveLibraryEntry(root, 'pop.wav', { gain: -1, family: 'clicks' });
    assert.equal(readLibrary(root).sounds['pop.wav'].gain, -1);
  });
  assert.ok(existsSync(join(shared, 'library.json')));
});
