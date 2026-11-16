// Serves a project's pages the way films expect to find them: /films/<film>/…, /comps/<comp>/…, /kit/… (the
// project's own kit first, then the package's) and /out/…. The studio serves these, and so does a small server
// the render scripts start for themselves, so a film draws the same in the studio, a storyboard and a render.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { insideDir } from './lib.mjs';
import { kitFile } from './project.mjs';

export const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' };
const TOPS = ['films', 'comps', 'kit', 'out'];

/** The file a project path names, or null when it isn't one of the project's served folders. */
export async function projectFile(root, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  const [, top, ...rest] = rel.split('/');
  if (!TOPS.includes(top)) return null;
  // each path stays inside its own folder: /films/../anything is refused, not resolved
  let file = top === 'kit' ? kitFile(root, rest.join('/')) : insideDir(join(root, top), rest.join('/'));
  if (!file) return null;
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { return null; }
  return file;
}

/** Answers a GET for a project path; false when the path isn't one (so the caller can try something else). */
export async function serveProject(root, pathname, res) {
  const file = await projectFile(root, pathname);
  if (!file) return false;
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
  return true;
}

/** A server for one render script's own use, on a free local port. Resolves to { origin, close }. */
export function startProjectServer(root) {
  return new Promise((ok, fail) => {
    const server = createServer(async (req, res) => {
      try {
        if (req.method !== 'GET' || !(await serveProject(root, new URL(req.url, 'http://x').pathname, res))) { res.writeHead(404); res.end('Not found'); }
      } catch { res.writeHead(500); res.end(); }
    });
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

/** The address of a film's or composition's page on a project server, with its query. */
export const pageUrl = (origin, kind, name, query = '') => `${origin}/${kind === 'comp' ? 'comps' : 'films'}/${encodeURIComponent(name)}/index.html${query ? `?${query}` : ''}`;
