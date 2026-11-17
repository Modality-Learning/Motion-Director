import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STALE_MS, clearAgentStatus, readAgentStatus, setAgentStatus, tidy } from './agent-status.mjs';
import { callTool } from './mcp.mjs';

const BIN = resolve(fileURLToPath(new URL('..', import.meta.url)), 'bin', 'motion-director.mjs');

test('a status is one short line: a few words, no full stop, never empty', () => {
  assert.equal(tidy('  Softening   the\nbounce. '), 'Softening the bounce');
  assert.equal(tidy('one two three four five six seven eight nine ten').split(' ').length, 8);
  assert.ok(tidy('x'.repeat(200)).length <= 60);
  assert.throws(() => setAgentStatus(mkdtempSync(join(tmpdir(), 'md-st-')), { text: '  ' }), /few words/);
});

test('set, read and clear; an old status counts as over', () => {
  const out = mkdtempSync(join(tmpdir(), 'md-st-'));
  const at = new Date('2026-11-17T10:00:00Z');
  setAgentStatus(out, { text: 'Softening the bounce', film: 'hello', about: '#ball', by: 'Claude' }, at);
  assert.deepEqual(readAgentStatus(out, at.getTime() + 1000), { text: 'Softening the bounce', film: 'hello', about: '#ball', by: 'Claude', at: at.toISOString() });
  assert.equal(readAgentStatus(out, at.getTime() + STALE_MS + 1), null);
  clearAgentStatus(out);
  assert.equal(readAgentStatus(out), null);
  clearAgentStatus(out); // clearing twice is fine
});

test('motion-director status sets it, prints it and clears it', () => {
  const root = mkdtempSync(join(tmpdir(), 'md-st-cli-'));
  mkdirSync(join(root, 'films'));
  writeFileSync(join(root, 'motion-director.config.mjs'), 'export default {};\n');
  const run = (...a) => spawnSync(process.execPath, [BIN, 'status', ...a, '--root', root], { encoding: 'utf8' });
  assert.match(run('Tightening', 'the', 'title', '--film', 'hello').stdout, /Status: Tightening the title/);
  assert.match(run().stdout, /Tightening the title \(hello\)/);
  assert.match(run('--done').stdout, /cleared/);
  assert.ok(!existsSync(join(root, 'out', 'comments', 'status.json')));
  assert.match(run().stdout, /No status/);
});

test('the MCP tool sets the status as the connected agent, and done clears it', () => {
  const root = mkdtempSync(join(tmpdir(), 'md-st-mcp-'));
  const out = join(root, 'out');
  assert.match(callTool(root, 'set_status', { text: 'Recolouring the card', film: 'hello' }, { agent: 'Codex' }).text, /Status: Recolouring the card/);
  assert.equal(readAgentStatus(out).by, 'Codex');
  assert.equal(callTool(root, 'set_status', { done: true }).text, 'Status cleared.');
  assert.equal(readAgentStatus(out), null);
});
