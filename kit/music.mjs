/* Music: the brief a soundtrack is made from, and lining a generated track up with the film. No I/O here.
 *
 * films/<film>/music.json is the brief, written by the agent with the user (skill/MUSIC.md):
 *   { "bpm": 120, "beatsPerBar": 4, "offset": 0,
 *     "sections": [{ "name": "Intro", "at": 0 }, { "name": "Drop", "at": 8, "drop": true, "note": "the payoff" }],
 *     "ending": "button", "length": 30,
 *     "prompt": { "style": "warm lo-fi house, 120 BPM, …", "structure": "[Intro]\n…" } }
 * bpm and offset set a bar grid on the film (offset: the film time of the first downbeat). The tempo is chosen so
 * the film's key moments land on bar lines (tempoCandidates), which is what lets the music's breaks line up.
 * The studio shows the sections on the music lane and the prompt to copy into a music generator.
 *
 * Lining up (fitPlan): a generated track never keeps time exactly. Its tempo and beats are measured (onsets,
 * tempoNear, beatPhase), then the clip is slowed or sped a little, pitch kept, so its tempo is the brief's, and
 * slid so its beats sit on the film's grid, with its biggest lift on the section marked drop when there is one. */

const ENDINGS = ['button', 'fade', 'ring'];
const isNum = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const text = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v));

/** Checks a brief. Returns { brief } (known fields only) or { error }. */
export function validateBrief(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'The brief must be an object' };
  const bpm = doc.bpm, beatsPerBar = doc.beatsPerBar ?? 4, offset = doc.offset ?? 0;
  if (!isNum(bpm, 40, 240)) return { error: 'bpm must be between 40 and 240' };
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 2 || beatsPerBar > 12) return { error: 'beatsPerBar must be 2 to 12' };
  if (!isNum(offset, -30, 30)) return { error: 'offset must be within 30 s' };
  const sections = doc.sections ?? [];
  if (!Array.isArray(sections) || sections.length > 32) return { error: 'sections must be a list (32 at most)' };
  const clean = [];
  for (const s of sections) {
    if (!s || typeof s.name !== 'string' || !s.name.trim() || !text(s.name, 40)) return { error: 'Each section needs a short name' };
    if (!isNum(s.at, 0, 3600)) return { error: `Section ${s.name}: needs a time (at)` };
    if (!text(s.note, 200)) return { error: `Section ${s.name}: the note is too long` };
    clean.push({ name: s.name.trim(), at: s.at, ...(s.note ? { note: s.note } : {}), ...(s.drop ? { drop: true } : {}) });
  }
  clean.sort((a, b) => a.at - b.at);
  if (doc.ending !== undefined && !ENDINGS.includes(doc.ending)) return { error: `ending is one of ${ENDINGS.join(', ')}` };
  if (doc.length !== undefined && !isNum(doc.length, 1, 3600)) return { error: 'length is in seconds' };
  const p = doc.prompt ?? {};
  if (typeof p !== 'object' || Array.isArray(p) || !text(p.style, 1000) || !text(p.structure, 4000) || !text(p.notes, 2000)) return { error: 'The prompt has a style (up to 1000 characters), a structure and notes' };
  const prompt = Object.fromEntries(['style', 'structure', 'notes'].filter((k) => p[k]).map((k) => [k, p[k]]));
  return { brief: { bpm, beatsPerBar, offset, sections: clean, ...(doc.ending ? { ending: doc.ending } : {}), ...(doc.length ? { length: doc.length } : {}), ...(Object.keys(prompt).length ? { prompt } : {}) } };
}

/** A length as people write it: 95 → "1:35". */
export const clockOf = (seconds) => { const s = Math.round(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The structure lines for a brief's sections: each section's length in bars (to the next section, the last to
 * the music's end), so the bars add up to the length asked for. `what` gives each one's description. */
export function structureLines(brief, length, what = (s) => s.note) {
  const bar = barLen(brief), end = length ?? brief.length;
  return brief.sections.map((s, i) => {
    const next = brief.sections[i + 1]?.at ?? end ?? s.at + bar;
    const bars = Math.max(1, Math.round((next - s.at) / bar));
    return `[${s.name}: ${bars} bar${bars === 1 ? '' : 's'}${what(s) ? `, ${what(s)}` : ''}]`;
  });
}

/** The prompt to paste into a music generator: the style line, sure to say how long the track should be, then the
 * structure, sure to end on [End]. Generators only know what the prompt says; without the length they make a
 * whole song (two to four minutes). */
export function promptText(brief) {
  const length = brief.length, p = brief.prompt ?? {};
  let style = (p.style || '').trim();
  if (length && style && !/\b\d+:\d\d\b/.test(style)) style = `${style.replace(/[,.\s]+$/, '')}, ${clockOf(length)} long, ending at ${clockOf(length)}`;
  let structure = (p.structure || '').trim();
  if (structure && !/\[End\]\s*$/i.test(structure)) structure = `${structure}\n[End]`;
  return [style, structure].filter(Boolean).join('\n\n');
}

/** Seconds per beat and per bar. */
export const beatLen = (bpm) => 60 / bpm;
export const barLen = (brief) => beatLen(brief.bpm) * (brief.beatsPerBar ?? 4);

/** The bar lines from the start of the film to its end. */
export function barTimes(brief, duration) {
  const bar = barLen(brief), out = [];
  for (let t = (brief.offset ?? 0) % bar; t <= duration + 1e-6; t += bar) if (t >= -1e-6) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/** How far t is from the nearest line of a grid with this period through `offset`. */
const offGrid = (t, period, offset) => { const d = (((t - offset) % period) + period) % period; return Math.min(d, period - d); };

/** Tempos that put the film's key moments on bar lines, best first: { bpm, offset, barError, beatError, worst }
 * (errors in seconds; offset: where the first downbeat falls). Each tempo's offset is the one that fits best.
 * A key moment at the very start counts like any other. Local best only, so neighbouring tempos don't crowd in. */
export function tempoCandidates(times, { min = 70, max = 160, beatsPerBar = 4, count = 5 } = {}) {
  const keys = times.filter((t) => Number.isFinite(t) && t >= 0);
  if (!keys.length) return [];
  const rows = [];
  for (let bpm = min; bpm <= max; bpm++) {
    const bar = beatLen(bpm) * beatsPerBar;
    let best = null;
    for (let off = 0; off < bar; off += 0.005) {
      const errs = keys.map((t) => offGrid(t, bar, off));
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      if (!best || mean < best.barError) best = { bpm, offset: Math.round(off * 1000) / 1000, barError: mean, worst: Math.max(...errs) };
    }
    best.beatError = keys.reduce((a, t) => a + offGrid(t, beatLen(bpm), best.offset), 0) / keys.length;
    rows.push(best);
  }
  const local = rows.filter((r, i) => (!rows[i - 1] || r.barError <= rows[i - 1].barError) && (!rows[i + 1] || r.barError <= rows[i + 1].barError));
  return local.sort((a, b) => a.barError - b.barError).slice(0, count).map((r) => ({ ...r, barError: round3(r.barError), beatError: round3(r.beatError), worst: round3(r.worst) }));
}
const round3 = (v) => Math.round(v * 1000) / 1000;

/* ── measuring a track ── */
export const FPS = 100; // the onset envelope's frames per second

/** How much the sound rises at each moment: the energy's increase over the last 10 ms, on a log scale, at FPS. */
export function onsets(samples, sampleRate) {
  // each frame starts at its exact time: a rounded hop (110 samples at 11,025 Hz) would make it 100.23 frames a
  // second, and every tempo read 0.23% slow
  const n = Math.floor((samples.length / sampleRate) * FPS), energy = new Float32Array(n), out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const a = Math.round((f * sampleRate) / FPS), b = Math.round(((f + 1) * sampleRate) / FPS);
    let e = 0; for (let i = a; i < b; i++) e += samples[i] * samples[i];
    energy[f] = Math.log1p((1000 * e) / (b - a));
  }
  for (let f = 1; f < n; f++) out[f] = Math.max(0, energy[f] - energy[f - 1]);
  return { onset: out, energy };
}

/** The track's tempo, near the brief's (generators drift, and a track may run at half or double): the tempo
 * whose beat period best matches the onsets' rhythm, within ±12% of `bpm` or of its half or double, folded back. */
export function tempoNear(onset, bpm) {
  const score = (b) => {
    const lag = (60 / b) * FPS, l0 = Math.floor(lag), w = lag - l0;
    let s = 0;
    for (let f = 0; f + l0 + 1 < onset.length; f++) s += onset[f] * ((1 - w) * onset[f + l0] + w * onset[f + l0 + 1]);
    return s;
  };
  let best = { bpm, s: -1 };
  for (const mult of [1, 0.5, 2]) {
    for (let b = bpm * mult * 0.88; b <= bpm * mult * 1.12; b += 0.1) { const s = score(b); if (s > best.s) best = { bpm: b / mult, s }; }
  }
  // then finely, against the whole track: the tempo whose beats, at their best phase, catch the most onsets. A
  // tenth of a beat per minute is a tenth of a second over a minute, which is heard at the end of a film
  let fine = { bpm: best.bpm, s: -1 };
  for (let b = best.bpm - 1; b <= best.bpm + 1; b += 0.05) { const s = combAtBest(onset, b); if (s > fine.s) fine = { bpm: b, s }; }
  return Math.round(fine.bpm * 100) / 100;
}
/** The onsets a tempo's beats catch from a phase (in frames), summed over the track. A beat at time t shows in
 * frame floor(t × FPS), where its sound starts: the same rounding here, or the true tempo scores half. */
function comb(onset, period, p) {
  let s = 0;
  for (let f = p; f < onset.length; f += period) { const i = Math.floor(f); s += (onset[i] ?? 0) + 0.5 * (onset[i + 1] ?? 0); }
  return s;
}
/** The best phase for a tempo: { p (frames), s }. */
function bestPhase(onset, bpm) {
  const period = (60 / bpm) * FPS;
  let best = { p: 0, s: -1 };
  for (let p = 0; p < period; p += 0.25) { const s = comb(onset, period, p); if (s > best.s) best = { p, s }; }
  return best;
}
const combAtBest = (onset, bpm) => bestPhase(onset, bpm).s;

/** The track's own tempo over the whole range a song might take (60 to 180), with how strongly its beats show:
 * { bpm, strength }. Against tempoNear's answer it tells a track that ignored the requested tempo (a near
 * search would latch on to a related, wrong one, such as 4:3 of a swung groove) from one that kept close to it. */
export function tempoOverall(onset) {
  let best = { bpm: 0, strength: -1 };
  for (let b = 60; b <= 180; b += 0.5) { const s = combAtBest(onset, b); if (s > best.strength) best = { bpm: b, strength: s }; }
  let fine = best;
  for (let b = best.bpm - 0.5; b <= best.bpm + 0.5; b += 0.05) { const s = combAtBest(onset, b); if (s > fine.strength) fine = { bpm: b, strength: s }; }
  return { bpm: Math.round(fine.bpm * 100) / 100, strength: fine.strength };
}
/** How strongly a tempo's beats show in the track (the same measure as tempoOverall's strength). */
export const tempoStrength = (onset, bpm) => combAtBest(onset, bpm);

/** Where the track's beats fall: the time of the first beat (0 to one beat in), for a tempo. */
export function beatPhase(onset, bpm) {
  return Math.round((bestPhase(onset, bpm).p / FPS) * 1000) / 1000;
}

/** The track's lifts, strongest first: beats where the next two bars are louder than the two before, by how much
 * ({ t, lift }, seconds into the file). Two bars either side, so a one-bar dip and its recovery isn't a lift.
 * Each is a local best, at least two bars from a stronger one. */
export function lifts(energy, bpm, phase, beatsPerBar = 4, count = 8) {
  const bar = (60 / bpm) * beatsPerBar * FPS, span = bar * 2;
  const mean = (a, b) => { let s = 0, n = 0; for (let f = Math.max(0, Math.round(a)); f < Math.min(energy.length, Math.round(b)); f++) { s += energy[f]; n++; } return n ? s / n : 0; };
  const rows = [];
  for (let f = phase * FPS + span; f + span <= energy.length; f += bar / beatsPerBar) rows.push({ t: f / FPS, lift: mean(f, f + span) - mean(f - span, f) });
  const out = [];
  for (const r of rows.sort((x, y) => y.lift - x.lift)) {
    if (r.lift <= 0 || out.length >= count) break;
    if (out.some((o) => Math.abs(o.t - r.t) < (span / FPS))) continue;
    out.push({ t: Math.round(r.t * 1000) / 1000, lift: Math.round(r.lift * 1000) / 1000 });
  }
  return out;
}
/** The biggest lift, in seconds into the file, or null. */
export const biggestLift = (energy, bpm, phase, beatsPerBar = 4) => lifts(energy, bpm, phase, beatsPerBar, 1)[0]?.t ?? null;

/** Where to put a music clip and how fast to play it so the track keeps the brief's time:
 * { at, rate, shift, note }. `track`: what was measured, in the file's own seconds ({ bpm, phase, lift });
 * `clip`: the cue now ({ at, from }); `from` comes back trimmed when the line-up would start it before the film.
 * `film`: { duration } of the film. A track longer than the film (generators rarely keep to a length) ends at the
 * film's end with a fade sized to the brief's ending: `to` and `fadeOut` come back set; else `to` comes back null. The rate only corrects a near miss (within 12%); a track in another tempo
 * plays as it is and the note says so. */
export function fitPlan(brief, track, clip, film = {}) {
  const ratio = brief.bpm / track.bpm;
  // a track that runs at another tempo altogether (track.overall, clearly stronger) isn't sped up to the brief's
  const elsewhere = track.overall && Math.abs(track.overall - track.bpm) / track.bpm > 0.03 && track.overallStrength > track.strength * 1.15;
  const rate = !elsewhere && Math.abs(ratio - 1) <= 0.12 ? Math.round(ratio * 10000) / 10000 : 1;
  const from = clip.from ?? 0, filmAt = (x, at) => at + (x - from) / rate;
  const beat = beatLen(brief.bpm), bar = barLen(brief), offset = brief.offset ?? 0;
  const drop = brief.sections.find((s) => s.drop);
  const duration0 = film.duration ?? brief.length;
  // first, the nearest place where the track's beats sit on the film's beat lines
  const first = filmAt(track.phase, clip.at ?? 0), d = (((offset - first) % beat) + beat) % beat;
  const onBeat = (clip.at ?? 0) + (d > beat / 2 ? d - beat : d);
  let at = onBeat, liftUsed = null, dropNote = '';
  // then a lift on the drop: one near where the drop falls with the beats lined up (a generated track that kept to
  // its length usually has its build-ups about where the structure asked), strong enough to count. Music lifts more
  // than once, so the strongest lift anywhere isn't the drop: lining that up can cut half the track away.
  const candidates = track.lifts ?? (track.lift != null ? [{ t: track.lift, lift: 1 }] : []);
  if (drop && candidates.length) {
    const strongest = Math.max(...candidates.map((l) => l.lift)), barInFile = bar * rate;
    const expected = from + (drop.at - onBeat) * rate;
    const near = candidates.filter((l) => Math.abs(l.t - expected) <= 4 * barInFile && l.lift >= 0.5 * strongest).sort((x, y) => y.lift - x.lift)[0];
    // a track far longer than the film (the generator ignored the length): any lift, if the music still runs to the end
    const long = duration0 && track.seconds && track.seconds > duration0 * 1.3;
    const covers = (l) => { const a = drop.at - (l.t - from) / rate, start = a < 0 ? from - a * rate : from; return Math.max(0, a) + (track.seconds - start) / rate >= duration0 - bar; };
    const far = !near && long ? [...candidates].sort((x, y) => y.lift - x.lift).find(covers) : null;
    liftUsed = near ?? far ?? null;
    if (liftUsed) at = drop.at - (liftUsed.t - from) / rate;
    else dropNote = ` There's no clear lift near "${drop.name}", so it's lined up on the beat, with its own build-ups where they are.`;
  }
  // a clip can't start before the film: the start of the track is trimmed off instead
  let trimFrom = from;
  if (at < 0) { trimFrom = from - at * rate; at = 0; }
  at = Math.round(at * 1000) / 1000; trimFrom = Math.round(trimFrom * 1000) / 1000;
  const note = elsewhere
    ? `The track seems to run at ${track.overall} BPM, not near the brief's ${brief.bpm}, so its speed was left alone: its beats will drift from the film's. Generate it again at ${brief.bpm} BPM, or change the brief to suit it.`
    : rate === 1 && Math.abs(ratio - 1) > 0.12
    ? `The track runs at ${track.bpm} BPM, too far from the brief's ${brief.bpm} to correct: its beats will drift from the film's.`
    : rate !== 1 ? `Played at ${rate}× (pitch kept) so its ${track.bpm} BPM matches the brief's ${brief.bpm}.` : `It already keeps the brief's ${brief.bpm} BPM.`;
  // matched: the track keeps the brief's time from here on (its beats won't drift away from the film's)
  const matched = !elsewhere && Math.abs(ratio - 1) <= 0.12;
  // the end: a track that runs past the film stops at its end, faded (a button ending can't be kept when the
  // track's own ending is elsewhere, so it gets a short fade; a ring or a fade a longer one)
  let to = null, fadeOut = null, endNote = '';
  const duration = film.duration ?? brief.length;
  if (duration && track.seconds) {
    const endsAt = at + (track.seconds - trimFrom) / rate;
    if (endsAt > duration + 0.05) {
      to = Math.round((trimFrom + (duration - at) * rate) * 1000) / 1000;
      fadeOut = brief.ending === 'button' ? Math.min(1.5, bar / 2) : brief.ending === 'fade' ? Math.min(6, bar * 2) : Math.min(3, bar);
      fadeOut = Math.round(fadeOut * 100) / 100;
      endNote = ` The track runs to ${clockOf(track.seconds)}: it ends with the film at ${clockOf(duration)}, fading out over ${fadeOut} s.`;
    } else if (endsAt < duration - 0.5) {
      endNote = ` The track ends at ${endsAt.toFixed(1)} s, before the film does (${duration} s).`;
    }
  }
  return { at, from: trimFrom, to, fadeOut, rate, matched, shift: Math.round((at - (clip.at ?? 0)) * 1000) / 1000, note: note + dropNote + endNote, drop: drop && liftUsed ? drop.name : null, bar };
}
