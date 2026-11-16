// Motion Director: the studio's local server, around a project (server/project.mjs). Start it with
// `motion-director studio` (in this repo, `npm run dev` for hot reloading against the example project).
// It serves the studio app, the project's films and kit, and runs the same scripts an agent would:
// storyboard, the project's drift check, render.
//
// Local only: bound to 127.0.0.1. Every action takes a film name from the project's films/ and options from
// fixed lists, runs scripts with argument arrays (never a shell string), and only reveals files in out/.
// Actions must come from the studio page itself (custom header + same origin), so other sites can't post here.
import { createServer } from 'node:http';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { PKG, loadConfig, projectRoot } from './project.mjs';
import { TYPES, serveProject } from './static.mjs';
import { PRESETS, SIZES, applyProgressLine, changeOf, filmOutputs, insideDir, listComps, listFilms, planRender } from './lib.mjs';
import { saveValues } from '../render/params.mjs';
import { formatComment, logComment, validateComment } from './comments.mjs';
import { NEEDS_WAV, analyseLibrary, audioTool, browserCopy, importTarget, sheetVersion, soundsDir, libraryLabel, listSounds, readLibrary, readSheet, saveLibraryEntry, saveSheet, soundFile, stretched } from './sound-lib.mjs';
import { cleanEntry, cleanSettings, soundPathOk } from '../kit/sound.mjs';

const PROMO = projectRoot();
const CONFIG = await loadConfig(PROMO);
const OUT = join(PROMO, 'out');
const PORT = +(process.env.MD_PORT || process.env.PROMO_STUDIO_PORT || 4321);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ORIGINS = [ORIGIN, `http://localhost:${PORT}`]; // the page may be opened by either name
// the studio app: in development Vite serves it with hot reloading (MD_DEV=1, or no build yet); otherwise the build
const APP_DIST = join(PKG, 'dist', 'app');
const DEV = process.env.MD_DEV === '1' || !existsSync(join(APP_DIST, 'index.html'));

/* Live updates: the studio follows files changed outside it (an agent's edits, an editor, another window).
 * Each change is classified (lib.mjs changeOf), gathered for a moment so a burst of writes is one message,
 * and sent to every open studio page over /api/events (server-sent events). */
const listeners = new Set(), waiting = new Map();
function announce(ev) {
  const key = JSON.stringify(ev);
  clearTimeout(waiting.get(key));
  waiting.set(key, setTimeout(() => {
    waiting.delete(key);
    // a cue sheet's version is read once the writes have settled, so a window can tell its own save apart
    const msg = ev.type === 'sound' ? { ...ev, version: sheetVersion(PROMO, ev.film) } : ev;
    for (const res of listeners) res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }, 150));
}
for (const [where, dir] of [['films', join(PROMO, 'films')], ['comps', join(PROMO, 'comps')], ['kit', join(PROMO, 'kit')], ['kit', join(PKG, 'kit')], ['sounds', soundsDir(PROMO)]]) {
  try { watch(dir, { recursive: true }, (_, file) => { const ev = file && changeOf(where, file.toString()); if (ev) announce(ev); }); } catch { /* not there yet */ }
}

const jobs = []; // newest last
let nextId = 1;

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

function readBody(req, limit = 16_384) {
  return new Promise((ok, fail) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { fail(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { fail(new Error('bad json')); } });
  });
}

/** Runs a script and collects its output. */
function run(cmd, args, opts = {}) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd: PROMO, ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => ok({ code, out, err }));
  });
}

function startRender(plan) {
  const job = { id: nextId++, film: plan.film, file: plan.file, options: plan.options, status: 'running', phase: 'Starting', progress: 0, log: [], startedAt: new Date().toISOString() };
  const p = spawn('bash', [join(PKG, 'render/render.sh'), plan.film, join(OUT, plan.file)], {
    cwd: PROMO, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', MD_ROOT: PROMO, MD_DRIFT: CONFIG.checks.drift || '', ...plan.env }, detached: true, // its own process group, so cancel stops the captures too
  });
  job.pid = p.pid;
  const onData = (d) => d.toString().split('\n').filter(Boolean).forEach((line) => {
    job.log.push(line); if (job.log.length > 200) job.log.shift();
    applyProgressLine(job, line);
  });
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('close', (code) => {
    if (job.status === 'cancelled') return;
    job.status = code === 0 ? 'done' : 'failed'; job.finishedAt = new Date().toISOString();
    if (code === 0) { job.progress = 100; job.phase = 'Done'; }
  });
  jobs.push(job);
  return job;
}

async function api(req, res, url) {
  const { pathname } = url;
  if (req.method === 'POST') {
    // only the studio page can act: a custom header forces a CORS preflight we never grant
    const origin = req.headers.origin;
    if (req.headers['x-promo-studio'] !== '1' || (origin && !ORIGINS.includes(origin))) return json(res, 403, { error: 'Not from the studio' });
  }
  if (req.method === 'GET' && pathname === '/api/events') {
    // a stream of changes for this page, kept open; a comment line every 25 s keeps it from timing out
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': listening\n\n');
    listeners.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); listeners.delete(res); });
    return;
  }
  const films = listFilms(PROMO);

  if (req.method === 'GET' && pathname === '/api/films') {
    return json(res, 200, { project: { name: CONFIG.name, drift: !!CONFIG.checks.drift }, films: films.map((f) => ({ ...f, outputs: filmOutputs(OUT, f.name) })), comps: listComps(PROMO, films), presets: PRESETS, sizes: SIZES });
  }
  if (req.method === 'GET' && pathname === '/api/drift') {
    const film = films.find((f) => f.name === url.searchParams.get('film'));
    if (!film) return json(res, 400, { error: 'Unknown film' });
    if (!CONFIG.checks.drift) return json(res, 200, { none: true });
    const r = await run(process.execPath, [CONFIG.checks.drift, film.name, '--json']);
    try { return json(res, 200, JSON.parse(r.out)); } catch { return json(res, 500, { error: 'Drift check failed', detail: r.err.slice(0, 500) }); }
  }
  if (req.method === 'GET' && pathname === '/api/jobs') return json(res, 200, { jobs: jobs.map(({ pid, ...j }) => j) });
  if (req.method === 'GET' && pathname === '/api/sounds') {
    // the sound library: your own files (never tracked) and the defaults set for them
    return json(res, 200, { dir: libraryLabel(PROMO), files: listSounds(PROMO), library: readLibrary(PROMO), audio: !!(await audioTool(PROMO)) });
  }
  if (req.method === 'GET' && pathname === '/api/sounds/analysis') {
    // each sound measured (shape, brightness, busyness), cached until the file changes
    return json(res, 200, { analysis: await analyseLibrary(PROMO) });
  }
  if (req.method === 'GET' && pathname === '/api/sound') {
    const film = films.find((f) => f.name === url.searchParams.get('film'));
    if (!film) return json(res, 400, { error: 'Unknown film' });
    return json(res, 200, { sheet: readSheet(PROMO, film.name), version: sheetVersion(PROMO, film.name) });
  }

  if (req.method === 'POST' && pathname === '/api/sounds/import') {
    // a sound file dropped from Finder, streamed into the library (never over an existing file)
    const target = importTarget(PROMO, url.searchParams.get('name'));
    if (!target) return json(res, 400, { error: 'Not a sound file (WAV, AIFF, MP3, M4A, CAF or FLAC)' });
    mkdirSync(soundsDir(PROMO), { recursive: true });
    const part = `${target.file}.part`, out = createWriteStream(part);
    let size = 0, tooBig = false;
    await new Promise((done) => {
      req.on('data', (c) => { size += c.length; if (size > 500 * 1024 * 1024) { tooBig = true; req.destroy(); out.destroy(); done(); } });
      req.pipe(out); out.on('finish', done); out.on('error', done); req.on('error', done);
    });
    if (tooBig || !size) { rmSync(part, { force: true }); return json(res, 400, { error: tooBig ? 'Too large (500 MB at most)' : 'Empty file' }); }
    renameSync(part, target.file);
    return json(res, 200, { path: target.rel });
  }

  // a film's cue sheet can be longer than the other requests
  const body = req.method === 'POST' ? await readBody(req, pathname === '/api/sound' ? 262_144 : 16_384).catch(() => null) : null;
  if (req.method === 'POST' && body === null) return json(res, 400, { error: 'Bad request' });

  if (req.method === 'POST' && pathname === '/api/params') {
    // saves a film's or composition's parameter values into its manifest, checked against what it declares
    if (body.kind !== 'film' && body.kind !== 'comp') return json(res, 400, { error: 'Unknown kind' });
    const known = body.kind === 'film' ? films : listComps(PROMO, films);
    if (!known.some((x) => x.name === body.name)) return json(res, 400, { error: 'Unknown film or composition' });
    const r = saveValues(PROMO, body.kind, body.name, body.values);
    return r.error ? json(res, 400, r) : json(res, 200, r);
  }
  if (req.method === 'POST' && pathname === '/api/comments') {
    // returns the note for the clipboard, and keeps a quiet log of it
    const v = validateComment(body, films);
    if (v.error) return json(res, 400, v);
    const note = formatComment(v.comment, films.find((f) => f.name === v.comment.film));
    logComment(OUT, v.comment, note);
    return json(res, 200, { note });
  }
  if (req.method === 'POST' && pathname === '/api/sound') {
    if (!films.some((f) => f.name === body.film)) return json(res, 400, { error: 'Unknown film' });
    // refused if the file changed since this window loaded it (another window, or an edit by hand)
    const now = sheetVersion(PROMO, body.film);
    if (body.base !== now) return json(res, 409, { error: 'changed in another window', version: now });
    const r = saveSheet(PROMO, body.film, body.sheet);
    return r.error ? json(res, 400, r) : json(res, 200, { ...r, version: sheetVersion(PROMO, body.film) });
  }
  if (req.method === 'POST' && pathname === '/api/library') {
    // one sound's defaults, used by every cue that doesn't set its own; null clears them
    if (!soundPathOk(body.path)) return json(res, 400, { error: 'Not a sound path' });
    let settings = null;
    if (body.settings != null) { const v = cleanEntry(body.settings); if (v.error) return json(res, 400, v); settings = v.values; }
    const r = saveLibraryEntry(PROMO, body.path, settings);
    return r.error ? json(res, 400, r) : json(res, 200, r);
  }
  if (req.method === 'POST' && pathname === '/api/stretch') {
    // a preview of a speed change that keeps pitch, made the way the render makes it
    const v = cleanSettings({ from: body.from, to: body.to, rate: body.rate });
    if (v.error || typeof body.rate !== 'number') return json(res, 400, { error: v.error || 'No speed' });
    const r = await stretched(PROMO, body.sound, { from: v.values.from ?? 0, to: v.values.to ?? null, rate: v.values.rate });
    if (r.error) return json(res, 400, r);
    return json(res, 200, { url: `/out/${r.file.slice(OUT.length + 1)}` });
  }
  if (req.method === 'POST' && pathname === '/api/render') {
    if (jobs.some((j) => j.status === 'running')) return json(res, 409, { error: 'A render is already running' });
    const plan = planRender(body, films);
    if (plan.error) return json(res, 400, plan);
    plan.options = { preset: body.preset, size: body.size };
    const { pid, ...job } = startRender(plan);
    return json(res, 202, job);
  }
  let m;
  if (req.method === 'POST' && (m = pathname.match(/^\/api\/jobs\/(\d+)\/cancel$/))) {
    const job = jobs.find((j) => j.id === +m[1]);
    if (!job || job.status !== 'running') return json(res, 404, { error: 'No running job' });
    job.status = 'cancelled'; job.phase = 'Cancelled'; job.finishedAt = new Date().toISOString();
    try { process.kill(-job.pid, 'SIGTERM'); } catch { /* already gone */ }
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && (pathname === '/api/reveal' || pathname === '/api/open')) {
    const file = insideDir(OUT, body.file);
    if (!file) return json(res, 400, { error: 'Not a rendered file' });
    try { await stat(file); } catch { return json(res, 404, { error: 'File not found' }); }
    spawn('open', pathname === '/api/reveal' ? ['-R', file] : [file], { detached: true, stdio: 'ignore' }).unref();
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Not found' });
}

/* sounds from the library, by their library path; AIFF and CAF are served as a WAV copy the browser can play */
async function serveSound(res, rel) {
  const file = soundFile(PROMO, rel);
  if (!file) { res.writeHead(400); return res.end('Bad path'); }
  try {
    await stat(file);
    const send = NEEDS_WAV.test(file) ? await browserCopy(PROMO, file) : file;
    if (!send) { res.writeHead(415); return res.end('Cannot convert'); }
    res.writeHead(200, { 'content-type': TYPES[extname(send).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(send));
  } catch { res.writeHead(404); res.end('Not found'); }
}

/* the studio app: the build, or (in development) whatever Vite answers */
let vite = null;
async function serveApp(req, res, pathname) {
  if (vite) return vite.middlewares(req, res, () => { res.writeHead(404); res.end('Not found'); });
  let file = join(APP_DIST, pathname.slice('/studio/'.length) || 'index.html');
  if (!file.startsWith(APP_DIST)) { res.writeHead(400); return res.end('Bad path'); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(APP_DIST, 'index.html'); } // the app's own routes
  try {
    const data = await readFile(file);
    // hashed assets keep; the page itself is always fresh
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (url.pathname === '/' || url.pathname === '/studio') { res.writeHead(302, { location: '/studio/' }); return res.end(); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/studio/') || (vite && /^\/(@|node_modules\/|src\/)/.test(url.pathname))) return await serveApp(req, res, url.pathname);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    if (url.pathname.startsWith('/sounds/')) return await serveSound(res, decodeURIComponent(url.pathname.slice(8)));
    if (!(await serveProject(PROMO, url.pathname, res))) { res.writeHead(404); res.end('Not found'); }
  } catch (e) {
    json(res, 500, { error: 'Server error' });
    console.error(e);
  }
});
if (DEV) {
  // Vite in middleware mode: the app with hot module reloading, on this same server and port
  const { createServer: createVite } = await import('vite');
  vite = await createVite({ configFile: join(PKG, 'vite.config.ts'), server: { middlewareMode: true, ws: { server } }, appType: 'spa' });
}
server.on('error', (e) => {
  // most often a studio is already open on this port: say so, rather than a stack trace
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is in use, probably by a studio that is already running: open ${ORIGIN}/studio/, or start this one on another port with --port <n>.`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Motion Director${CONFIG.name ? ` · ${CONFIG.name}` : ''}: ${ORIGIN}/studio/${DEV ? ' (development, hot reloading)' : ''}`);
  console.log(`project: ${PROMO}`);
  audioTool(PROMO); // built in the background the first time, for sound previews and renders
});
