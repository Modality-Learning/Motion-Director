import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addComment, deliver, filmsOf, formatBatch, newId, probe, readComments, sessionInbox, setStatus } from './comment-queue.mjs';

const COMMENT = { film: 'tour', view: 'edit', frame: null, t: 3.5, target: { selector: '#ball', text: null }, text: 'Land the last bounce softer.' };
const NOTE = 'Motion Director comment on "Tour"\nFilm: films/tour/index.html\nAbout: (#ball) at 0:03.5\nComment: Land the last bounce softer.';
const out = () => mkdtempSync(join(tmpdir(), 'md-queue-'));

test('a comment is queued, then sent, then resolved; its About line comes along for the list', () => {
  const dir = out();
  const c = addComment(dir, COMMENT, NOTE, { id: 'c1' });
  assert.equal(c.status, 'queued');
  assert.equal(c.about, '(#ball) at 0:03.5');

  setStatus(dir, 'tour', ['c1'], 'sent');
  assert.equal(readComments(dir, 'tour')[0].status, 'sent');
  setStatus(dir, 'tour', ['c1'], 'resolved');
  const [read] = readComments(dir, 'tour');
  assert.equal(read.status, 'resolved');
  assert.equal(read.text, 'Land the last bounce softer.');
});

test('removed comments leave the list; unknown statuses are refused', () => {
  const dir = out();
  addComment(dir, COMMENT, NOTE, { id: 'a1' }); addComment(dir, COMMENT, NOTE, { id: 'a2' });
  setStatus(dir, 'tour', ['a1'], 'removed');
  assert.deepEqual(readComments(dir, 'tour').map((c) => c.id), ['a2']);
  assert.throws(() => setStatus(dir, 'tour', ['a2'], 'done'), /Unknown status/);
});

test('older logs (before ids) read as resolved, and a broken line is skipped', () => {
  const dir = out();
  mkdirSync(join(dir, 'comments'));
  appendFileSync(join(dir, 'comments', 'tour.jsonl'), `${JSON.stringify({ at: 'x', film: 'tour', view: 'storyboard', t: 1, text: 'Old one', note: 'About: the video at 0:01.0\nComment: Old one' })}\nnot json\n`);
  const [old] = readComments(dir, 'tour');
  assert.equal(old.status, 'resolved');
  assert.equal(old.about, 'the video at 0:01.0');
  assert.match(old.id, /^old\d+$/);
});

test('ids are found across the project, for the command line', () => {
  const dir = out();
  addComment(dir, COMMENT, NOTE, { id: 'x1' });
  addComment(dir, { ...COMMENT, film: 'hello' }, NOTE, { id: 'x2' });
  assert.deepEqual([...filmsOf(dir, ['x1', 'x2', 'nope'])].sort(), [['x1', 'tour'], ['x2', 'hello']]);
});

test('a batch says how to mark each one done, then gives the notes oldest first', () => {
  const text = formatBatch([{ id: 'c1', note: 'first' }, { id: 'c2', note: 'second' }], 'motion-director comments resolve');
  assert.match(text, /^Motion Director: 2 comments from the studio\./);
  assert.match(text, /motion-director comments resolve <id> \(several ids at once are fine\)/);
  assert.ok(text.indexOf('[c1]\nfirst') < text.indexOf('[c2]\nsecond'));
});

test('ids are short and lower-case', () => {
  assert.match(newId(1794840000000, () => 0.5), /^c[a-z0-9]{8}$/);
});

test('the session inbox comes from the environment the studio was started in', () => {
  assert.equal(sessionInbox({}), null);
  assert.deepEqual(sessionInbox({ CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/s.sock', CLAUDE_CODE_MESSAGING_TOKEN: 't' }), { socket: '/tmp/s.sock', token: 't' });
});

test('delivery writes the auth line, then one user message, to the inbox', async () => {
  const socket = join(mkdtempSync(join(tmpdir(), 'md-inbox-')), 'in.sock');
  let got = '';
  const server = net.createServer((s) => s.on('data', (d) => { got += d; }));
  await new Promise((ok) => server.listen(socket, ok));
  assert.equal(await deliver({ socket, token: 'tok' }, 'hello\nthere'), true);
  await new Promise((ok) => setTimeout(ok, 50));
  server.close();
  const [auth, msg, rest] = got.split('\n');
  assert.deepEqual(JSON.parse(auth), { type: 'auth', token: 'tok' });
  assert.deepEqual(JSON.parse(msg), { type: 'user', message: { role: 'user', content: 'hello\nthere' } });
  assert.equal(rest, '');
});

test('delivery to a session that has gone fails cleanly, so the studio falls back to the clipboard', async () => {
  assert.equal(await deliver({ socket: join(tmpdir(), 'md-no-such.sock'), token: null }, 'x', 500), false);
});

test('the link check: true while something listens at the inbox, false once it has gone', async () => {
  const socket = join(mkdtempSync(join(tmpdir(), 'md-probe-')), 'in.sock');
  let wrote = '';
  const server = net.createServer((s) => s.on('data', (d) => { wrote += d; }));
  await new Promise((ok) => server.listen(socket, ok));
  assert.equal(await probe({ socket }), true);
  await new Promise((ok) => server.close(ok));
  assert.equal(await probe({ socket }, 300), false);
  assert.equal(wrote, ''); // it only connects: nothing reaches the session
});
