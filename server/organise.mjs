// Organising the sound library: Claude reads each sound's name, folder and measurements and gives it a family,
// tags, a description and uses, far better than the studio's own rules (kit/sound-library.mjs familyOf), which
// only match words in the name and a few thresholds. A sound Claude has organised carries the day it did so
// (`organised`), so a later pass picks up only what is new. The decisions live here, free of I/O; the command
// is render/sound-organise.mjs, and the guidance is skill/LIBRARY.md.
import { cleanEntry } from '../kit/sound.mjs';
import { familyFromName, familyLabel, familyOf, traitsOf, useLabel } from '../kit/sound-library.mjs';

/** The sounds to organise: those not organised yet (or all), optionally under one folder, at most n of them. */
export function toOrganise(files, lib, analysis, { all = false, folder = '', n = 150 } = {}) {
  const organised = files.filter((f) => lib.sounds[f.path]?.organised).length;
  const todo = files.filter((f) => (all || !lib.sounds[f.path]?.organised) && (!folder || f.path.startsWith(folder.replace(/\/?$/, '/'))));
  return { total: files.length, organised, waiting: todo.length, sounds: todo.slice(0, n).map((f) => describe(f.path, lib.sounds[f.path], analysis[f.path])) };
}

/** What Claude needs to judge a sound: its path, what it measures as, and what it is filed as now and why. */
export function describe(path, entry = {}, m) {
  const family = familyOf(path, m, entry);
  const from = entry.family ? 'set' : familyFromName(path) ? 'name' : m?.ok ? 'sound' : 'none';
  return {
    path,
    length: m?.ok ? Math.round(m.length * 100) / 100 : null,
    traits: traitsOf(m),
    family, familyFrom: from,
    ...(entry.tags?.length ? { tags: entry.tags } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.uses?.length ? { uses: entry.uses } : {}),
    ...(entry.organised ? { organised: entry.organised } : {}),
  };
}

/** One line per sound, for reading in a terminal or a chat. */
export function lineOf(s) {
  const bits = [s.path, s.length != null ? `${s.length}s` : 'not measured', s.traits.length ? s.traits.join(' ') : null,
    `now ${familyLabel(s.family)} (${{ set: 'set', name: 'from its name', sound: 'from how it sounds', none: 'unknown' }[s.familyFrom]})`,
    s.tags ? `tags ${s.tags.join(', ')}` : null, s.uses ? `for ${s.uses.map(useLabel).join(', ')}` : null, s.description ? `“${s.description}”` : null,
    s.organised ? `organised ${s.organised}` : null];
  return bits.filter(Boolean).join(' | ');
}

/** A batch of Claude's decisions merged into the sounds' entries: family, tags, description and uses replace
 * what was there (a field left out is kept), a sound's own settings (gain, trim, hit…) are untouched, and each
 * gets today's date. A bad entry is reported and skipped, never the whole batch.
 * batch: { "<path>": { family?, tags?, description?, uses? } }. Returns { entries, errors }. */
export function mergeOrganised(lib, batch, today, known = null) {
  const entries = {}, errors = [];
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) return { entries, errors: ['The batch must be an object of sound paths'] };
  for (const [path, given] of Object.entries(batch)) {
    if (known && !known.has(path)) { errors.push(`${path}: not in the library`); continue; }
    if (!given || typeof given !== 'object' || Array.isArray(given)) { errors.push(`${path}: not an object`); continue; }
    const extra = Object.keys(given).filter((k) => !['family', 'tags', 'description', 'uses'].includes(k));
    if (extra.length) { errors.push(`${path}: only family, tags, description and uses can be set here (not ${extra.join(', ')})`); continue; }
    const next = { ...(lib.sounds[path] || {}) };
    for (const k of ['family', 'tags', 'description', 'uses']) if (given[k] !== undefined) { if (given[k] === null || (Array.isArray(given[k]) && !given[k].length) || given[k] === '') delete next[k]; else next[k] = given[k]; }
    next.organised = today;
    const v = cleanEntry(next);
    if (v.error) { errors.push(`${path}: ${v.error}`); continue; }
    entries[path] = v.values;
  }
  return { entries, errors };
}
