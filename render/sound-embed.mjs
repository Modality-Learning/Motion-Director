// Finds library sounds by what they sound like: "soft paper rustle", "short airy whoosh", or more like one
// you already have. For choosing among sounds nobody has described yet.
// usage: motion-director sound-search "<words>" ["<more words>" …] [--like <sound path>] [--n 8] [--json]
//
// It runs CLAP (LAION's sound-and-text model, as ONNX through @huggingface/transformers) on this machine.
// The first run downloads the model (about 160 MB) into ~/.cache/motion-director, or the folder named by
// MD_MODELS; after that it works offline. The sounds themselves are never sent anywhere. Each sound's
// embedding is kept in out/.sound-cache (one file per model) until its file changes, so only new sounds are heard.
// The package is an optional dependency and is loaded here alone: the studio, the render and the tests
// never need it. Exit codes: 0 searched, 1 failed.
// MD_CLAP_DTYPE=fp32 uses the full-size weights (a 620 MB download) to compare against the small ones, and
// MD_CLAP_MODEL=large the bigger general model (a 205 MB download). On the same library the bigger model was
// no better (14% against 15% in the top ten, on descriptions written apart from the names), so small stays.
// Measured on a named library of 2,905 effects, with each file's name as the search: a file of that exact
// name was in the top ten 22% of the time, and the top ten shared the name's subject eleven times more
// often than chance. So it finds the right kind of sound, not the right file. Plain words did best;
// "the sound of …" in front did worse, and taking out the library's average embedding made no difference.
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readWav } from '../kit/sound-check.mjs';
import { RATE, alike, mono, pack, parseArgs, pending, rank, silent, unit, unpack } from '../kit/sound-embed.mjs';
import { projectRoot } from '../server/project.mjs';
import { listSounds, readLibrary, run, soundFile } from '../server/sound-lib.mjs';

// The models this can run: only these, so a stray setting can never fetch some other repository's code or weights.
const MODELS = { small: 'Xenova/clap-htsat-unfused', large: 'Xenova/larger_clap_general' };
const MODEL = MODELS[process.env.MD_CLAP_MODEL || 'small'];
const DTYPE = ['q8', 'fp16', 'fp32'].includes(process.env.MD_CLAP_DTYPE) ? process.env.MD_CLAP_DTYPE : 'q8'; // q8: the quantised weights, a quarter the download
if (!MODEL) { console.error(`MD_CLAP_MODEL is one of: ${Object.keys(MODELS).join(', ')}`); process.exit(1); }
const PROMO = projectRoot();

const args = parseArgs(process.argv.slice(2));
if (args.error) { console.error(`${args.error}\nusage: motion-director sound-search "<words>" [--like <sound path>] [--n 8] [--json]`); process.exit(1); }

const files = listSounds(PROMO).map((f) => { const file = soundFile(PROMO, f.path), s = statSync(file); return { path: f.path, file, key: `${s.size}|${s.mtimeMs}` }; });
if (!files.length) { console.error('The sound library is empty: add sounds to the project\'s sounds/ folder first'); process.exit(1); }
if (args.like && !files.some((f) => f.path === args.like)) { console.error(`${args.like} is not in the sound library`); process.exit(1); }

let hf;
try { hf = await import('@huggingface/transformers'); } catch {
  console.error('Sound search needs @huggingface/transformers, an optional dependency that is not installed.\nInstall it beside motion-director: npm install @huggingface/transformers');
  process.exit(1);
}
hf.env.cacheDir = process.env.MD_MODELS || join(homedir(), '.cache', 'motion-director', 'models');
const note = (text) => { if (!args.json) console.error(text); };

// one file per model, so trying another never throws away what the first has heard
const dir = join(PROMO, 'out', '.sound-cache'), store = join(dir, `embeddings.${MODEL.split('/').pop()}.${DTYPE}.json`);
mkdirSync(dir, { recursive: true });
let cache = null; try { cache = JSON.parse(readFileSync(store, 'utf8')); } catch { /* first run */ }
const { keep, todo } = pending(files, cache, `${MODEL}|${DTYPE}`);

/** A sound as the model wants it: one channel, 48 kHz, its first ten seconds. afconvert reads what the
 * library holds; the file names go to it as arguments, never through a shell. */
async function decode(file, i) {
  const wav = join(dir, `embed-${process.pid}-${i}.wav`);
  const r = await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', file, wav]);
  if (r.code !== 0 || !existsSync(wav)) return null;
  try { return mono(readWav(readFileSync(wav))); } catch { return null; } finally { unlinkSync(wav); }
}

const skipped = [];
if (todo.length) {
  note(`Listening to ${todo.length} new sound${todo.length === 1 ? '' : 's'} (the first run also downloads the model)…`);
  const processor = await hf.AutoProcessor.from_pretrained(MODEL);
  const model = await hf.ClapAudioModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
  for (const [i, f] of todo.entries()) {
    const samples = await decode(f.file, i);
    if (!samples || samples.length < RATE / 100 || silent(samples)) { skipped.push(f.path); keep[f.path] = { key: f.key, skip: true }; continue; }
    const { audio_embeds } = await model(await processor(samples));
    keep[f.path] = { key: f.key, v: pack(unit(audio_embeds.data)) };
  }
  writeFileSync(store, JSON.stringify({ model: `${MODEL}|${DTYPE}`, sounds: keep }));
}
const unheard = files.filter((f) => keep[f.path]?.skip).map((f) => f.path);
const sounds = files.filter((f) => keep[f.path]?.v).map((f) => ({ path: f.path, v: unpack(keep[f.path].v) }));
if (!sounds.length) { console.error('No sound in the library could be read'); process.exit(1); }
if (args.like && !sounds.some((s) => s.path === args.like)) { console.error(`${args.like} could not be read, or is silent`); process.exit(1); }

const results = [];
if (args.queries.length) {
  const tokenizer = await hf.AutoTokenizer.from_pretrained(MODEL);
  const text = await hf.ClapTextModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
  const { text_embeds } = await text(tokenizer(args.queries, { padding: true, truncation: true }));
  const width = text_embeds.dims[1];
  args.queries.forEach((q, i) => results.push({ search: q, sounds: rank(unit(text_embeds.data.slice(i * width, (i + 1) * width)), sounds, args.n) }));
}
if (args.like) results.push({ like: args.like, sounds: alike(args.like, sounds, args.n) });

// what the user has said about each sound goes beside it: that still outranks the model's ear
const library = readLibrary(PROMO).sounds;
for (const r of results) for (const s of r.sounds) {
  s.score = Math.round(s.score * 1000) / 1000;
  const e = library[s.path];
  if (e?.uses?.length) s.uses = e.uses;
  if (e?.description) s.description = e.description;
}

if (args.json) console.log(JSON.stringify({ model: MODEL, results, unheard }, null, 2));
else {
  for (const r of results) {
    console.log(`\n${r.search ? `"${r.search}"` : `Like ${r.like}`}`);
    for (const s of r.sounds) console.log(`  ${s.score.toFixed(3)}  ${s.path}${s.uses ? `  [${s.uses.join(', ')}]` : ''}${s.description ? `  ${s.description}` : ''}`);
  }
  if (unheard.length) console.log(`\n${unheard.length} sound${unheard.length === 1 ? '' : 's'} could not be read or ${unheard.length === 1 ? 'is' : 'are'} silent, and ${unheard.length === 1 ? 'is' : 'are'} left out: ${unheard.slice(0, 8).join(', ')}${unheard.length > 8 ? '…' : ''}`);
  console.log('\nScores only order one search; they are not a pass mark. The model hears what a sound is, not its length or hit point.');
}
