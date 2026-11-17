import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addStarterSounds, writeNotes } from './setup.mjs';

const BIN = resolve(fileURLToPath(new URL('..', import.meta.url)), 'bin', 'motion-director.mjs');

test('init makes a project with a starter film, the starter sounds tracked in git, and notes for Claude', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md-init-'));
  const r = spawnSync(process.execPath, [BIN, 'init', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['motion-director.config.mjs', 'films/_template/index.html', 'NOTES.md', 'sounds/library.json', 'sounds/pop.wav', 'sounds/typing.wav']) assert.ok(existsSync(join(dir, f)), f);
  const lib = JSON.parse(readFileSync(join(dir, 'sounds', 'library.json'), 'utf8'));
  assert.equal(Object.keys(lib.sounds).length, 14);
  assert.match(lib.sounds['pop.wav'].description, /pop/);
  const ignore = readFileSync(join(dir, 'sounds', '.gitignore'), 'utf8');
  assert.match(ignore, /^\*$/m);
  assert.match(ignore, /^!pop\.wav$/m);
  assert.match(r.stdout, /14 starter sounds/);
  assert.match(r.stdout, /\/plugin install motion-director --marketplace Modality-Learning\/Motion-Director/);
  assert.ok(!existsSync(join(dir, '.claude')), 'no skill files written into the project');
});

test('starter sounds keep a project\'s own notes about them, and notes already there are left alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md-starter-'));
  writeFileSync(join(dir, 'NOTES.md'), 'mine');
  await addStarterSounds(dir);
  const libFile = join(dir, 'sounds', 'library.json');
  const lib = JSON.parse(readFileSync(libFile, 'utf8'));
  lib.sounds['pop.wav'].description = 'my own words';
  writeFileSync(libFile, JSON.stringify(lib));
  await addStarterSounds(dir);
  assert.equal(JSON.parse(readFileSync(libFile, 'utf8')).sounds['pop.wav'].description, 'my own words');
  assert.equal(writeNotes(dir).written, false);
  assert.equal(readFileSync(join(dir, 'NOTES.md'), 'utf8'), 'mine');
});

test('motion-director codex links the skill into the repository\'s .agents/skills and prints the MCP command', () => {
  const top = mkdtempSync(join(tmpdir(), 'md-codex-'));
  spawnSync('git', ['init', '-q', top]);
  const project = join(top, 'promo');
  assert.equal(spawnSync(process.execPath, [BIN, 'init', project]).status, 0);
  const r = spawnSync(process.execPath, [BIN, 'codex'], { cwd: project, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const link = join(top, '.agents', 'skills', 'motion-director');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.ok(existsSync(join(link, 'SKILL.md')), 'the link reaches the skill');
  assert.match(r.stdout, /codex mcp add motion-director -- ".*node.*" ".*bin\/motion-director\.mjs" mcp --root ".*promo"/);
  // run again: what's there is kept
  assert.match(spawnSync(process.execPath, [BIN, 'codex'], { cwd: project, encoding: 'utf8' }).stdout, /Kept what's already at/);
});
