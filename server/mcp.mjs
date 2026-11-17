// Motion Director for any agent, over MCP: the studio's comments (read them, mark them done) and the project.
// usage: motion-director mcp   (a stdio MCP server; the agent starts it, see the README for Codex and Claude Code)
//
// Claude Code started from the studio gets comments pushed into its session (comment-queue.mjs). Any other agent,
// or a Claude session the studio wasn't started from, reads them here when the user asks it to. The protocol is
// newline-delimited JSON-RPC 2.0 on stdin and stdout, small enough to speak without a library; logs go to stderr.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { CONFIG, PKG, findRoot } from './project.mjs';
import { filmsOf, formatBatch, readComments, setStatus } from './comment-queue.mjs';
import { clearAgentStatus, setAgentStatus } from './agent-status.mjs';
import { installedVersion, skillVersion } from './updates.mjs';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

/** The project: MD_ROOT, else the nearest one above the working folder, else one below it (a repository whose
 * films live in promo/, with the agent started at the top). */
export function locateProject(cwd = process.cwd(), env = process.env) {
  if (env.MD_ROOT) return resolve(env.MD_ROOT);
  const above = findRoot(cwd);
  if (above) return above;
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === CONFIG)) { found.push(dir); return; }
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(join(dir, e.name), depth + 1);
  };
  walk(resolve(cwd), 0);
  return found.sort()[0] || null;
}

/** A client's name as people say it: codex-mcp-client is Codex, claude-code is Claude. */
export const agentName = (client) => (/codex/i.test(client || '') ? 'Codex' : /claude/i.test(client || '') ? 'Claude' : client || 'your agent');

const filmsIn = (root) => {
  const dir = join(root, 'films');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && existsSync(join(dir, e.name, 'index.html'))).map((e) => {
    let meta = {}; try { meta = JSON.parse(readFileSync(join(dir, e.name, 'film.json'), 'utf8')); } catch { /* a film without film.json yet */ }
    return { name: e.name, title: meta.title || e.name, duration: meta.duration ?? null };
  });
};
const commentFilms = (out) => (existsSync(join(out, 'comments')) ? readdirSync(join(out, 'comments')).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)) : []);

const TOOLS = [
  {
    name: 'project',
    description: "Where the Motion Director project is, its films, and how to start the studio. Call it first if you don't know the project's folder.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_comments',
    description: 'The open comments the user made in the Motion Director studio: each names the film, the element (a selector or sound cue), the moment and what to change. Call it when the user says they left comments or asks you to check the studio. Reading them marks them as with you in the studio. After making each change, call resolve_comments with its id.',
    inputSchema: { type: 'object', properties: { film: { type: 'string', description: "Only this film's comments (its folder name). Default: every film." } }, additionalProperties: false },
  },
  {
    name: 'set_status',
    description: "Say what you're doing, in three or four words (\"Softening the bounce\"), so the studio shows it with a spinner while you work. Set it when you start on comments or a change the user is watching, update it as you move on, and call it with done: true when you've finished.",
    inputSchema: { type: 'object', properties: {
      text: { type: 'string', description: 'What you are doing now, in a few words.' },
      film: { type: 'string', description: 'The film it is about (its folder name).' },
      about: { type: 'string', description: 'What you are changing: a selector or sound cue id, as the comment named it.' },
      done: { type: 'boolean', description: 'true when you have finished: the studio stops showing a status.' },
    }, additionalProperties: false },
  },
  {
    name: 'resolve_comments',
    description: "Mark studio comments done once you've made the change, so the studio shows them resolved.",
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'The comment ids, such as c1a2b3c4.' } }, required: ['ids'], additionalProperties: false },
  },
];

/** Runs a tool: { text, isError }. */
export function callTool(root, name, args = {}, state = null) {
  if (!root) return { isError: true, text: `No Motion Director project here (no ${CONFIG} in this folder, above it, or a few folders below). Set one up with \`npx motion-director init\` in the folder that will hold the films, or set MD_ROOT.` };
  const out = join(root, 'out');
  if (name === 'project') {
    const films = filmsIn(root);
    return { text: [
      `Project: ${root}`,
      `Motion Director ${installedVersion()} (skill ${skillVersion() ?? 'unknown'}). \`npx motion-director --version\` says whether a newer release is out.`,
      films.length ? `Films:\n${films.map((f) => `- ${f.name}: ${f.title}${f.duration ? ` (${f.duration} s)` : ''}`).join('\n')}` : 'No films yet: copy films/_template to films/<name> to start one.',
      `Studio: run \`npx motion-director studio\` in ${root} (it prints its address, http://127.0.0.1:4321/studio/ by default).`,
      'Comments the user makes there: read_comments, then resolve_comments once each change is made.',
    ].join('\n\n') };
  }
  if (name === 'read_comments') {
    const films = args.film ? [String(args.film)] : commentFilms(out);
    const open = films.flatMap((film) => readComments(out, film).filter((c) => c.status === 'queued' || c.status === 'sent').map((c) => ({ ...c, film })));
    if (!open.length) return { text: 'No open comments.' };
    for (const film of new Set(open.map((c) => c.film))) {
      const queued = open.filter((c) => c.film === film && c.status === 'queued').map((c) => c.id);
      if (queued.length) setStatus(out, film, queued, 'sent'); // with the agent now
    }
    return { text: formatBatch(open, 'resolve_comments with the ids, or `motion-director comments resolve`') };
  }
  if (name === 'set_status') {
    if (args.done) { clearAgentStatus(out); return { text: 'Status cleared.' }; }
    const s = setAgentStatus(out, { text: args.text, film: args.film, about: args.about, by: state?.agent || null });
    return { text: `Status: ${s.text}` };
  }
  if (name === 'resolve_comments') {
    const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
    if (!ids.length) return { isError: true, text: 'Give the ids of the comments to resolve.' };
    const films = filmsOf(out, ids), missing = ids.filter((id) => !films.has(id)), byFilm = new Map();
    for (const [id, film] of films) byFilm.set(film, [...(byFilm.get(film) || []), id]);
    for (const [film, list] of byFilm) setStatus(out, film, list, 'resolved');
    const done = films.size ? `Resolved ${[...films.keys()].join(', ')}.` : '';
    return { isError: !films.size, text: [done, missing.length ? `No comment ${missing.join(', ')} in this project.` : ''].filter(Boolean).join(' ') };
  }
  return { isError: true, text: `No tool called ${name}` };
}

/** Which agent is reading comments over MCP, for the studio to name it (out/.agent.json). */
function recordAgent(root, client) {
  if (!root) return;
  try {
    mkdirSync(join(root, 'out'), { recursive: true });
    writeFileSync(join(root, 'out', '.agent.json'), JSON.stringify({ name: agentName(client?.name), client: client?.name || null, via: 'mcp', at: new Date().toISOString() }));
  } catch { /* only a label */ }
}

/** Answers one JSON-RPC message; null for a notification. */
export function handle(msg, state) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg?.id != null ? fail(-32600, 'Invalid request') : null;
  if (msg.id == null) return null; // notifications: initialized, cancelled; nothing to say
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      recordAgent(state.root, msg.params?.clientInfo);
      state.agent = agentName(msg.params?.clientInfo?.name);
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'motion-director', version: VERSION },
        instructions: 'Motion Director: films as code, reviewed in a local studio. Use read_comments when the user has left comments in the studio, and resolve_comments once each change is made. The method for making films is the motion-director skill.',
      });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool ${name}`);
      try {
        const r = callTool(state.root, name, args, state);
        return reply({ content: [{ type: 'text', text: r.text }], isError: !!r.isError });
      } catch (err) { return reply({ content: [{ type: 'text', text: `Failed: ${err.message}` }], isError: true }); }
    }
    default: return fail(-32601, `Method not found: ${msg.method}`);
  }
}

/** Serves MCP on stdin and stdout until the agent closes it. */
export function serve() {
  const state = { root: locateProject() };
  console.error(state.root ? `motion-director mcp: project ${state.root}` : 'motion-director mcp: no project found yet');
  const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
  createInterface({ input: process.stdin })
    .on('line', (line) => {
      if (!line.trim()) return;
      let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
      const answer = Array.isArray(msg) ? msg.map((m) => handle(m, state)).filter(Boolean) : handle(msg, state);
      if (answer && (!Array.isArray(answer) || answer.length)) send(answer);
    })
    .on('close', () => process.exit(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
