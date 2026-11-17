// The comment queue: each comment from the studio gets an id and a status, and goes to Claude.
//   queued    waiting (⌘Enter in the comment box); sent with the next Enter, or Send all in the comments list
//   sent      with Claude: through the session that started the studio, or copied to paste by hand
//   resolved  Claude has made the change (`motion-director comments resolve <id>`)
//   removed   taken out by hand: from the queue before it was sent, or cleared after it never got picked up
// The log is the project's out/comments/<film>.jsonl, append-only: a line per comment, then a line per change of
// status. Older lines (before ids) read as resolved: they were copied and pasted, and are done with.
//
// Sending: a studio started from a Claude Code session inherits that session's inbox (CLAUDE_CODE_MESSAGING_SOCKET
// and _TOKEN), and posts the notes there. An idle session starts a turn with them; a busy one reads them between
// steps. Without an inbox the notes go to the clipboard, as before.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

export const STATUSES = ['queued', 'sent', 'resolved', 'removed'];
const logFile = (outDir, film) => join(outDir, 'comments', `${film}.jsonl`);

/** A short id, unique enough for one project's comments: time, then a little randomness. */
export function newId(now = Date.now(), rand = Math.random) {
  return `c${now.toString(36).slice(-6)}${Math.floor(rand() * 1296).toString(36).padStart(2, '0')}`;
}

function append(outDir, film, line) {
  mkdirSync(join(outDir, 'comments'), { recursive: true });
  appendFileSync(logFile(outDir, film), JSON.stringify(line) + '\n');
}

/** Adds a comment to the film's log with its note, queued. */
export function addComment(outDir, comment, note, { id = newId(), now = new Date() } = {}) {
  const about = (note.match(/^About: (.*)$/m) || [])[1] || null;
  const line = { id, at: now.toISOString(), status: 'queued', ...comment, about, note };
  append(outDir, comment.film, line);
  return line;
}

/** Records a change of status for some of a film's comments. */
export function setStatus(outDir, film, ids, status, now = new Date()) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  for (const id of ids) append(outDir, film, { event: 'status', id, status, at: now.toISOString() });
}

/** A film's comments, oldest first, each with its current status (removed ones left out). */
export function readComments(outDir, film) {
  let text = ''; try { text = readFileSync(logFile(outDir, film), 'utf8'); } catch { return []; }
  const byId = new Map(); let legacy = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let l; try { l = JSON.parse(raw); } catch { continue; }
    if (l.event === 'status') { const c = byId.get(l.id); if (c && STATUSES.includes(l.status)) { c.status = l.status; c.changed = l.at; } continue; }
    const id = l.id || `old${++legacy}`;
    byId.set(id, { ...l, id, status: l.id ? l.status || 'queued' : 'resolved', about: l.about ?? (l.note?.match(/^About: (.*)$/m) || [])[1] ?? null });
  }
  return [...byId.values()].filter((c) => c.status !== 'removed');
}

/** Which film each id belongs to, from every log in the project (for the command line, which has only ids). */
export function filmsOf(outDir, ids) {
  const dir = join(outDir, 'comments'), found = new Map();
  if (!existsSync(dir)) return found;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
    const film = f.slice(0, -6);
    for (const c of readComments(outDir, film)) if (ids.includes(c.id)) found.set(c.id, film);
  }
  return found;
}

/** The message the agent gets: what the notes are, how to say what it's doing (`say`, a sentence: the studio shows
 * it beside its link icon), how to say each is done, then the notes, oldest first. */
export function formatBatch(comments, resolveCmd, say = '') {
  const n = comments.length;
  const head = `Motion Director: ${n === 1 ? 'a comment' : `${n} comments`} from the studio. ` +
    (say ? `${say} ` : '') +
    `Make each change, then mark it done so the studio shows it resolved: ${resolveCmd} <id>` +
    (n > 1 ? ' (several ids at once are fine).' : '.');
  return [head, ...comments.map((c) => `\n[${c.id}]\n${c.note}`)].join('\n');
}

/** The Claude Code session the studio was started from, if any: its inbox socket and token. */
export function sessionInbox(env = process.env) {
  return env.CLAUDE_CODE_MESSAGING_SOCKET ? { socket: env.CLAUDE_CODE_MESSAGING_SOCKET, token: env.CLAUDE_CODE_MESSAGING_TOKEN || null } : null;
}

/** Is anything listening at the inbox? Connects and hangs up at once, without sending. */
export function probe(inbox, timeoutMs = 1000) {
  return new Promise((done) => {
    const sock = net.createConnection(inbox.socket);
    const finish = (ok) => { clearTimeout(timer); sock.destroy(); done(ok); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    sock.on('connect', () => finish(true));
    sock.on('error', () => finish(false));
  });
}

/** Posts text into the session's inbox as a user message. Resolves true once it is written, false on any failure. */
export function deliver(inbox, text, timeoutMs = 3000) {
  return new Promise((done) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; clearTimeout(timer); sock.destroy(); done(ok); } };
    const sock = net.createConnection(inbox.socket);
    const timer = setTimeout(() => finish(false), timeoutMs);
    sock.on('error', () => finish(false));
    sock.on('connect', () => {
      const lines = (inbox.token ? JSON.stringify({ type: 'auth', token: inbox.token }) + '\n' : '') +
        JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
      sock.end(lines, () => finish(true));
    });
  });
}
