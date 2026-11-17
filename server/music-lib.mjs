// Music for a film, on disk: its brief (films/<film>/music.json, kit/music.mjs) and lining a music clip up with
// it. Used by `motion-director music` and the studio's Line up button.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { FPS, beatPhase, biggestLift, fitPlan, onsets, tempoNear, tempoOverall, tempoStrength, validateBrief } from '../kit/music.mjs';
import { readWav } from '../kit/sound-check.mjs';
import { NAME } from '../render/params.mjs';
import { readSheet, run, saveSheet, soundFile } from './sound-lib.mjs';
import { readManifest } from '../render/params.mjs';

export const briefFile = (root, film) => join(root, 'films', film, 'music.json');

/** The film's brief: { brief } , { none: true } when it has none yet, or { error } when it doesn't check out. */
export function readBrief(root, film) {
  if (!NAME.test(film || '')) return { error: 'Not a film name' };
  const file = briefFile(root, film);
  if (!existsSync(file)) return { none: true };
  try { return validateBrief(JSON.parse(readFileSync(file, 'utf8'))); } catch (err) { return { error: `music.json: ${err.message}` }; }
}

const RATE = 11025; // plenty for finding beats, and quick

/** A track's tempo near `bpm`, where its beats fall and its biggest lift, in the file's own seconds. macOS's
 * afconvert decodes it (the file name is an argument, never shell text). */
export async function measureTrack(file, bpm, beatsPerBar = 4) {
  const dir = mkdtempSync(join(tmpdir(), 'md-music-')), wav = join(dir, 'track.wav');
  try {
    const r = await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', file, wav]);
    if (r.code !== 0 || !existsSync(wav)) throw new Error(`Couldn't decode ${basename(file)} (${(r.err || '').trim() || 'afconvert failed'}). Export it as WAV or MP3 (some .m4a files hold audio macOS can't decode); lining up needs macOS`);
    const { samples, sampleRate } = readWav(readFileSync(wav));
    const { onset, energy } = onsets(samples, sampleRate);
    const measured = tempoNear(onset, bpm), phase = beatPhase(onset, measured), overall = tempoOverall(onset);
    return { bpm: measured, phase, lift: biggestLift(energy, measured, phase, beatsPerBar), seconds: Math.round((onset.length / FPS) * 10) / 10,
      strength: Math.round(tempoStrength(onset, measured) * 100) / 100, overall: overall.bpm, overallStrength: Math.round(overall.strength * 100) / 100 };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Lines a music clip up with the brief: measures its track, then (unless dry) saves the clip's new start, trim and
 * speed. Returns { cue, track, plan } or { error }. Without a cue id, the film's first music clip. */
export async function fitMusic(root, film, cueId = null, { dry = false } = {}) {
  const b = readBrief(root, film);
  if (b.error) return b;
  if (b.none) return { error: `${film} has no music brief yet (films/${film}/music.json): write it with the user first` };
  const sheet = readSheet(root, film);
  const cue = sheet.cues.find((c) => (cueId ? c.id === cueId : c.music));
  if (!cue) return { error: cueId ? `No clip ${cueId} in ${film}` : `No music on ${film}'s music lane yet: put the generated track there first` };
  if (cue.moment !== undefined) return { error: `Clip ${cue.id} follows a moment; place it at a time to line it up` };
  const file = soundFile(root, cue.sound);
  if (!file || !existsSync(file)) return { error: `${cue.sound} isn't in the sound library on this machine` };
  const track = await measureTrack(file, b.brief.bpm, b.brief.beatsPerBar);
  // the film's length: the brief's (written from the film page, which is the truth), else film.json's
  const manifest = readManifest(root, 'film', film)?.data?.duration;
  const duration = b.brief.length ?? (typeof manifest === 'number' ? manifest : undefined);
  const plan = fitPlan(b.brief, track, { at: cue.at, from: cue.from ?? 0 }, { duration });
  if (!dry) {
    Object.assign(cue, { at: plan.at, rate: plan.rate, keepPitch: true }, plan.from ? { from: plan.from } : {});
    if (plan.rate === 1) delete cue.rate;
    // the end: cut and faded at the film's end when the track runs past it; else the whole track plays
    if (plan.to != null) Object.assign(cue, { to: plan.to, fadeOut: plan.fadeOut }); else delete cue.to;
    const saved = saveSheet(root, film, sheet);
    if (saved.error) return saved;
  }
  return { cue: cue.id, track, plan };
}
