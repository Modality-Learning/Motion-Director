// The library, sorted to find the right sound fast: families (by name, else by how it sounds, else as set by
// hand), trait filters, search across names, families, tags and traits, and suggestions for a point in the
// motion. See kit/sound-library.mjs. No UI here.
import { TRAITS, USES, familyLabel, familyOf, traitsOf, useLabel, type TraitKey } from './kit';
import type { Analysis, LibEntry, Library, SoundFile } from './types';

export interface SoundInfo { path: string; m?: Analysis; family: string; traits: TraitKey[]; tags: string[]; uses: string[]; description: string; len: number | null; organised: string | null }

export function soundsInfo(files: SoundFile[], lib: Library, analysis: Record<string, Analysis>, fileLen: (p: string) => number | null): SoundInfo[] {
  return files.map((f) => {
    const m = analysis[f.path], entry = lib.sounds[f.path];
    return { path: f.path, m, family: familyOf(f.path, m, entry), traits: traitsOf(m), tags: entry?.tags || [], uses: entry?.uses || [], description: entry?.description || '', len: m?.length ?? fileLen(f.path), organised: entry?.organised || null };
  });
}

/** Whether a sound matches the search (anywhere in its name, family, description, tags, uses and traits) and has every trait asked for. */
export function matches(x: SoundInfo, query: string, traits: Set<TraitKey>) {
  const q = query.trim().toLowerCase();
  return (!q || [x.path, familyLabel(x.family), x.description, ...x.tags, ...x.uses.map(useLabel), ...x.traits.map((t) => TRAITS[t].label)].some((v) => v.toLowerCase().includes(q)))
    && [...traits].every((t) => x.traits.includes(t));
}

/** A row's tooltip: what the sound is, where it's shelved and what it's good for. */
export function tipOf(x: SoundInfo) {
  return `${x.path}\n${familyLabel(x.family)}${x.traits.length ? ` · ${x.traits.map((t) => TRAITS[t].label.toLowerCase()).join(', ')}` : ''}${x.tags.length ? ` · ${x.tags.join(', ')}` : ''}${x.uses.length ? `\nGood for: ${x.uses.map(useLabel).join(', ')}` : ''}${x.description ? `\n${x.description}` : ''}${x.organised ? `\nOrganised by Claude, ${x.organised}` : ''}\nDrag onto the timeline`;
}

const BUILT_IN = new Set(USES.map((u) => u.id));
/** Your own uses, from every sound in the library, so one made for one sound can be given to others. */
export const ownUses = (lib: Library) => [...new Set(Object.values(lib.sounds).flatMap((e) => e.uses || []).filter((u) => !BUILT_IN.has(u)))].sort();
/** A sound's uses as stored: the built-in ones in their own order, then your own. */
export function withUses(entry: LibEntry, list: string[]): LibEntry {
  const next = { ...entry }, ids = [...new Set(list)];
  if (ids.length) next.uses = [...USES.map((u) => u.id).filter((id) => ids.includes(id)), ...ids.filter((id) => !BUILT_IN.has(id))];
  else delete next.uses;
  return next;
}
/** A use you typed: letters and numbers, spaces and hyphens, up to 24 characters. */
export const OWN_USE = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u;
/** Tags as typed (comma between): lower case, no repeats, at most 12. */
export const parseTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
