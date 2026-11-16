// Mixes a film's sound cues (films/<film>/sound.json) into one stereo WAV, as long as the film, with the
// AVFoundation audio tool (render/audio.swift).
// usage: node sound-mix.mjs <film> <moments.json> <out.wav> <duration>
// The moments come from the film page itself (capture.mjs saves them), for cues tied to a moment.
// Exit codes: 0 mixed, 10 nothing to mix (no cues: the video renders silent), 1 failed.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolveVoices } from '../kit/sound.mjs';
import { audioTool, mixPlan, readLibrary, readSheet, run, soundFile } from '../server/sound-lib.mjs';
import { projectRoot } from '../server/project.mjs';

const PROMO = projectRoot();
const [, , film, momentsFile, out, durArg] = process.argv;
const duration = +durArg;
if (!film || !momentsFile || !out || !(duration > 0)) { console.error('usage: node sound-mix.mjs <film> <moments.json> <out.wav> <duration>'); process.exit(1); }

const sheet = readSheet(PROMO, film);
if (!sheet?.cues.length) { console.log('sound: no cues'); process.exit(10); }
const moments = existsSync(momentsFile) ? JSON.parse(readFileSync(momentsFile, 'utf8')) : [];
const { voices, orphans } = resolveVoices(sheet, readLibrary(PROMO), moments, duration);
for (const id of orphans) console.log(`sound: cue ${id} is on a moment the film no longer has; skipped`);

// sounds missing from this machine's library are left out and reported, not fatal
const files = {};
for (const s of new Set(voices.map((v) => v.sound))) {
  const file = soundFile(PROMO, s);
  if (file && existsSync(file)) files[s] = file; else console.log(`sound: ${s} is not in the sound library; its cues are skipped`);
}
const plan = mixPlan(voices, files, duration);
if (!plan.voices.length) { console.log('sound: nothing to mix'); process.exit(10); }

const tool = await audioTool(PROMO);
if (!tool) { console.error('sound: the audio tool could not be built'); process.exit(1); }
const planFile = `${out}.plan.json`;
writeFileSync(planFile, JSON.stringify(plan));
const r = await run(tool, ['mix', planFile, out]);
unlinkSync(planFile);
if (r.code !== 0) { console.error(`sound: mix failed\n${r.err}`); process.exit(1); }
console.log(`sound: ${r.out.trim()} -> ${out}`);
