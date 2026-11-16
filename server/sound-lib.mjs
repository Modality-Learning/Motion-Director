// Promo sound, the file side: the sound library, film cue sheets, and the audio tool steps shared by the studio
// (previews) and the renderer (the mix). The data rules live in kit/sound.mjs.
//
// The library is a folder of your own sound files, never tracked: the project's sounds/ by default (its
// .gitignore keeps the audio out of git), or any folder named by PROMO_SOUNDS. The per-sound defaults are
// tracked, in the project's sounds/library.json, wherever the audio lives.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { AUDIO_EXT, soundPathOk, validateLibrary, validateSheet } from '../kit/sound.mjs';
import { NAME } from '../render/params.mjs';
import { PKG } from './project.mjs';

// MD_SOUNDS comes from the project's config (sounds: '…', see project.mjs); PROMO_SOUNDS is the older name
export const soundsDir = (promoDir) => resolve(process.env.MD_SOUNDS || process.env.PROMO_SOUNDS || join(promoDir, 'sounds'));
const libraryFile = (promoDir) => join(promoDir, 'sounds', 'library.json');
const sheetFile = (promoDir, film) => join(promoDir, 'films', film, 'sound.json');
const cacheDir = (promoDir) => join(promoDir, 'out', '.sound-cache');
/** Formats the browser can't decode; the studio serves a WAV copy of them. */
export const NEEDS_WAV = /\.(aif|aiff|aifc|caf)$/i;

/** The library's absolute path for a relative sound path, only if it stays inside the library. */
export function soundFile(promoDir, rel) {
  if (!soundPathOk(rel)) return null;
  const root = soundsDir(promoDir), full = resolve(root, rel);
  return full.startsWith(root + sep) ? full : null;
}

/** Every audio file in the library (a few folders deep), as library-relative paths. */
export function listSounds(promoDir, { maxDepth = 6, max = 20000 } = {}) {
  const root = soundsDir(promoDir), out = [];
  if (!existsSync(root)) return out;
  const walk = (dir, depth) => {
    for (const d of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max || d.name.startsWith('.')) continue;
      const full = join(dir, d.name);
      if (d.isDirectory() && depth < maxDepth) walk(full, depth + 1);
      else if (d.isFile() && AUDIO_EXT.test(d.name)) {
        const rel = relative(root, full).split(sep).join('/');
        if (soundPathOk(rel)) out.push({ path: rel, bytes: statSync(full).size });
      }
    }
  };
  walk(root, 0);
  return out;
}
/** A safe file name for a sound added to the library (dropped from Finder): its own name with anything
 * unusual replaced, an audio extension, never hidden. Returns null when it isn't a sound file. */
export function importName(name) {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop().normalize('NFC').replace(/[^\p{L}\p{N} ._()+-]/gu, '-').replace(/^[.\s-]+/, '').trim().slice(-120);
  return base && AUDIO_EXT.test(base) && soundPathOk(base) ? base : null;
}
/** Where an imported sound goes: the library's top level, numbered rather than replacing a file. */
export function importTarget(promoDir, name) {
  const clean = importName(name);
  if (!clean) return null;
  const root = soundsDir(promoDir), dot = clean.lastIndexOf('.');
  for (let i = 1; i < 1000; i++) {
    const rel = i === 1 ? clean : `${clean.slice(0, dot)} ${i}${clean.slice(dot)}`;
    if (!existsSync(join(root, rel))) return { rel, file: join(root, rel) };
  }
  return null;
}

/** Where the library is, for people: relative to home when it can be. */
export function libraryLabel(promoDir) {
  const root = soundsDir(promoDir), home = homedir();
  return root.startsWith(home + sep) ? `~/${relative(home, root)}` : root;
}

const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
export const readLibrary = (promoDir) => validateLibrary(readJson(libraryFile(promoDir), { sounds: {} })).library || { sounds: {} };
/** Sets (or, with null, clears) one sound's defaults. Returns { library } or { error }. */
export function saveLibraryEntry(promoDir, path, settings) {
  if (!soundPathOk(path)) return { error: 'Not a sound path' };
  const lib = readLibrary(promoDir);
  if (settings == null) delete lib.sounds[path]; else lib.sounds[path] = settings;
  const v = validateLibrary(lib);
  if (v.error) return v;
  mkdirSync(join(promoDir, 'sounds'), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(v.library.sounds).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(libraryFile(promoDir), JSON.stringify({ sounds: sorted }, null, 2) + '\n');
  return { library: { sounds: sorted } };
}

/** Which version of a film's cue sheet is on disk (0 when it has none): a save must start from it, so two
 * studio windows can't silently overwrite each other's work. */
export function sheetVersion(promoDir, film) {
  if (!NAME.test(film)) return 0;
  try { const s = statSync(sheetFile(promoDir, film)); return Math.round(s.mtimeMs) * 1000 + (s.size % 1000); } catch { return 0; }
}
export function readSheet(promoDir, film) {
  if (!NAME.test(film)) return null;
  return validateSheet(readJson(sheetFile(promoDir, film), { master: 0, cues: [] })).sheet || { master: 0, cues: [] };
}
export function saveSheet(promoDir, film, sheet) {
  if (!NAME.test(film) || !existsSync(join(promoDir, 'films', film))) return { error: 'Unknown film' };
  const v = validateSheet(sheet);
  if (v.error) return v;
  writeFileSync(sheetFile(promoDir, film), JSON.stringify(v.sheet, null, 2) + '\n');
  return v;
}

/* ── the audio tool (render/audio.swift, AVFoundation): mixing, stretching, adding sound to video ── */
const toolSource = () => join(PKG, 'render', 'audio.swift'); // the package's source, built into the project's out/.bin
export const toolPath = (promoDir) => join(promoDir, 'out', '.bin', 'audio');
let building = null;
/** The built audio tool, compiled once (and again when its source changes) with the Command Line Tools. */
export function audioTool(promoDir) {
  const bin = toolPath(promoDir), src = toolSource();
  if (existsSync(bin) && statSync(bin).mtimeMs >= statSync(src).mtimeMs) return Promise.resolve(bin);
  building ||= (async () => {
    mkdirSync(dirname(bin), { recursive: true });
    const r = await run('swiftc', ['-O', src, '-o', bin], { DEVELOPER_DIR: '/Library/Developer/CommandLineTools' });
    building = null;
    return r.code === 0 ? bin : null;
  })();
  return building;
}

export function run(cmd, args, env = {}) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } }); let out = '', err = '';
    p.stdout.on('data', (d) => { out = (out + d).slice(-1_000_000); });
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    p.on('close', (code) => ok({ code, out, err }));
    p.on('error', (e) => ok({ code: -1, out, err: String(e) }));
  });
}
const cached = (promoDir, key, ext = '.wav') => { mkdirSync(cacheDir(promoDir), { recursive: true }); return join(cacheDir(promoDir), createHash('sha1').update(key).digest('hex').slice(0, 20) + ext); };
const stamp = (file) => { const s = statSync(file); return `${file}|${s.size}|${s.mtimeMs}`; };

/** A WAV copy of a sound the browser can't decode (AIFF, CAF), made with the system's afconvert. */
export async function browserCopy(promoDir, file) {
  const out = cached(promoDir, `wav|${stamp(file)}`);
  if (existsSync(out)) return out;
  const r = await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', file, out]);
  return r.code === 0 ? out : null;
}

/** Every library sound measured by the audio tool (render/audio.swift analyze), keyed by its library path.
 * Results are kept in out/.sound-cache/analysis.json until a file changes, so only new sounds are measured. */
let analysing = null, again = false;
export function analyseLibrary(promoDir) {
  // One pass at a time: a big library copied in sends many changes, and each asks for the analysis. A call
  // while a pass runs waits for it and then one more pass (for files that arrived meanwhile), never a second
  // pass over the same files at once.
  if (analysing) { again = true; return analysing.then(() => analysing || analyseLibrary(promoDir)); }
  analysing = analysePass(promoDir).finally(() => {
    analysing = null;
    if (again) { again = false; analyseLibrary(promoDir); }
  });
  return analysing;
}
async function analysePass(promoDir) {
  const store = join(cacheDir(promoDir), 'analysis.json');
  let cache = {}; try { cache = JSON.parse(readFileSync(store, 'utf8')); } catch { /* first run */ }
  const files = listSounds(promoDir), out = {}, todo = [];
  for (const f of files) {
    const file = soundFile(promoDir, f.path), key = stamp(file);
    if (cache[f.path]?.key === key) out[f.path] = cache[f.path].m; else todo.push({ path: f.path, file, key });
  }
  if (todo.length) {
    const tool = await audioTool(promoDir);
    for (let i = 0; tool && i < todo.length; i += 16) { // a few at a time, so one long command line never grows too far
      const batch = todo.slice(i, i + 16), r = await run(tool, ['analyze', ...batch.map((t) => t.file)]);
      const lines = r.out.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
      batch.forEach((t) => { const m = lines.find((l) => l?.file === t.file); if (m) { delete m.file; out[t.path] = m; cache[t.path] = { key: t.key, m }; } });
    }
    for (const p of Object.keys(cache)) if (!files.some((f) => f.path === p)) delete cache[p];
    mkdirSync(cacheDir(promoDir), { recursive: true });
    writeFileSync(store, JSON.stringify(cache));
  }
  return out;
}

/** For previews: the trimmed sound at a new speed with its pitch kept, made exactly as the render makes it. */
export async function stretched(promoDir, rel, { from = 0, to = null, rate }) {
  const file = soundFile(promoDir, rel);
  if (!file || !existsSync(file)) return { error: 'Sound not found' };
  const tool = await audioTool(promoDir);
  if (!tool) return { error: 'The audio tool could not be built' };
  const out = cached(promoDir, `stretch|${stamp(file)}|${from}|${to}|${rate}|${statSync(tool).mtimeMs}`);
  if (existsSync(out)) return { file: out };
  const r = await run(tool, ['stretch', file, out, String(from), to == null ? '-' : String(to), String(rate)]);
  return r.code === 0 ? { file: out } : { error: 'Could not stretch the sound', detail: r.err.slice(-500) };
}

/** The audio tool's mix plan for voices (kit/sound.mjs resolveVoices): each voice with its file's path.
 * `files` maps a library path to an absolute file. Kept free of I/O so it can be tested. */
export function mixPlan(voices, files, duration) {
  return {
    duration,
    voices: voices.filter((v) => files[v.sound]).map((v) => ({ file: files[v.sound], at: v.at, from: v.from, to: v.to, gain: v.gain, rate: v.rate, keepPitch: v.keepPitch, fadeIn: v.fadeIn, fadeOut: v.fadeOut })),
  };
}
