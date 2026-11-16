// Checks on a film's sound sheet that don't need ears (see render/sound-check.mjs and the promo-motion
// skill's SOUND.md): how often each sound is heard and at how many pitches, clips that overlap, and the
// quiet stretches and peak of a mix. Kept free of I/O so it can be tested.
import { effective, playLength } from './sound.mjs';

/** Hits closer together than this are one gesture (a week filling with pops, flaps ratcheting shut). */
export const RUN_GAP = 0.6;
/** A sound heard at this many separate moments is flagged: give some of them another sound. */
export const MANY_MOMENTS = 6;
/** This many clips of one sound at one pitch, across separate moments, are flagged: vary the pitch. */
export const SAME_PITCH = 3;

const fileLength = (sound, analysis) => analysis?.[sound]?.length ?? null;
/** Where a clip starts on the film: its time, or its moment's first time plus its offset. */
export function startOf(cue, moments = []) {
  if (cue.moment === undefined) return cue.at;
  const m = cue.moment === 'start' ? { times: [0] } : moments.find((x) => x.id === cue.moment);
  return m ? m.times[0] + (cue.offset || 0) : null;
}
/** Where a clip lands: its hit point (its own, the sound's, else the measured one) if inside the clip, else its start. */
export function hitOf(cue, library, analysis, moments = []) {
  const start = startOf(cue, moments); if (start == null) return null;
  const s = effective(cue, library), hit = s.hit ?? analysis?.[cue.sound]?.hit, to = s.to ?? fileLength(cue.sound, analysis) ?? Infinity;
  return hit != null && hit >= s.from && hit <= to ? start + (hit - s.from) / s.rate : start;
}
/** How long a clip plays on the timeline (half a second when the file's length is unknown). */
export function lengthOf(cue, library, analysis) {
  const len = fileLength(cue.sound, analysis);
  return len == null ? 0.5 : playLength(effective(cue, library), len);
}

/** For each sound: its clips, the separate moments it is heard at (hits RUN_GAP apart or more), its
 * pitches (effective speeds, tape-style or not, rounded), and what to look at. Most-heard first. */
export function usage(sheet, library, analysis, moments = []) {
  const by = new Map();
  for (const c of sheet?.cues || []) {
    if (c.mute) continue;
    const t = hitOf(c, library, analysis, moments); if (t == null) continue;
    if (!by.has(c.sound)) by.set(c.sound, []);
    by.get(c.sound).push({ id: c.id, t, rate: Math.round(effective(c, library).rate * 100) / 100 });
  }
  const out = [];
  for (const [sound, clips] of by) {
    clips.sort((a, b) => a.t - b.t);
    let runs = 0, last = -Infinity;
    const runOf = new Map();
    for (const c of clips) { if (c.t - last >= RUN_GAP) runs++; runOf.set(c.id, runs); last = c.t; }
    const pitches = new Map();
    for (const c of clips) { if (!pitches.has(c.rate)) pitches.set(c.rate, new Set()); pitches.get(c.rate).add(runOf.get(c.id)); }
    const flags = [];
    if (runs >= MANY_MOMENTS) flags.push(`heard at ${runs} separate moments: does each need this sound? Give some another, or vary the pitch where it must repeat`);
    for (const [rate, at] of pitches) {
      const n = clips.filter((c) => c.rate === rate).length;
      if (n >= SAME_PITCH && at.size >= SAME_PITCH) flags.push(`${n} clips at the same pitch (${rate}×) across ${at.size} moments: vary the speed, tape-style (0.9–1.3, keep pitch off)`);
    }
    out.push({ sound, clips: clips.length, moments: runs, pitches: pitches.size, ids: clips.map((c) => c.id), flags });
  }
  return out.sort((a, b) => b.moments - a.moments || b.clips - a.clips);
}

/** Clips that overlap on the same track or the same row of an object's lane. */
export function overlaps(sheet, library, analysis, moments = []) {
  const lanes = new Map();
  for (const c of sheet?.cues || []) {
    const a = startOf(c, moments); if (a == null) continue;
    const key = `${c.object ? `object ${c.object}` : 'track'} ${(c.track ?? 0) + 1}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push({ id: c.id, a, b: a + lengthOf(c, library, analysis) });
  }
  const out = [];
  for (const [lane, l] of lanes) {
    l.sort((x, y) => x.a - y.a);
    for (let i = 1; i < l.length; i++) if (l[i].a < l[i - 1].b - 0.001) out.push({ lane, first: l[i - 1].id, second: l[i].id, by: Math.round((l[i - 1].b - l[i].a) * 1000) / 1000 });
  }
  return out;
}

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
/** A mix's peak level per window (`step` seconds, 0–1) from interleaved samples. */
export function envelope(samples, channels, sampleRate, step = 0.01) {
  const hop = Math.max(1, Math.round(sampleRate * step)), frames = Math.floor(samples.length / channels), env = [];
  for (let f = 0; f < frames; f += hop) {
    let pk = 0;
    for (let i = f * channels, e = Math.min(frames, f + hop) * channels; i < e; i++) { const v = Math.abs(samples[i]); if (v > pk) pk = v; }
    env.push(pk);
  }
  return { env, step: hop / sampleRate }; // the real step: a window is a whole number of samples
}
/** Stretches below `floor` dBFS lasting `min` seconds or more, as [from, to]. */
export function quiet({ env, step }, { floor = -40, min = 0.8 } = {}) {
  const out = []; let from = null;
  env.forEach((v, i) => {
    if (db(v) < floor) { if (from == null) from = i; return; }
    if (from != null && (i - from) * step >= min) out.push([Math.round(from * step * 100) / 100, Math.round(i * step * 100) / 100]);
    from = null;
  });
  if (from != null && (env.length - from) * step >= min) out.push([Math.round(from * step * 100) / 100, Math.round(env.length * step * 100) / 100]);
  return out;
}
/** The loudest moments (dBFS), at least `apart` seconds apart. */
export function loudest({ env, step }, n = 3, apart = 1) {
  const order = env.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), out = [];
  for (const [v, i] of order) {
    const t = i * step;
    if (out.some((o) => Math.abs(o.t - t) < apart)) continue;
    out.push({ t: Math.round(t * 100) / 100, db: Math.round(db(v) * 10) / 10 });
    if (out.length === n) break;
  }
  return out;
}

/** A WAV file's samples as floats (-1–1): 16-, 24- or 32-bit integer PCM, or 32-bit float. */
export function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(o + 8), channels: buf.readUInt16LE(o + 10), sampleRate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') data = { at: o + 8, size: Math.min(size, buf.length - o - 8) };
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV without format or data');
  const width = fmt.bits / 8, n = Math.floor(data.size / width), samples = new Float32Array(n);
  const float = fmt.format === 3; // IEEE float; everything else here is integer PCM
  for (let i = 0; i < n; i++) {
    const o = data.at + i * width;
    samples[i] = float ? buf.readFloatLE(o) : width === 2 ? buf.readInt16LE(o) / 32768 : width === 3 ? buf.readIntLE(o, 3) / 8388608 : buf.readInt32LE(o) / 2147483648;
  }
  return { samples, channels: fmt.channels, sampleRate: fmt.sampleRate };
}
