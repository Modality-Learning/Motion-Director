// Checks a film's sounds without listening: how often each sound is heard and at how many pitches,
// overlapping clips, and from an offline mix the peak, the loudest moments and the quiet stretches.
// usage: npm run promo:sound-check -- <film> [moments.json] [--hits id,id,…]
// --hits mixes only those clips and reports where each one's sound actually peaks against where it should
// land (its hit point on the film), to confirm a placement.
// The moments file (render/capture.mjs saves one beside the frames) is only needed for clips tied to a
// moment; clips at a time need nothing else. Exit codes: 0 checked (read the flags), 1 failed.
import { readFileSync, existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVoices } from '../kit/sound.mjs';
import { projectRoot } from '../server/project.mjs';
import { envelope, hitOf, lengthOf, loudest, overlaps, quiet, readWav, startOf, usage } from '../kit/sound-check.mjs';
import { analyseLibrary, audioTool, mixPlan, readLibrary, readSheet, run, soundFile } from '../server/sound-lib.mjs';

const PROMO = projectRoot();

const args = process.argv.slice(2), hitsAt = args.indexOf('--hits');
const only = hitsAt >= 0 ? (args[hitsAt + 1] || '').split(',').filter(Boolean) : null;
const [film, momentsFile] = hitsAt < 0 ? args : args.filter((a, i) => i !== hitsAt && i !== hitsAt + 1);
if (!film) { console.error('usage: npm run promo:sound-check -- <film> [moments.json] [--hits id,id,…]'); process.exit(1); }
const manifest = join(PROMO, 'films', film, 'film.json');
if (!existsSync(manifest)) { console.error(`No film "${film}" in promo/films`); process.exit(1); }
const duration = JSON.parse(readFileSync(manifest, 'utf8')).duration;
const sheet = readSheet(PROMO, film);
if (!sheet?.cues?.length) { console.log(`${film}: no sounds yet`); process.exit(0); }
const moments = momentsFile && existsSync(momentsFile) ? JSON.parse(readFileSync(momentsFile, 'utf8')) : [];
const library = readLibrary(PROMO), analysis = await analyseLibrary(PROMO);
const name = (p) => p.split('/').pop().replace(/\.[^.]+$/, '');
let flags = 0;

/** Mixes these cues as the render does and returns the mix's envelope (5 ms windows), or exits on failure. */
async function mixEnvelope(cues, step = 0.005) {
  const { voices } = resolveVoices({ ...sheet, cues }, library, moments, duration);
  const files = {};
  for (const s of new Set(voices.map((v) => v.sound))) { const f = soundFile(PROMO, s); if (f && existsSync(f)) files[s] = f; }
  const tool = await audioTool(PROMO);
  if (!tool) { console.error('\nThe audio tool could not be built, so the mix was not checked'); process.exit(1); }
  const dir = join(PROMO, 'out', '.sound-cache'); mkdirSync(dir, { recursive: true });
  const wav = join(dir, `check-${film}.wav`), planFile = `${wav}.plan.json`;
  writeFileSync(planFile, JSON.stringify(mixPlan(voices, files, duration)));
  const r = await run(tool, ['mix', planFile, wav]); unlinkSync(planFile);
  if (r.code !== 0) { console.error(`\nThe mix failed\n${r.err}`); process.exit(1); }
  const w = readWav(readFileSync(wav)); unlinkSync(wav);
  return envelope(w.samples, w.channels, w.sampleRate, step);
}

if (only) {
  // each clip alone, so a neighbour can't be mistaken for it
  console.log(`${film}: where each clip's sound peaks, against where it should land\n`);
  for (const id of only) {
    const c = sheet.cues.find((x) => x.id === id);
    if (!c) { console.log(`  ${id}: no such clip`); continue; }
    const want = hitOf(c, library, analysis, moments), e = await mixEnvelope([c]);
    const a = Math.max(0, Math.floor((want - 0.15) / e.step)), b = Math.min(e.env.length, Math.ceil((want + 0.15) / e.step));
    let k = a; for (let i = a; i < b; i++) if (e.env[i] > e.env[k]) k = i;
    const off = Math.round((k * e.step - want) * 1000), level = Math.round(20 * Math.log10(Math.max(e.env[k], 1e-9)) * 10) / 10;
    console.log(`  ${id.padEnd(20)} lands ${want.toFixed(3)} s · peaks ${(k * e.step).toFixed(3)} s (${off >= 0 ? '+' : ''}${off} ms) at ${level} dBFS${Math.abs(off) > 15 ? '  ⚑ more than 15 ms off' : ''}`);
  }
  process.exit(0);
}

console.log(`${film}: ${sheet.cues.length} clips, ${Object.keys(sheet.objects || {}).length} objects, ${sheet.tracks ?? '?'} tracks\n`);

console.log('Repetition (clips · separate moments · pitches):');
for (const u of usage(sheet, library, analysis, moments)) {
  console.log(`  ${String(u.clips).padStart(3)} · ${String(u.moments).padStart(2)} · ${String(u.pitches).padStart(2)}  ${name(u.sound)}`);
  for (const f of u.flags) { flags++; console.log(`        ⚑ ${f}`); }
}

const ov = overlaps(sheet, library, analysis, moments);
console.log(`\nOverlapping clips: ${ov.length ? '' : 'none'}`);
for (const o of ov) { flags++; console.log(`  ⚑ ${o.lane}: ${o.first} runs ${o.by} s into ${o.second}`); }

// the mix, as the render makes it
const { voices, orphans } = resolveVoices(sheet, library, moments, duration);
if (orphans.length) console.log(`\n⚑ ${orphans.length} clip(s) on moments not given (pass the moments file): ${orphans.join(', ')}`);
for (const s of new Set(voices.map((v) => v.sound))) { const f = soundFile(PROMO, s); if (!f || !existsSync(f)) { flags++; console.log(`\n⚑ ${s} is not in the sound library`); } }
const env = await mixEnvelope(sheet.cues, 0.01);

// which clips land near a time, to name what is loud
const near = (t) => {
  const hits = sheet.cues.filter((c) => { const h = hitOf(c, library, analysis, moments); return h != null && Math.abs(h - t) < 0.15; }).map((c) => c.id).slice(0, 4);
  // a long sound playing underneath (music, a bed) is often what is loud, though its hit is far away
  const beds = sheet.cues.filter((c) => { const a = startOf(c, moments), len = lengthOf(c, library, analysis); return !c.mute && a != null && len > 3 && a <= t && t <= a + len; }).map((c) => `under ${c.id}: ${name(c.sound)}`);
  return [...hits, ...beds].join(', ');
};
const top = loudest(env, 3);
console.log(`\nPeak ${top[0].db} dBFS. Loudest: ${top.map((l) => `${l.t}s ${l.db} dB${near(l.t) ? ` (${near(l.t)})` : ''}`).join(' · ')}`);
if (top[0].db > -3) { flags++; console.log('  ⚑ under 3 dB of headroom: leave room for music and a voice (effects peak between -6 and -14 dBFS)'); }
const q = quiet(env);
console.log(`Quiet stretches (under -40 dBFS for 0.8 s or more): ${q.length ? q.map(([a, b]) => `${a}–${b}s`).join(', ') : 'none'}`);
console.log(`\n${flags ? `${flags} thing${flags === 1 ? '' : 's'} to look at` : 'Nothing flagged'}. This checks counts, overlaps and levels; listening is still the user's.`);
