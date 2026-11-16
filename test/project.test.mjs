import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PKG, findRoot, kitFile, loadConfig } from '../server/project.mjs';
import { projectFile } from '../server/static.mjs';

function project(config = "export default { name: 'Test', checks: { drift: 'scripts/drift.mjs' } };\n") {
  const root = mkdtempSync(join(tmpdir(), 'md-'));
  for (const d of ['films/a', 'kit', 'scripts', 'out']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'motion-director.config.mjs'), config);
  writeFileSync(join(root, 'films/a/index.html'), '<!doctype html>');
  writeFileSync(join(root, 'kit/brand.css'), ':root { --ink: red; }');
  writeFileSync(join(root, 'scripts/drift.mjs'), '');
  return root;
}

test('the project is the nearest folder above with a config file', () => {
  const root = project();

  assert.equal(findRoot(join(root, 'films', 'a')), root);
  assert.equal(findRoot(tmpdir()), null);
});

test('the config gives the name and resolves the drift check; a missing check is null', async () => {
  const root = project();
  const cfg = await loadConfig(root);

  assert.equal(cfg.name, 'Test');
  assert.equal(cfg.checks.drift, join(root, 'scripts/drift.mjs'));
  assert.equal((await loadConfig(project("export default { checks: { drift: 'nope.mjs' } };\n"))).checks.drift, null);
});

test("a kit file comes from the project's own kit first, then the package's", () => {
  const root = project();

  assert.equal(kitFile(root, 'brand.css'), join(root, 'kit/brand.css'));
  assert.equal(kitFile(root, 'player.js'), join(PKG, 'kit/player.js'));
  assert.equal(kitFile(root, 'nothing.js'), null);
});

test('kit paths cannot climb out or reach hidden files', () => {
  const root = project();

  for (const bad of ['../package.json', 'a/../../x', '.env', '']) assert.equal(kitFile(root, bad), null, bad);
});

test('only the served folders are reachable, and nothing outside the project', async () => {
  const root = project();

  assert.equal(await projectFile(root, '/films/a/'), join(root, 'films/a/index.html'));
  assert.equal(await projectFile(root, '/kit/player.css'), join(PKG, 'kit/player.css'));
  assert.equal(await projectFile(root, '/motion-director.config.mjs'), null);
  assert.equal(await projectFile(root, '/films/../motion-director.config.mjs'), null);
  assert.equal(await projectFile(root, '/films/%2e%2e/motion-director.config.mjs'), null);
});
