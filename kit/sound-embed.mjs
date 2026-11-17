/* Sound search by meaning: the sums behind `motion-director sound-search`. No I/O and no model here; the
 * script (render/sound-embed.mjs) decodes the files and runs CLAP, a model that puts a sound and a sentence
 * about it close together. This file turns those embeddings into a ranked list, and keeps them small on disk.
 *
 * It is an aid for sounds nobody has described yet. What the user says a sound is for (library.json uses and
 * description) still comes first: the model hears what a sound is, not its length, attack or hit point.
 */

/** The model's sample rate, and how much of a sound it hears: longer files are cut to their first seconds. */
export const RATE = 48000;
export const MAX_SECONDS = 10;

/** One channel at the model's rate from a decoded WAV ({ samples, channels, sampleRate }), cut to MAX_SECONDS.
 * The decoder resamples (afconvert), so any other rate here is a mistake, not something to paper over. */
export function mono(wav, maxSeconds = MAX_SECONDS) {
  if (wav.sampleRate !== RATE) throw new Error(`Expected ${RATE} Hz audio, got ${wav.sampleRate}`);
  const ch = wav.channels || 1, n = Math.min(Math.floor(wav.samples.length / ch), Math.round(maxSeconds * RATE));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += wav.samples[i * ch + c]; out[i] = s / ch; }
  return out;
}

/** True when there is nothing to hear: the model would still give an embedding, and it would mean nothing. */
export function silent(samples, floor = 1e-4) {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > floor) return false;
  return true;
}

/** An embedding scaled to length 1, so comparing two is one dot product. */
export function unit(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const k = Math.sqrt(s) || 1, out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / k;
  return out;
}
export function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

/** Embeddings as text for the cache (base64 of the floats): a fifth the size of a JSON list of numbers. */
export const pack = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
export function unpack(text) {
  const b = Buffer.from(text, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** The sounds closest to `query`, best first. `sounds` is [{ path, v }], every vector of length 1.
 * A score is only good for ordering one search: CLAP's scores sit in a narrow band, so there is no pass mark. */
export function rank(query, sounds, n = 8) {
  return sounds.map((s) => ({ path: s.path, score: dot(query, s.v) })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, n);
}

/** The sounds that sound most like `path`, itself left out. */
export function alike(path, sounds, n = 8) {
  const me = sounds.find((s) => s.path === path);
  return me ? rank(me.v, sounds.filter((s) => s.path !== path), n) : [];
}

/** Which files still need an embedding. `files` is [{ path, key }] (key: the file's size and date); a cache
 * made by another model is no use, and entries for files that have gone are dropped. Returns { keep, todo }. */
export function pending(files, cache, model) {
  const old = cache?.model === model ? cache.sounds || {} : {}, keep = {}, todo = [];
  for (const f of files) { if (old[f.path]?.key === f.key) keep[f.path] = old[f.path]; else todo.push(f); }
  return { keep, todo };
}

/** The command's arguments: what to search for, in words (several searches at once are fine) or by example.
 * Returns { queries, like, n, json } or { error }. */
export function parseArgs(argv) {
  const queries = []; let like = null, n = 8, json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--n') { n = Number(argv[++i]); if (!Number.isInteger(n) || n < 1 || n > 50) return { error: '--n is a whole number from 1 to 50' }; }
    else if (a === '--like') { like = argv[++i]; if (!like) return { error: '--like needs a sound path from the library' }; }
    else if (a.startsWith('--')) return { error: `Unknown option ${a}` };
    else { const q = a.replace(/\s+/g, ' ').trim(); if (q.length > 200) return { error: 'A search is up to 200 characters' }; if (q) queries.push(q); }
  }
  if (!queries.length && !like) return { error: 'Say what to search for' };
  if (queries.length > 20) return { error: 'Up to 20 searches at once' };
  return { queries, like, n, json };
}
