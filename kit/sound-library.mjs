/* Promo sound library: sorting sounds so the right one is quick to find. No I/O; used by the studio.
 *
 * Each sound is measured by the audio tool (render/audio.swift analyze): length, attack (time to its loudest
 * point), decay, sustain (share of it that is loud), onsets (separate hits) and brightness (zero crossings a
 * second, roughly its main frequency). From that and its name:
 *   family   one shelf to find it on: the name first ("whoosh", "click"…), else what it sounds like;
 *            a family set by hand (library.json "family") always wins
 *   traits   filters across families: short, sharp, swell, bright, heavy, busy, long
 *   similar  the sounds that measure most alike, for "More like this"
 *   uses     what a sound is good for in a film (UI click, notification, transition…, or the user's own
 *            words): set by hand in the sound's editor, with suggestions from its name (else its family)
 * A sound can also carry a short description of what it is, in your words. Uses and descriptions are what
 * an agent reads first when choosing sounds, so they make its guesses better.
 * Everything is worked out locally from the files; nothing is sent anywhere.
 */

export const FAMILIES = [
  { id: 'whooshes', label: 'Whooshes & sweeps', words: ['whoosh', 'woosh', 'swoosh', 'swish', 'swoop', 'sweep', 'swipe', 'riser', 'rise', 'transition', 'air', 'wind'] },
  { id: 'impacts', label: 'Impacts', words: ['impact', 'hit', 'thud', 'thump', 'boom', 'slam', 'punch', 'drop', 'land', 'stomp', 'knock', 'bang'] },
  { id: 'clicks', label: 'Clicks & pops', words: ['click', 'pop', 'tap', 'tick', 'button', 'latch', 'snap', 'blip', 'toggle'] },
  { id: 'typing', label: 'Typing', words: ['typing', 'keyboard', 'keystroke', 'typewriter', 'keys'] },
  { id: 'paper', label: 'Paper & pages', words: ['paper', 'page', 'pages', 'paging', 'book', 'slice', 'card', 'envelope', 'notebook'] },
  { id: 'doors', label: 'Doors & slides', words: ['door', 'drawer', 'cabinet', 'slide', 'sliding', 'gate', 'hinge', 'zip'] },
  { id: 'alerts', label: 'Bells & alerts', words: ['bell', 'bells', 'chime', 'ding', 'alert', 'notification', 'ping', 'success', 'ring'] },
  { id: 'music', label: 'Music', words: ['music', 'groove', 'jazz', 'beat', 'track', 'song', 'piano', 'melody', 'theme', 'loop', 'bed'] },
  { id: 'ambience', label: 'Ambience & textures', words: ['ambience', 'ambient', 'room', 'crowd', 'rain', 'texture', 'drone', 'office', 'cafe'] },
  { id: 'other', label: 'Other', words: [] },
];
const BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
export const familyLabel = (id) => BY_ID[id]?.label || BY_ID.other.label;

export const TRAITS = {
  short: { label: 'Short', hint: 'under 0.6 s' },
  sharp: { label: 'Sharp', hint: 'loudest at once: clicks, hits' },
  swell: { label: 'Swell', hint: 'builds up: whooshes, risers' },
  bright: { label: 'Bright', hint: 'airy, high: paper, clicks, bells' },
  heavy: { label: 'Heavy', hint: 'low, dark: thumps, doors, bass' },
  busy: { label: 'Busy', hint: 'many hits: typing, rustling' },
  long: { label: 'Long', hint: 'over 5 s: loops, beds, music' },
};

/* What a sound is good for in a film: the scenarios a user marks it with (library.json "uses"). The words
 * suggest a use from a file name. */
export const USES = [
  { id: 'ui-click', label: 'UI click', words: ['click', 'tap', 'button', 'toggle', 'latch', 'mouse', 'switch'] },
  { id: 'typing', label: 'Typing', words: ['typing', 'keyboard', 'keystroke', 'typewriter', 'keys', 'key'] },
  { id: 'notification', label: 'Notification', words: ['notification', 'message', 'alert', 'ping', 'chat', 'incoming'] },
  { id: 'success', label: 'Success', words: ['success', 'done', 'complete', 'correct', 'win', 'achievement', 'uplifting', 'happy', 'chime'] },
  { id: 'appear', label: 'Something appears', words: ['pop', 'bubble', 'appear', 'spawn', 'blip'] },
  { id: 'transition', label: 'Transition', words: ['whoosh', 'woosh', 'swoosh', 'swish', 'sweep', 'swipe', 'transition', 'riser', 'swoop'] },
  { id: 'impact', label: 'Impact or landing', words: ['impact', 'hit', 'thud', 'thump', 'slam', 'drop', 'land', 'knock', 'boom', 'punch', 'stomp'] },
  { id: 'paper', label: 'Paper or documents', words: ['paper', 'page', 'pages', 'paging', 'book', 'card', 'envelope', 'notebook', 'slice'] },
  { id: 'slide', label: 'Slide or drawer', words: ['slide', 'sliding', 'drawer', 'door', 'cabinet', 'gate', 'hinge'] },
  { id: 'reveal', label: 'Logo or reveal', words: ['logo', 'reveal', 'sting', 'intro', 'outro', 'brand'] },
  { id: 'music', label: 'Music bed', words: ['music', 'groove', 'jazz', 'beat', 'song', 'piano', 'melody', 'loop'] },
  { id: 'ambience', label: 'Background texture', words: ['ambience', 'ambient', 'room', 'crowd', 'rain', 'texture', 'drone', 'office', 'cafe', 'rustle', 'wrinkling'] },
];
const USE_IDS = new Set(USES.map((u) => u.id));
// a use is one of USES by its id, or the user's own: a short phrase like a tag ("logo sting")
export const useLabel = (id) => USES.find((u) => u.id === id)?.label || id;
const OWN_USE = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u;
/** A typed use as stored: a built-in one when it names one (by id or label), else the user's own words. */
export function useId(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return USES.find((u) => u.id === t || u.label.toLowerCase() === t)?.id || t;
}
// a family says what a sound is likely good for when its name says nothing
const FAMILY_USE = { whooshes: 'transition', impacts: 'impact', clicks: 'ui-click', typing: 'typing', paper: 'paper', doors: 'slide', alerts: 'notification', music: 'music', ambience: 'ambience' };

// the words in a file name, each also without a plural s ("papers" finds paper)
const words = (path) => path.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/).filter(Boolean).flatMap((w) => (w.length > 3 && w.endsWith('s') ? [w, w.slice(0, -1)] : [w]));

/** The family a sound's name suggests, if any: the first family whose word it uses. */
export function familyFromName(path) {
  const w = new Set(words(path));
  return FAMILIES.find((f) => f.words.some((x) => w.has(x)))?.id || null;
}
/** The family its measurements suggest. */
export function familyFromSound(m) {
  if (!m?.ok || m.silent) return 'other';
  if (m.length > 10 && m.brightness < 1500) return 'music';
  if (m.length > 3) return 'ambience';
  if (m.attack < 0.05 && m.length < 1.5) return m.brightness < 700 ? 'impacts' : 'clicks';
  if (m.attack >= 0.15) return 'whooshes';
  return 'other';
}
/** Where a sound belongs: set by hand, else its name, else its measurements. */
export const familyOf = (path, m, entry) => (entry?.family && BY_ID[entry.family] ? entry.family : familyFromName(path) || familyFromSound(m));

/** The uses a sound's name suggests (up to three), else the one its family suggests. Offered in its editor
 * for the user to accept; never applied on their own. */
export function suggestUses(path, family = null) {
  const w = new Set(words(path));
  const named = USES.filter((u) => u.words.some((x) => w.has(x))).map((u) => u.id).slice(0, 3);
  return named.length ? named : FAMILY_USE[family] ? [FAMILY_USE[family]] : [];
}

/** The traits a sound has, from its measurements. */
export function traitsOf(m) {
  if (!m?.ok || m.silent) return [];
  const t = [];
  if (m.length < 0.6) t.push('short');
  if (m.attack < 0.05) t.push('sharp');
  if (m.attack >= 0.15 && m.length < 5) t.push('swell');
  if (m.brightness >= 3000) t.push('bright');
  if (m.brightness < 700) t.push('heavy');
  if (m.active > 1.5 && m.onsetRate >= 4) t.push('busy');
  if (m.length > 5) t.push('long');
  return t;
}

/** A sound as numbers for comparing: shape, length, brightness, busyness, loudness (logs where sizes vary a lot). */
const vector = (m) => [Math.log(m.length + 0.05), Math.log(m.attack + 0.01), Math.log(m.decay + 0.01), m.sustain, Math.log(m.brightness + 50),
  m.active > 1.5 ? Math.min(m.onsetRate, 12) / 12 : 0, (m.rmsDb ?? -30) / 20];

/** The sounds that measure most like `path`, closest first: each measure scaled by how much it varies across
 * the library, a small nudge for the same family. `sounds` is [{ path, m, family }]. */
export function similar(path, sounds, n = 6) {
  const usable = sounds.filter((s) => s.m?.ok && !s.m.silent);
  const me = usable.find((s) => s.path === path);
  if (!me) return [];
  const vs = usable.map((s) => vector(s.m)), dims = vs[0].length;
  const sd = Array.from({ length: dims }, (_, i) => { const xs = vs.map((v) => v[i]), mean = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1; });
  const mine = vector(me.m);
  return usable.filter((s) => s.path !== path)
    .map((s, i) => { const v = vector(s.m); let d = 0; for (let k = 0; k < dims; k++) d += ((v[k] - mine[k]) / sd[k]) ** 2; return { path: s.path, d: Math.sqrt(d) * (s.family === me.family ? 0.8 : 1) }; })
    .sort((a, b) => a.d - b.d).slice(0, n).map((s) => s.path);
}

/** For the motion experiment: the sounds that suit a point in the motion. Fastest moments want something that
 * builds (whooshes, swells); sudden stops want something sharp (impacts, clicks); arrivals a light, short sound. */
export function suggestFor(kind, sounds, n = 8) {
  // what the user marked a sound as good for counts most
  const score = (s) => {
    const t = new Set(s.traits), u = new Set(s.uses || []);
    if (kind === 'peak') return (u.has('transition') ? 4 : 0) + (s.family === 'whooshes' ? 3 : 0) + (t.has('swell') ? 2 : 0) - (t.has('long') ? 3 : 0);
    if (kind === 'stop') return (u.has('impact') ? 4 : u.has('ui-click') ? 2 : 0) + (s.family === 'impacts' ? 3 : s.family === 'clicks' ? 2 : 0) + (t.has('sharp') ? 2 : 0) + (t.has('heavy') ? 1 : 0) - (t.has('long') ? 3 : 0);
    return (u.has('appear') || u.has('notification') ? 3 : 0) + (s.family === 'clicks' || s.family === 'alerts' ? 2 : 0) + (t.has('short') ? 2 : 0) + (t.has('bright') ? 1 : 0) - (t.has('long') ? 3 : 0);
  };
  return sounds.map((s) => ({ s, k: score(s) })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.s.path);
}

/** Checks a sound's hand-set family, tags, description and uses (library.json). Returns { values } or { error }. */
export function cleanMeta(obj = {}) {
  const values = {};
  if (obj.family !== undefined && obj.family !== null) {
    if (!BY_ID[obj.family]) return { error: 'Unknown family' };
    values.family = obj.family;
  }
  if (obj.tags !== undefined && obj.tags !== null) {
    if (!Array.isArray(obj.tags) || obj.tags.length > 12) return { error: 'Tags must be a list of up to 12' };
    const tags = [...new Set(obj.tags.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : '')))];
    if (tags.some((t) => !/^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u.test(t))) return { error: 'Tags are short words (letters, numbers, spaces, hyphens)' };
    if (tags.length) values.tags = tags;
  }
  if (obj.description !== undefined && obj.description !== null) {
    // plain text, one paragraph: what the sound is and what it suits
    if (typeof obj.description !== 'string' || obj.description.length > 280 || /[\u0000-\u001f\u007f]/.test(obj.description.replace(/\n/g, ' '))) return { error: 'A description is up to 280 characters of plain text' };
    const d = obj.description.replace(/\s+/g, ' ').trim();
    if (d) values.description = d;
  }
  if (obj.uses !== undefined && obj.uses !== null) {
    if (!Array.isArray(obj.uses) || obj.uses.length > 12 || obj.uses.some((u) => typeof u !== 'string')) return { error: 'Uses must be a list of up to 12' };
    const ids = obj.uses.map(useId);
    if (ids.some((u) => !USE_IDS.has(u) && !OWN_USE.test(u))) return { error: 'Your own uses are short words (letters, numbers, spaces, hyphens)' };
    // the built-in ones in the list's order, then your own as given, once each
    const uses = [...USES.map((u) => u.id).filter((id) => ids.includes(id)), ...new Set(ids.filter((u) => !USE_IDS.has(u)))];
    if (uses.length) values.uses = uses;
  }
  return { values };
}
