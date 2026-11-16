// Promo studio: the decisions the server makes, kept free of I/O so they can be tested.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { NAME, paramsQuery, readManifest } from '../render/params.mjs';

/* Export presets: what each render is for. Anything else is refused. */
export const PRESETS = {
  share: { label: 'Share', detail: 'H.264 MP4: small, plays anywhere. Compressed, so not for editing.', codec: 'h264', ext: 'mp4' },
  master: { label: 'Edit master', detail: 'ProRes 422 HQ MOV: visually lossless, for Premiere. About 0.5 GB per 35 s.', codec: 'prores422hq', ext: 'mov' },
  master4444: { label: 'Edit master, sharpest', detail: 'ProRes 4444 MOV: full colour resolution for the crispest coloured text. About half as large again.', codec: 'prores4444', ext: 'mov' },
};
/* Render scale relative to the 1920 × 1080 (or 1080 × 1920) stage. */
export const SIZES = {
  '1080p': { label: '1080p', dsf: '1' },
  '1440p': { label: '1440p', dsf: '1.3333333333' },
  '4k': { label: '4K', dsf: '2' },
};

/* Folders under films/ or comps/ with a manifest and an index.html; "_" folders are templates. */
function entries(promoDir, kind) {
  const dir = join(promoDir, kind === 'comp' ? 'comps' : 'films');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && NAME.test(d.name) && existsSync(join(dir, d.name, 'index.html')))
    .map((d) => ({ name: d.name, manifest: readManifest(promoDir, kind, d.name)?.data, html: readFileSync(join(dir, d.name, 'index.html'), 'utf8') }))
    .filter((e) => e.manifest)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The films, with their parameters and the URL query that passes the current values to their page. */
export function listFilms(promoDir) {
  return entries(promoDir, 'film').map(({ name, manifest: f, html }) => ({
    name, title: f.title || name, duration: f.duration, poster: f.poster ?? 0,
    orientation: /--stage-w:\s*1080px/.test(html) ? 'vertical' : 'landscape',
    derivedFrom: f.derivedFrom || null, notes: f.notes || null, artifact: f.artifact || null,
    params: f.params || {}, comps: (html.match(/comps\/([a-z0-9-]+)\//g) || []).map((m) => m.split('/')[1]).filter((v, i, a) => a.indexOf(v) === i),
    query: paramsQuery(promoDir, 'film', name),
  }));
}

/** The shared compositions, and which films use them. */
export function listComps(promoDir, films = listFilms(promoDir)) {
  return entries(promoDir, 'comp').map(({ name, manifest: c }) => ({
    name, title: c.title || name, description: c.description || '', duration: c.duration, poster: c.poster ?? 0,
    params: c.params || {}, usedBy: films.filter((f) => f.comps.includes(name)).map((f) => f.name),
    query: paramsQuery(promoDir, 'comp', name),
  }));
}

/** Checks a render request against the known films and options; returns the plan or the reason it was refused. */
export function planRender(req, films) {
  const film = films.find((f) => f.name === req?.film);
  if (!film) return { error: 'Unknown film' };
  const preset = PRESETS[req.preset];
  if (!preset) return { error: 'Unknown preset' };
  const size = SIZES[req.size];
  if (!size) return { error: 'Unknown size' };
  // the film's own parameters decide the look; the file name notes a textured background
  const textured = film.params?.background?.value === 'textured';
  // one file per combination, so a share copy never overwrites an editing master
  const file = `${film.name}_${req.size}${textured ? '_textured' : ''}${req.preset === 'share' ? '' : `_${preset.codec}`}.${preset.ext}`;
  // sound is in the video unless asked to be left out (render.sh mixes it only when the film has cues); the
  // mix is also kept as a WAV beside the video only when asked for, and never for a silent render
  const sound = req.sound !== false, wav = sound && req.wav === true;
  return { film: film.name, file, env: { CODEC: preset.codec, DSF: size.dsf, SOUND: sound ? '1' : '0', WAV: wav ? '1' : '0' } };
}

/** Reads one line of render output into the job's progress. Capture is most of the work, so it is 0–90%. */
export function applyProgressLine(job, line) {
  let m;
  if ((m = line.match(/^capturing (\d+) frames/))) { job.total = +m[1]; job.phase = 'Capturing frames'; }
  else if ((m = line.match(/^captured (\d+)/))) job.captured = (job.captured || 0) + +m[1];
  else if ((m = line.match(/^encoded (\d+) \/ (\d+)/))) { job.phase = 'Encoding'; job.encoded = +m[1]; job.total = job.total || +m[2]; }
  else if (/^ok \d+ frames ->/.test(line)) { job.phase = 'Done'; job.encoded = job.total; }
  else if (/^sound: mixed/.test(line)) job.phase = 'Mixing sound';
  const total = job.total || 0;
  if (total) {
    const cap = Math.min(1, (job.captured || 0) / total), enc = Math.min(1, (job.encoded || 0) / total);
    job.progress = Math.round((cap * 0.9 + enc * 0.1) * 1000) / 10;
  }
  return job;
}

/** Resolves a path the browser sent, only if it is inside `dir` (no "..", no absolute escapes). */
export function insideDir(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  const root = resolve(dir), full = resolve(root, rel.replace(/^\/+/, ''));
  return full === root || full.startsWith(root + sep) ? full : null;
}

/** The rendered files that belong to a film, newest first. */
export function filmOutputs(outDir, filmName) {
  if (!existsSync(outDir)) return [];
  const kinds = { '.mp4': 'Video (H.264)', '.mov': 'Video (ProRes)', '.wav': 'Sound (WAV stem)', '.png': 'Storyboard', '.html': 'Single-file preview' };
  return readdirSync(outDir)
    .filter((f) => kinds[extname(f)] && (f.startsWith(`${filmName}_`) || f.startsWith(`${filmName}.`) || f === `${filmName}-board.png`))
    .map((f) => { const s = statSync(join(outDir, f)); return { file: basename(f), kind: kinds[extname(f)], bytes: s.size, modified: s.mtime.toISOString() }; })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** What a changed file means to an open studio, from its path under promo/ (or the sound library), so the
 * studio can follow edits made outside it (by an agent, an editor or another window) without a reload.
 * Returns { type, … } or null when nothing open depends on it.
 *   sound    a film's cue sheet               { film }
 *   piece    a film's or composition's manifest (parameters, title)   { film } | { comp }
 *   code     a page, script or style a preview runs   { film } | { comp } | { kit: true }
 *   library  the sound library's settings
 *   sounds   a sound file added, changed or removed */
export function changeOf(where, rel) {
  const parts = String(rel).split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p.startsWith('.'))) return null; // hidden files, editors' temp files
  const name = parts.at(-1);
  if (where === 'sounds') return name === 'library.json' && parts.length === 1 ? { type: 'library' } : /\.(wav|aif|aiff|aifc|caf|mp3|m4a|aac|flac)$/i.test(name) ? { type: 'sounds' } : null;
  if (where === 'kit') return /\.test\./.test(name) ? null : { type: 'code', kit: true };
  const [piece] = parts, key = where === 'films' ? 'film' : where === 'comps' ? 'comp' : null;
  if (!key || piece.startsWith('_') || parts.length < 2) return null; // the template, or the folder itself
  if (parts.length === 2 && name === 'sound.json' && key === 'film') return { type: 'sound', film: piece };
  if (parts.length === 2 && name === (key === 'film' ? 'film.json' : 'comp.json')) return { type: 'piece', [key]: piece };
  return /\.(html|js|mjs|css|svg|png|jpg|jpeg|webp|woff2?|json)$/i.test(name) ? { type: 'code', [key]: piece } : null;
}
