import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { addComment, readComments } from './comment-queue.mjs';
import { agentName, callTool, handle, locateProject } from './mcp.mjs';

const BIN = resolve(fileURLToPath(new URL('..', import.meta.url)), 'bin', 'motion-director.mjs');

/* a repository whose project is in promo/, with a film and two comments on it */
function repo() {
  const top = mkdtempSync(join(tmpdir(), 'md-mcp-')), root = join(top, 'promo');
  mkdirSync(join(root, 'films', 'launch'), { recursive: true });
  writeFileSync(join(root, 'motion-director.config.mjs'), 'export default {};\n');
  writeFileSync(join(root, 'films', 'launch', 'index.html'), '<div id="stage"></div>');
  writeFileSync(join(root, 'films', 'launch', 'film.json'), JSON.stringify({ title: 'The launch', duration: 12 }));
  const out = join(root, 'out');
  const a = addComment(out, { film: 'launch', text: 'Make the title bigger', view: 'edit', t: 2 }, 'Motion Director comment on "The launch"\nAbout: #title\nMake the title bigger', { id: 'c111111aa' });
  const b = addComment(out, { film: 'launch', text: 'Softer bounce', view: 'edit', t: 5 }, 'Motion Director comment on "The launch"\nAbout: #ball\nSofter bounce', { id: 'c222222bb' });
  return { top, root, out, ids: [a?.id ?? 'c111111aa', b?.id ?? 'c222222bb'] };
}

test('the project is found above the working folder, or a few folders below it (films in promo/)', () => {
  const r = repo();
  assert.equal(locateProject(r.top, {}), r.root);
  assert.equal(locateProject(join(r.root, 'films'), {}), r.root);
  assert.equal(locateProject(mkdtempSync(join(tmpdir(), 'md-none-')), {}), null);
  assert.equal(locateProject('/anywhere', { MD_ROOT: r.root }), r.root);
});

test('read_comments gives the open notes with their ids and marks them as with the agent; resolve_comments closes them', () => {
  const r = repo();
  const read = callTool(r.root, 'read_comments', {});
  assert.equal(read.isError, undefined);
  assert.match(read.text, /2 comments from the studio/);
  assert.match(read.text, /\[c111111aa\]\nMotion Director comment on "The launch"/);
  assert.deepEqual(readComments(r.out, 'launch').map((c) => c.status), ['sent', 'sent']);
  const done = callTool(r.root, 'resolve_comments', { ids: ['c111111aa', 'cnope'] });
  assert.match(done.text, /Resolved c111111aa\. No comment cnope/);
  assert.deepEqual(readComments(r.out, 'launch').map((c) => c.status), ['resolved', 'sent']);
  assert.match(callTool(r.root, 'read_comments', { film: 'launch' }).text, /a comment from the studio/);
  callTool(r.root, 'resolve_comments', { ids: ['c222222bb'] });
  assert.equal(callTool(r.root, 'read_comments', {}).text, 'No open comments.');
});

test('the project tool names the films, and without a project every tool says how to make one', () => {
  const r = repo();
  assert.match(callTool(r.root, 'project').text, /- launch: The launch \(12 s\)/);
  const none = callTool(null, 'read_comments', {});
  assert.equal(none.isError, true);
  assert.match(none.text, /npx motion-director init/);
});

test('the protocol: initialize, tools, a call, an unknown method, and notifications get no answer', () => {
  const r = repo(), state = { root: r.root };
  const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'codex-mcp-client' } } }, state);
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(JSON.parse(readFileSync(join(r.out, '.agent.json'), 'utf8')).name, 'Codex'); // the studio names it
  assert.equal(handle({ jsonrpc: '2.0', id: 9, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, state).result.protocolVersion, '2025-06-18');
  assert.deepEqual(handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, state).result.tools.map((t) => t.name), ['project', 'read_comments', 'resolve_comments']);
  assert.match(handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'project', arguments: {} } }, state).result.content[0].text, /launch/);
  assert.equal(handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, state).error.code, -32601);
  assert.equal(handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'rm' } }, state).error.code, -32602);
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, state), null);
  assert.deepEqual([agentName('codex-mcp-client'), agentName('claude-code'), agentName('cursor'), agentName()], ['Codex', 'Claude', 'cursor', 'your agent']);
});

test('motion-director mcp speaks MCP on stdio from the repository top, finding the project below', async () => {
  const r = repo();
  const p = spawn(process.execPath, [BIN, 'mcp'], { cwd: r.top, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: p.stdout });
  const answers = [];
  const next = () => new Promise((ok) => lines.once('line', (l) => ok(JSON.parse(l))));
  const ask = async (m) => { p.stdin.write(`${JSON.stringify(m)}\n`); const a = await next(); answers.push(a); return a; };
  await ask({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } } });
  p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const call = await ask({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_comments', arguments: {} } });
  p.stdin.end();
  const code = await new Promise((ok) => p.on('exit', ok));
  assert.equal(answers[0].result.serverInfo.name, 'motion-director');
  assert.match(call.result.content[0].text, /Make the title bigger/);
  assert.equal(code, 0);
});
