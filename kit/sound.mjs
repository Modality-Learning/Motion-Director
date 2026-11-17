/* Promo sound: the data model shared by the studio page (browser) and the renderer (node). No I/O here.
 *
 * Sounds are files you supply in the sound library (promo/sounds/, or PROMO_SOUNDS); they are never tracked.
 * Each sound can have defaults in promo/sounds/library.json (tracked):
 *   { "sounds": { "whooshes/air-02.wav": { "gain": -6, "from": 0.05, "rate": 1.2 } } }
 * A film's cues live in promo/films/<film>/sound.json:
 *   { "master": 0, "cues": [{ "id": "c1", "sound": "whooshes/air-02.wav", "at": 27.35, "track": 0, "gain": -3 }] }
 * A cue plays at a time on the film (at), on a track (rows of the timeline, for overlapping sounds).
 * A cue can instead follow a moment the film declares (Motion.moment), { "moment": "fold-1", "offset": -0.05 },
 * so it moves when the animation is retimed; a moment with several times plays the cue at each. The studio
 * places cues freely; moments are kept for syncing to the animation later.
 * Objects: a cue can belong to an element of the film (an "object"), named in sheet.objects:
 *   "objects": { "o1": { "label": "Study timer", "selector": "#timer" } }
 *   cue: { "at": 11.3, "object": "o1", "anchor": { "kind": "stop", "n": 0, "t": 11.76 } }
 * Music: a cue with "music": true is the soundtrack. It plays like any cue; the studio keeps it on its own lane
 * (tracks numbered within that lane), and films/<film>/music.json holds the brief it was made from (kit/music.mjs).
 * The anchor is the object's event the cue sits nearest (its nth arrival, fastest moment, stop or exit, as the
 * studio measured it). When the studio measures the object again and that event has moved, the cue moves by
 * the same amount. The cue's own time (at) is what plays and renders.
 * Any setting left off a cue comes from the sound's defaults, then from DEFAULTS.
 */

import { cleanMeta } from './sound-library.mjs';

/** Settings a sound has by default and a cue can override. */
export const SETTINGS = {
  gain: { label: 'Volume', unit: 'dB', min: -60, max: 24, def: 0 },
  from: { label: 'Trim start', unit: 's', min: 0, max: 3600, def: 0 },
  to: { label: 'Trim end', unit: 's', min: 0, max: 3600, def: null }, // null: the end of the file
  rate: { label: 'Speed', unit: '×', min: 0.25, max: 4, def: 1 },
  keepPitch: { label: 'Keep pitch', bool: true, def: true }, // true: time-stretch; false: tape-style, pitch moves with speed
  fadeIn: { label: 'Fade in', unit: 's', min: 0, max: 30, def: 0 },
  fadeOut: { label: 'Fade out', unit: 's', min: 0, max: 30, def: 0 },
  hit: { label: 'Hit point', unit: 's', min: 0, max: 3600, def: null }, // where in the file the sound lands (its peak), shown on clips
};
export const DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, s.def]));
export const AUDIO_EXT = /\.(wav|aif|aiff|aifc|caf|mp3|m4a|aac|flac)$/i;
export const MOMENT_ID = /^[a-z0-9][a-z0-9.-]{0,59}$/;
const CUE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LIMITS = { cues: 500, sounds: 20000, path: 300 };

/** A library-relative path to an audio file: no "..", no absolute paths, an audio extension. */
export function soundPathOk(p) {
  if (typeof p !== 'string' || !p || p.length > LIMITS.path || /[\0\\]/.test(p) || p.startsWith('/')) return false;
  if (p.split('/').some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) return false;
  return AUDIO_EXT.test(p);
}

const num = (v, s) => typeof v === 'number' && Number.isFinite(v) && v >= s.min && v <= s.max;
/** Checks a set of settings (all optional). Returns { values } or { error }. */
export function cleanSettings(obj = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'Settings must be an object' };
  const values = {};
  for (const [k, s] of Object.entries(SETTINGS)) {
    if (!(k in obj) || obj[k] === undefined) continue;
    const v = obj[k];
    if (s.bool ? typeof v !== 'boolean' : !(num(v, s) || (s.def === null && v === null))) return { error: `${s.label} is out of range` };
    values[k] = v;
  }
  if (values.to != null && values.from != null && values.to <= values.from) return { error: 'Trim end must be after trim start' };
  return { values };
}

/** Checks a film's sound sheet. Returns { sheet } (only known fields kept) or { error }. */
export function validateSheet(sheet) {
  if (!sheet || typeof sheet !== 'object' || !Array.isArray(sheet.cues)) return { error: 'No cues' };
  if (sheet.cues.length > LIMITS.cues) return { error: 'Too many cues' };
  const o = validateObjects(sheet.objects ?? {});
  if (o.error) return o;
  const master = sheet.master ?? 0;
  if (!num(master, { min: -60, max: 12 })) return { error: 'Master volume is out of range' };
  const seen = new Set(), cues = [];
  for (const c of sheet.cues) {
    if (!c || typeof c !== 'object') return { error: 'Bad cue' };
    if (!CUE_ID.test(c.id ?? '') || seen.has(c.id)) return { error: 'Each cue needs its own id' };
    if (!soundPathOk(c.sound)) return { error: `Cue ${c.id}: not a sound in the library` };
    // placed at a time, or following a moment
    const free = c.moment === undefined;
    if (free ? !num(c.at, { min: -30, max: 3600 }) : !MOMENT_ID.test(c.moment ?? '')) return { error: `Cue ${c.id}: needs a time or a moment` };
    const offset = c.offset ?? 0;
    if (!num(offset, { min: -30, max: 30 })) return { error: `Cue ${c.id}: offset is out of range` };
    const track = c.track ?? 0;
    if (!Number.isInteger(track) || track < 0 || track > 15) return { error: `Cue ${c.id}: track is out of range` };
    const s = cleanSettings(Object.fromEntries(Object.keys(SETTINGS).filter((k) => k in c).map((k) => [k, c[k]])));
    if (s.error) return { error: `Cue ${c.id}: ${s.error}` };
    if (c.mute !== undefined && typeof c.mute !== 'boolean') return { error: `Cue ${c.id}: bad mute` };
    if (c.music !== undefined && typeof c.music !== 'boolean') return { error: `Cue ${c.id}: bad music` };
    if (c.music && c.object !== undefined) return { error: `Cue ${c.id}: music doesn't belong to an object` };
    // belonging to an object: one the sheet names, and the event it sits nearest
    if (c.object !== undefined && !o.objects[c.object]) return { error: `Cue ${c.id}: unknown object` };
    const anchor = c.object === undefined || c.anchor === undefined ? null : cleanAnchor(c.anchor);
    if (anchor && anchor.error) return { error: `Cue ${c.id}: ${anchor.error}` };
    seen.add(c.id);
    cues.push({ id: c.id, sound: c.sound, ...(free ? { at: c.at } : { moment: c.moment, offset }), track, ...(c.mute ? { mute: true } : {}), ...(c.music ? { music: true } : {}),
      ...(c.object !== undefined ? { object: c.object } : {}), ...(anchor ? { anchor } : {}), ...s.values });
  }
  // how many of your own tracks the timeline shows (optional; never fewer than the clips need)
  const tracks = sheet.tracks;
  if (tracks !== undefined && (!Number.isInteger(tracks) || tracks < 1 || tracks > 16)) return { error: 'Track count is out of range' };
  // only objects that still have cues are kept
  const used = new Set(cues.map((c) => c.object).filter(Boolean));
  const objects = Object.fromEntries(Object.entries(o.objects).filter(([id]) => used.has(id)));
  return { sheet: { master, ...(tracks !== undefined ? { tracks } : {}), ...(Object.keys(objects).length ? { objects } : {}), cues } };
}

/** A sound's library entry: its default settings, plus the family and tags set by hand (kit/sound-library.mjs). */
export function cleanEntry(obj = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'Settings must be an object' };
  const { family, tags, description, uses, organised, ...settings } = obj;
  const s = cleanSettings(settings);
  if (s.error) return s;
  const m = cleanMeta({ family, tags, description, uses, organised });
  return m.error ? m : { values: { ...s.values, ...m.values } };
}

const OBJECT_ID = /^o[a-z0-9]{1,39}$/;
const EVENT_KINDS = ['in', 'peak', 'stop', 'out'];
const CTRL = /[\u0000-\u001f\u007f]/;
function validateObjects(objects) {
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return { error: 'Bad objects' };
  const out = {};
  for (const [id, ob] of Object.entries(objects)) {
    if (!OBJECT_ID.test(id) || !ob || typeof ob !== 'object') return { error: 'Bad object' };
    const label = str(ob.label, 80), selector = str(ob.selector, 400);
    if (!label || !selector || CTRL.test(label) || CTRL.test(selector)) return { error: `Object ${id}: needs a name and an element` };
    out[id] = { label, selector };
  }
  return { objects: out };
}
function cleanAnchor(a) {
  if (!a || typeof a !== 'object' || !EVENT_KINDS.includes(a.kind) || !Number.isInteger(a.n) || a.n < 0 || a.n > 999 || !num(a.t, { min: -30, max: 3600 })) return { error: 'bad anchor' };
  return { kind: a.kind, n: a.n, t: a.t };
}
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** Checks the library's per-sound defaults. Returns { library } or { error }. */
export function validateLibrary(lib) {
  const sounds = lib?.sounds;
  if (!sounds || typeof sounds !== 'object' || Array.isArray(sounds)) return { error: 'No sounds' };
  if (Object.keys(sounds).length > LIMITS.sounds) return { error: 'Too many sounds' };
  const out = {};
  for (const [p, v] of Object.entries(sounds)) {
    if (!soundPathOk(p)) return { error: `Not a sound path: ${p}` };
    const s = cleanEntry(v);
    if (s.error) return { error: `${p}: ${s.error}` };
    if (Object.keys(s.values).length) out[p] = s.values;
  }
  return { library: { sounds: out } };
}

/** A cue's effective settings: the cue's own, else the sound's defaults, else DEFAULTS. */
export function effective(cue, library) {
  const own = Object.fromEntries(Object.keys(SETTINGS).filter((k) => cue && k in cue).map((k) => [k, cue[k]]));
  return { ...DEFAULTS, ...(library?.sounds?.[cue?.sound] || {}), ...own };
}
/** Which settings the cue sets itself (the rest are inherited). */
export const overrides = (cue) => Object.keys(SETTINGS).filter((k) => cue && k in cue);

/** How long a sound plays on the film's timeline, given its file length in seconds. */
export function playLength(settings, fileLength) {
  const to = settings.to == null ? fileLength : Math.min(settings.to, fileLength);
  return Math.max(0, (to - settings.from) / settings.rate);
}
/** The speed that makes a trimmed sound last exactly `seconds` (for fitting typing to the typing), clamped. */
export function fitRate(settings, fileLength, seconds) {
  const to = settings.to == null ? fileLength : Math.min(settings.to, fileLength);
  if (!(seconds > 0) || !(to > settings.from)) return settings.rate;
  return Math.min(SETTINGS.rate.max, Math.max(SETTINGS.rate.min, Math.round(((to - settings.from) / seconds) * 1000) / 1000));
}

/** When an object is measured again: the event a clip sat by, found again as the event of the same kind
 * nearest where it was (within `reach` seconds), or null to leave the clip where it is. Not by its number
 * among events of that kind: a change in how marks are found, or an element measured while it couldn't be
 * seen, renumbers them, and "the second arrival" would then be somewhere else entirely. */
export function followEvent(anchor, events, reach = 1.5) {
  let best = null;
  for (const e of events || []) if (e.kind === anchor?.kind && (!best || Math.abs(e.t - anchor.t) < Math.abs(best.t - anchor.t))) best = e;
  return best && Math.abs(best.t - anchor.t) <= reach ? best : null;
}

/** Every sound that plays, in film time: one voice per cue per moment time. The film always has a
 * "start" moment at 0 (for music and beds). Cues on moments the film no longer declares are skipped and
 * reported, so a renamed moment never fails silently. */
export function resolveVoices(sheet, library, moments, duration = Infinity) {
  const byId = new Map([['start', { id: 'start', times: [0], dur: 0 }], ...moments.map((m) => [m.id, m])]);
  const voices = [], orphans = [];
  for (const cue of sheet?.cues || []) {
    const m = cue.moment === undefined ? { times: [cue.at] } : byId.get(cue.moment);
    if (!m) { orphans.push(cue.id); continue; }
    if (cue.mute) continue;
    const s = effective(cue, library);
    for (const time of m.times) {
      const at = time + (cue.moment === undefined ? 0 : cue.offset || 0);
      if (at >= duration) continue;
      voices.push({ cue: cue.id, sound: cue.sound, at, from: s.from, to: s.to, gain: s.gain + (sheet.master || 0), rate: s.rate, keepPitch: s.keepPitch, fadeIn: s.fadeIn, fadeOut: s.fadeOut });
    }
  }
  return { voices: voices.sort((a, b) => a.at - b.at), orphans };
}
