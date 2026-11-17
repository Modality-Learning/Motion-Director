// The Edit tab's state and what changes it: the film's cue sheet, the sound library, what is selected, and
// how it all reaches the preview and the disk.
//
// The sheet and the library are changed in place, as a drag changes a clip under the pointer; whatever
// changed them then calls touch() (or changed(), which also records the undo step and saves), and the
// timeline draws again. The playhead and drags never go through here: they move the page directly.
import { create } from 'zustand';
import { toast } from 'sonner';
import { getJson, post, type Kind } from '@/lib/api';
import { frameFor, tell, type FilmMessage } from '@/lib/frames';
import { local, useStudio, type Selection } from '@/lib/store';
import type { LiveEvent } from '@/lib/live';
import { DEFAULTS, SETTINGS, familyOf, followEvent, resolveVoices, type TraitKey } from './kit';
import { MUSIC, clamp, freeze, freeTrack, lenOf, placeAt, removeTrack as dropTrack, round, soundUrl, startOf, trackCount } from './geometry';
import { History } from './history';
import { analyseCurve, eventsOf, hitTimeOf, reanchor as anchorClips } from './motion';
import { fileLen, keepsPitch, loadSound, onLoaded, stopAudition, stretchUrl } from './audio';
import type { Analysis, Beat, Brief, Cue, Curve, CurveState, EventKind, Focus, LibEntry, Library, LineKey, Moment, Sample, Settings, Sheet, SoundFile } from './types';

export interface EditState {
  key: string | null;
  kind: Kind;
  film: string | null;
  duration: number;
  moments: Moment[];
  beats: Beat[];
  sheet: Sheet;
  lib: Library;
  files: SoundFile[];
  dir: string;
  /** whether the audio tool was built (it stretches speed changes that keep pitch) */
  audio: boolean;
  analysis: Record<string, Analysis>;
  /** the selected clip */
  sel: string | null;
  /** the sound open in the sound editor */
  editing: string | null;
  /** the element picked in the preview, and its graph */
  focus: Focus | null;
  curve: CurveState | null;
  /** objects that couldn't be found in the film when they were followed */
  lost: Set<string>;
  objectsOpen: boolean;
  /** the music lane shows a row per music track (else one thin row); remembered */
  musicOpen: boolean;
  /** the film's music brief (music.json), and why it doesn't check out when it doesn't */
  brief: Brief | null;
  briefError: string | null;
  /** a mark on the graph asks the library for sounds that suit it */
  suggest: { kind: EventKind; t: number } | null;
  query: string;
  traitFilter: Set<TraitKey>;
  /** library sections you opened (they start folded), and, while searching, the ones you folded (they start open) */
  opened: Set<string>;
  folded: Set<string>;
  /** sounds just added (dropped in from the computer's files), marked in the list */
  fresh: Set<string>;
  zoom: number;
  playing: boolean;
  hiddenLines: Set<LineKey>;
  canUndo: boolean;
  canRedo: boolean;
  /** the last message, shown in the sound editor's line */
  status: string;
  /** bumped whenever the sheet, the library or a sound's length changed in place */
  rev: number;
}

const hidden = (): Set<LineKey> => {
  try { return new Set((JSON.parse(local.get('graph-hidden') || '[]') as string[]).filter((k): k is LineKey => ['moves', 'grows', 'turns', 'shows'].includes(k))); } catch { return new Set(); }
};

export const useEdit = create<EditState>(() => ({
  key: null, kind: 'film', film: null, duration: 0, moments: [], beats: [],
  sheet: { master: 0, cues: [] }, lib: { sounds: {} }, files: [], dir: '', audio: false, analysis: {},
  sel: null, editing: null, focus: null, curve: null, lost: new Set(), objectsOpen: false, musicOpen: local.get('music-open') === '1', brief: null, briefError: null, suggest: null,
  query: '', traitFilter: new Set(), opened: new Set(), folded: new Set(), fresh: new Set(),
  zoom: 1, playing: false, hiddenLines: hidden(), canUndo: false, canRedo: false, status: '', rev: 0,
}));
const get = useEdit.getState, set = useEdit.setState;
export const touch = () => set((s) => ({ rev: s.rev + 1 }));
// many sounds decoding at once redraw the timeline once a frame
let soon = 0;
const touchSoon = () => { if (!soon) soon = requestAnimationFrame(() => { soon = 0; touch(); }); };
onLoaded(touchSoon);

/** What isn't drawn from: timers, versions, measured curves, and the playhead, which moves 60 times a second. */
export const M = {
  version: 0,
  stale: false,
  /** changes on their way to disk: a change from elsewhere waits for them (soundLive) */
  dirty: false,
  libDirty: false,
  libPending: null as Set<string> | null,
  saveTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  libTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  seq: 0,
  curves: new Map<string, Curve>(),
  sheetReady: false,
  frameReady: false,
  followed: false,
  /** the preview's time */
  t: 0,
  /** set by the timeline: moves the playhead (and with follow, scrolls to keep it in view) */
  placeHead: (_follow: boolean) => {},
  /** set by the timeline: scrolls back to the top, where an opened object's graph is */
  toTop: () => {},
};

export const hasSound = () => get().kind === 'film';
export const tellEdit = (msg: Record<string, unknown>) => tell('edit', msg);
export const cueById = (id: string | null) => (id ? get().sheet.cues.find((c) => c.id === id) : undefined);
export const momentLabel = (id: string) => get().moments.find((m) => m.id === id)?.label || id;
export const objectBy = (address: string) => Object.entries(get().sheet.objects || {}).find(([, o]) => o.selector === address) || null;
export const cueStart = (c: Cue) => startOf(c, get().moments);
export const cueLen = (c: Cue) => lenOf(c, get().lib, fileLen(c.sound));
/** A sound's settings with its library defaults: what plays where a clip sets nothing itself. */
export const soundDefaults = (path: string): Settings => ({ ...DEFAULTS, ...(get().lib.sounds[path] || {}) });

/* ── messages: a short note over the timeline, and the sound editor's line ── */
export function say(m: string) {
  set({ status: m });
  if (m) toast(m, { duration: 4000 });
}
const saving = (state: 'saving' | 'saved' | 'error', detail?: string) => useStudio.getState().setSave({ state, detail });

/* ── undo and redo: every change to the clips or a sound's defaults goes through changed() or setDefaults() ── */
const snapshot = () => JSON.stringify({ sheet: get().sheet, lib: get().lib });
export const history = new History(snapshot, () => set({ canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 }));

/* ── loading a piece; the Edit tab showing and leaving ── */
interface FilmWindow extends Window {
  Motion?: { moments?: Moment[] };
  __film?: { keys?: Beat[]; meter?: () => Uint8Array | null; motionCurve?: (step: number, address: string) => Promise<Sample[] | null> | Sample[] | null };
}
export const filmWindow = () => (frameFor('edit')?.contentWindow as FilmWindow | null | undefined) ?? null;
const beatsOf = (keys: Beat[] | undefined) => (keys || []).map(({ t, name, note }) => ({ t, name, note }));

export async function showSound(name: string, kind: Kind, duration: number) {
  const key = `${kind}/${name}`;
  if (get().key !== key) {
    stopAudition();
    set({ key, kind, film: name, duration, moments: [], beats: [], sel: null, editing: null, status: '', curve: null, focus: null, lost: new Set(), suggest: null });
    Object.assign(M, { curves: new Map(), followed: false, sheetReady: false, frameReady: false, t: useStudio.getState().playhead });
    if (kind === 'film') {
      const [lib, sheet] = await Promise.all([
        getJson<{ files: SoundFile[]; library: Library; dir: string; audio: boolean }>('/api/sounds'),
        getJson<{ sheet: Sheet | null; version: number }>(`/api/sound?film=${encodeURIComponent(name)}`),
      ]);
      if (get().key !== key) return; // another piece opened meanwhile
      set({ files: lib.files, lib: lib.library || { sounds: {} }, dir: lib.dir, audio: lib.audio, sheet: sheet.sheet || { master: 0, cues: [] } });
      loadBrief();
      Object.assign(M, { version: sheet.version ?? 0, stale: false });
    } else {
      set({ files: [], lib: { sounds: {} }, sheet: { master: 0, cues: [] } });
      Object.assign(M, { version: 0, stale: false });
    }
    history.reset();
    loadAnalysis();
    M.sheetReady = true;
    for (const c of get().sheet.cues) loadSound(c.sound);
    // the preview may have reported its moments while the library loaded
    const fw = filmWindow();
    try {
      if (fw?.Motion?.moments && fw.document.documentElement.dataset.ready === '1') {
        set({ moments: fw.Motion.moments.map(({ id, times, dur, label }) => ({ id, times, dur, label })), beats: beatsOf(fw.__film?.keys) });
        M.frameReady = true;
      }
    } catch { /* not loaded yet */ }
    pushVoices();
    touch();
  }
  tellEdit({ type: 'soundMode', on: true });
  maybeFollow(); // measuring waits for the Edit tab to be on screen
}
export function leaveSound() { stopAudition(); }

/** Messages from the Edit tab's preview. */
export function soundMessage(m: FilmMessage) {
  if (m.type === 'ready') {
    const patch: Partial<EditState> = {};
    if (m.moments) patch.moments = m.moments as Moment[];
    if (m.keys) patch.beats = beatsOf(m.keys as Beat[]);
    if (m.duration) patch.duration = m.duration as number;
    // a reloaded preview (its code changed) is measured again, and keeps what was selected
    const f = get().focus;
    tellEdit({ type: 'soundMode', on: true });
    Object.assign(M, { curves: new Map(), frameReady: true, followed: false });
    set({ ...patch, curve: null });
    maybeFollow();
    if (f) { tellEdit({ type: 'selectElement', address: f.address }); showCurve(f.address); }
    pushVoices();
  } else if (m.type === 'time') {
    M.t = m.t as number;
    M.placeHead(true);
    if (m.playing !== undefined && !!m.playing !== get().playing) set({ playing: !!m.playing });
  } else if (m.type === 'elementPick') focusElement(m.label as string | null, m.address as string | null, (m.scope as string | null) ?? null);
}

/* ── the voices the preview plays ── */
export async function pushVoices() {
  const seq = ++M.seq, { sheet, lib, moments, duration, audio } = get();
  const { voices } = resolveVoices(sheet, lib, moments, duration);
  const out = await Promise.all(voices.map(async (v) => {
    const base = { at: v.at, gain: v.gain, fadeIn: v.fadeIn, fadeOut: v.fadeOut };
    if (keepsPitch(v, audio)) {
      const url = await stretchUrl(v.sound, v.from, v.to, v.rate);
      if (url) return { ...base, url, from: 0, to: null, rate: 1 };
    }
    return { ...base, url: soundUrl(v.sound), from: v.from, to: v.to, rate: v.rate };
  }));
  if (seq !== M.seq) return; // a newer change is on its way
  tellEdit({ type: 'audio', voices: out });
}

/* ── saving: the cue sheet after a short pause, a sound's defaults likewise; heard at once ── */
/** The clips changed: one undo step, anchors brought up to date, heard, drawn, and saved in a moment. */
export function changed() {
  history.commit();
  reanchor();
  touch();
  pushVoices();
  clearTimeout(M.saveTimer);
  saving('saving');
  M.dirty = true;
  const mine = M.saveTimer = setTimeout(async () => {
    const r = await saveSheetNow();
    saving(r.ok ? 'saved' : 'error', r.data.error);
    if (M.saveTimer === mine) M.dirty = false;
  }, 300);
}
/* saves the cue sheet from the version this window loaded; if it changed elsewhere, nothing is overwritten.
 * Saves from this window go one at a time, each from the version the last one left, so quick changes (two
 * undos in a row) never trip over each other. */
type Saved = { ok: boolean; data: { error?: string; version?: number } };
let saveChain: Promise<unknown> = Promise.resolve();
function saveSheetNow(): Promise<Saved> {
  const run = saveChain.then(sendSheet);
  saveChain = run.catch(() => {});
  return run;
}
/** Saves any change still waiting for its pause now, before the server works on the film's sounds itself. */
async function flushSave() {
  if (!M.dirty) return;
  clearTimeout(M.saveTimer);
  const r = await saveSheetNow();
  saving(r.ok ? 'saved' : 'error', r.data.error);
  M.dirty = false;
}
const STALE = 'changed in another window: reload the studio';
async function sendSheet(): Promise<Saved> {
  if (M.stale) return { ok: false, data: { error: STALE } };
  const r = await post<{ version: number }>('/api/sound', { film: get().film, sheet: get().sheet, base: M.version });
  if (r.ok) M.version = r.data.version;
  else if (r.data.version !== undefined) {
    M.stale = true;
    say('Changed in another window: reload to see the latest.');
    return { ok: false, data: { error: STALE } };
  }
  return r;
}
/** A sound's defaults, used by every clip that doesn't set its own. */
export function setDefaults(path: string, values: LibEntry) {
  history.commit();
  // a default equal to the built-in one says nothing, so it isn't kept (and the field doesn't read "Set")
  const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== undefined && v !== SETTINGS[k as keyof Settings]?.def)) as LibEntry;
  // a new library object, so what is worked out from it (the library list's families, tags and uses) follows
  const sounds = { ...get().lib.sounds };
  if (Object.keys(clean).length) sounds[path] = clean; else delete sounds[path];
  set({ lib: { ...get().lib, sounds } });
  touch();
  pushVoices();
  // every sound changed in the last moment is saved, each with what it holds now
  (M.libPending ||= new Set()).add(path);
  M.libDirty = true;
  clearTimeout(M.libTimer);
  saving('saving');
  M.libTimer = setTimeout(saveLibrary, 250);
}
async function saveLibrary() {
  const paths = [...(M.libPending || [])];
  M.libPending = null;
  const rs = await Promise.all(paths.map((p) => post('/api/library', { path: p, settings: get().lib.sounds[p] || null })));
  const bad = rs.find((r) => !r.ok);
  saving(bad ? 'error' : 'saved', bad?.data.error);
  if (!M.libPending) M.libDirty = false;
}

async function restore(from: 'undo' | 'redo') {
  const was = JSON.parse(snapshot()) as { sheet: Sheet; lib: Library };
  const raw = history.step(from);
  if (raw == null) return;
  const next = JSON.parse(raw) as { sheet: Sheet; lib: Library };
  set({ sheet: next.sheet, lib: next.lib });
  if (get().sel && !cueById(get().sel)) set({ sel: null });
  touch();
  pushVoices();
  saving('saving');
  M.dirty = M.libDirty = true;
  // a save still waiting would land after this and undo the undo: cancel it, and write the restored state
  clearTimeout(M.saveTimer); clearTimeout(M.libTimer);
  const paths = new Set([...Object.keys(was.lib.sounds), ...Object.keys(next.lib.sounds)].filter((p) => JSON.stringify(was.lib.sounds[p]) !== JSON.stringify(next.lib.sounds[p])));
  for (const p of M.libPending || []) paths.add(p);
  M.libPending = null;
  const jobs = [saveSheetNow(), ...[...paths].map((path) => post('/api/library', { path, settings: next.lib.sounds[path] || null }))];
  const ok = (await Promise.all(jobs)).every((r) => r.ok);
  saving(ok ? 'saved' : 'error');
  M.dirty = M.libDirty = false;
}
export const undo = () => restore('undo');
export const redo = () => restore('redo');

/* ── live updates: the film's sounds or the library changed on disk, by an agent or another window. Taken in
 * unless this window has changes of its own on their way (then those are saved, and a sheet changed elsewhere
 * is refused as before, never overwritten). Our own saves come back too: same content, so nothing redraws. ── */
export async function soundLive(ev: LiveEvent) {
  const { kind, film } = get();
  if (kind !== 'film' || !film) return;
  if (ev.type === 'sound' && ev.film === film && ev.version !== M.version && !M.dirty) {
    const r = await getJson<{ sheet: Sheet | null; version: number }>(`/api/sound?film=${encodeURIComponent(film)}`).catch(() => null);
    if (!r?.sheet || M.dirty || r.version === M.version || get().film !== film) return;
    const same = JSON.stringify(r.sheet) === JSON.stringify(get().sheet);
    M.version = r.version; M.stale = false;
    if (same) return;
    history.flush();
    set({ sheet: r.sheet });
    history.accept();
    if (get().sel && !cueById(get().sel)) set({ sel: null });
    for (const c of r.sheet.cues) loadSound(c.sound);
    touch(); pushVoices();
  } else if (ev.type === 'music' && ev.film === film) {
    loadBrief();
  } else if ((ev.type === 'library' && !M.libDirty) || ev.type === 'sounds') {
    const lib = await getJson<{ files: SoundFile[]; library: Library }>('/api/sounds').catch(() => null);
    if (!lib) return;
    const files = JSON.stringify(lib.files) !== JSON.stringify(get().files);
    const settings = ev.type === 'library' && !M.libDirty && JSON.stringify(lib.library) !== JSON.stringify(get().lib);
    if (files) { set({ files: lib.files }); loadAnalysis(); }
    if (settings) { history.flush(); set({ lib: lib.library }); history.accept(); pushVoices(); }
    if (files || settings) touch();
  }
}

/* ── clips ── */
export function select(id: string | null) { if (get().sel !== id) set({ sel: id }); }
export function addCue(sound: string, at: number, track: number, object: { address: string; label: string } | null = null, music = false) {
  const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const { sheet, duration } = get();
  sheet.cues.push({ id, sound, at: round(clamp(at, music ? 0 : -5, duration)), track: clamp(track, 0, 15), ...(music ? { music: true } : object ? { object: ensureObject(object) } : {}) });
  loadSound(sound);
  set({ sel: id });
  changed();
}
export function removeCue(c: Cue) {
  const { sheet } = get();
  sheet.cues = sheet.cues.filter((x) => x !== c);
  if (get().sel === c.id) set({ sel: null });
  changed();
}
/** Moves a clip by `d` seconds (a frame with the arrow keys), freed from any moment. */
export function nudge(c: Cue, d: number) { freeze(c, get().moments); c.at = round((c.at ?? 0) + d); changed(); }
export function startAt(c: Cue, t: number) { freeze(c, get().moments); c.at = round(t); changed(); }
/* + Add track: one more row (up to 16) */
export function addTrack() { const { sheet } = get(); sheet.tracks = Math.min(16, trackCount(sheet) + 1); changed(); }
/** Removes track i and the sounds on it; the tracks below move up. ⌘Z brings it all back. */
export function removeTrack(i: number) {
  dropTrack(get().sheet, i);
  if (get().sel && !cueById(get().sel)) set({ sel: null });
  changed();
}
/** + on a sound: added starting at the playhead, or with ⌘ held, with its hit point on the playhead. It goes to
 * the open object if there is one, else to the first track free at that time. */
export function addHere(path: string, alignHit: boolean) {
  const { focus, sheet, analysis, moments, lib } = get();
  const { at, len } = placeAt(soundDefaults(path), M.t, alignHit, analysis[path]);
  // music goes on the music lane, from the start of the film unless a later time was asked for
  if (!focus && familyOf(path, analysis[path], lib.sounds[path]) === 'music') { addMusic(path, at); return; }
  const lane = focus ? objectBy(focus.address)?.[0] ?? '__none' : null; // an element with no sounds yet: an empty lane
  const track = freeTrack(sheet, lane, at, len, cueLen, moments);
  if (!focus && track >= trackCount(sheet)) sheet.tracks = Math.min(16, track + 1);
  addCue(path, at, track, focus);
}

/* ── music: the soundtrack lane, and the brief the music was made from (films/<film>/music.json, kit/music.mjs) ── */
/** A track of music on the music lane, on its first row free at that time. */
export function addMusic(path: string, at: number) {
  const { sheet, moments } = get();
  const t = Math.max(0, at), track = freeTrack(sheet, MUSIC, t, cueLen({ id: '', sound: path }), cueLen, moments);
  addCue(path, t, track, null, true);
}
export function setMusicOpen(open: boolean) { set({ musicOpen: open }); local.set('music-open', open ? '1' : '0'); }
export async function loadBrief() {
  const film = get().film;
  if (!film || get().kind !== 'film') return;
  const r = await getJson<{ brief?: Brief; none?: boolean; error?: string }>(`/api/music?film=${encodeURIComponent(film)}`).catch(() => null);
  if (get().film !== film) return;
  set({ brief: r?.brief ?? null, briefError: r?.error ?? null });
}
/** Line up: the server measures the music clip's track and sets its start, trim and speed (the sheet comes back
 * live). Unsaved changes here are saved first, so the server works on what you see. */
export async function lineUpMusic(cue?: string) {
  const film = get().film;
  if (!film) return { error: 'No film' };
  await flushSave();
  const r = await post<{ plan?: { note: string; at: number; drop: string | null; matched: boolean }; error?: string }>('/api/music/fit', { film, cue });
  return r.ok ? r.data : { error: r.data.error || 'Could not line the music up' };
}

/* ── objects: elements of the film that sounds belong to. Picking one in the preview opens its area: how it
 * moves, grows, turns and shows, and its own timeline. ── */
/** The object for an element, made the first time a sound is given to it. */
function ensureObject({ address, label }: { address: string; label: string }) {
  const known = objectBy(address);
  if (known) return known[0];
  const id = `o${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const { sheet } = get();
  sheet.objects = { ...(sheet.objects || {}), [id]: { label: label.replace(/[“”]/g, '').slice(0, 80) || 'Object', selector: address } };
  return id;
}
function reanchor() {
  const { sheet, lib, analysis, moments } = get();
  anchorClips(sheet, (sel) => M.curves.get(sel), (c) => hitTimeOf(c, lib, analysis, moments));
}
export function focusElement(label: string | null, address: string | null, scope: string | null = null) {
  set({ sel: null });
  if (!label || !address) { set({ focus: null, curve: null }); return; }
  const known = objectBy(address);
  set({ focus: { label: known ? known[1].label : label, address, scope } });
  showCurve(address);
}
export function focusObject(id: string) {
  const ob = get().sheet.objects?.[id];
  if (!ob) return;
  tellEdit({ type: 'selectElement', address: ob.selector });
  set({ focus: { label: ob.label, address: ob.selector, scope: null } });
  showCurve(ob.selector);
  M.toTop();
}
export function closeFocus() { set({ focus: null, curve: null }); tellEdit({ type: 'elementClear' }); }
export async function showCurve(address: string) {
  const known = M.curves.get(address);
  set({ curve: known || { busy: true } });
  if (known) return;
  const cv = await measureCurve(address);
  if (get().focus?.address !== address) return;
  set({ curve: cv || { missing: true } });
  reanchor();
  touch();
}

// the Edit tab's preview is on screen and laid out: only then can anything be measured
export const canMeasure = () => {
  const r = useStudio.getState().route;
  return r.view === 'work' && r.tab === 'edit' && (frameFor('edit')?.clientWidth || 0) > 0;
};
export async function measureCurve(address: string): Promise<Curve | null> {
  const known = M.curves.get(address);
  if (known) return known;
  if (!canMeasure()) return null; // never from a hidden preview, and nothing cached
  let samples: Sample[] | null | undefined = null;
  try { samples = await filmWindow()?.__film?.motionCurve?.(0.04, address); } catch { samples = null; }
  if (!samples?.length) return null;
  const cv = analyseCurve(samples);
  M.curves.set(address, cv);
  return cv;
}
/* following waits for both the preview and the cue sheet, whichever arrives last, and runs once per load */
export function maybeFollow() {
  if (!M.sheetReady || !M.frameReady || M.followed) return;
  if (!canMeasure()) return; // tried again when the Edit tab shows (showSound)
  M.followed = true;
  followObjects();
}
/** On opening the studio: measure each object with sounds again; if the event a clip sits by has moved, the
 * clip moves with it (one undoable step). An object that can't be found keeps its sounds where they were. */
async function followObjects() {
  const objs = Object.entries(get().sheet.objects || {});
  if (!objs.length) return;
  const moved: string[] = [], lost: string[] = [], unsure: string[] = [], gone = new Set<string>();
  for (const [id, ob] of objs) {
    const cv = await measureCurve(ob.selector);
    if (!canMeasure()) { M.followed = false; return; } // hidden while measuring: start again when it shows
    if (!cv?.samples || cv.samples.every((p) => p[5] < 0.05)) { gone.add(id); lost.push(ob.label); continue; }
    const evs = eventsOf(cv);
    let shift: number | null = null;
    for (const c of get().sheet.cues.filter((x) => x.object === id && x.anchor)) {
      const ev = followEvent(c.anchor!, evs);
      if (!ev) { unsure.push(ob.label); continue; } // its event is gone or went far: left where it is
      const d = round(ev.t - c.anchor!.t);
      if (Math.abs(d) > 0.005) { c.at = round((c.at ?? 0) + d); shift = d; }
    }
    if (shift != null) moved.push(`${ob.label} (${shift > 0 ? '+' : ''}${shift.toFixed(2)} s)`);
  }
  set({ lost: gone });
  if (moved.length) changed(); else touch();
  const note = [moved.length ? `Sounds followed ${moved.join(', ')}` : '', lost.length ? `Can't find ${lost.join(', ')} in the film` : '',
    unsure.length ? `Left ${[...new Set(unsure)].join(', ')} where they were: check them` : ''].filter(Boolean).join('. ');
  if (note) say(note);
}

/* ── the library ── */
export async function loadAnalysis() {
  const r = await getJson<{ analysis?: Record<string, Analysis> }>('/api/sounds/analysis').catch(() => null);
  if (r?.analysis) set({ analysis: r.analysis });
}
/* sound files dragged in from the computer are copied into the library (never over an existing file) */
/** A sound to add, and the folder it came in (from a dropped folder: "Pack/Impacts"), kept in the library. */
export interface Incoming { file: File; folder: string }
const SOUND_FILE = /\.(wav|aif|aiff|aifc|caf|mp3|m4a|aac|flac)$/i;

/** What was dropped on the library: files, and folders walked for the sound files inside them (other files, such as
 * a pack's licence or a .DS_Store, are skipped). A folder keeps its name and its subfolders in the library. */
export async function droppedSounds(items: DataTransferItemList | null, files: FileList): Promise<{ sounds: Incoming[]; skipped: number }> {
  const sounds: Incoming[] = []; let skipped = 0;
  const entries = items ? [...items].map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null)).filter(Boolean) as FileSystemEntry[] : [];
  if (!entries.length) {
    // no entries to walk (an older browser): the files as given
    for (const f of [...files]) { if (SOUND_FILE.test(f.name) && f.size > 0) sounds.push({ file: f, folder: '' }); else skipped++; }
    return { sounds, skipped };
  }
  const fileOf = (e: FileSystemFileEntry) => new Promise<File | null>((ok) => e.file(ok, () => ok(null)));
  const readAll = async (d: FileSystemDirectoryEntry) => {
    const r = d.createReader(), all: FileSystemEntry[] = [];
    // a directory reader hands its entries over in batches, until an empty one
    for (;;) { const batch = await new Promise<FileSystemEntry[]>((ok) => r.readEntries(ok, () => ok([]))); if (!batch.length) break; all.push(...batch); }
    return all;
  };
  const walk = async (e: FileSystemEntry, folder: string): Promise<void> => {
    if (e.name.startsWith('.')) { skipped++; return; }
    if (e.isDirectory) { const into = folder ? `${folder}/${e.name}` : e.name; for (const c of await readAll(e as FileSystemDirectoryEntry)) await walk(c, into); return; }
    if (!SOUND_FILE.test(e.name)) { skipped++; return; }
    const f = await fileOf(e as FileSystemFileEntry);
    if (f && f.size > 0) sounds.push({ file: f, folder }); else skipped++;
  };
  for (const e of entries) await walk(e, '');
  return { sounds, skipped };
}

export async function importFiles(list: Incoming[], skipped = 0) {
  if (!list.length) { say(skipped ? 'No sound files in what was dropped (WAV, AIFF, MP3, M4A, CAF or FLAC)' : ''); return; }
  const added: string[] = [], failed: string[] = [];
  const progress = list.length > 3 ? toast.loading(`Adding ${list.length} sounds…`) : null;
  for (const [j, { file: f, folder }] of list.entries()) {
    const q = `name=${encodeURIComponent(f.name)}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`;
    const r = await fetch(`/api/sounds/import?${q}`, { method: 'POST', headers: { 'x-promo-studio': '1', 'content-type': 'application/octet-stream' }, body: f })
      .then(async (x) => ({ ok: x.ok, data: (await x.json().catch(() => ({}))) as { path?: string; error?: string } })).catch(() => ({ ok: false, data: {} as { path?: string; error?: string } }));
    if (r.ok && r.data.path) added.push(r.data.path); else failed.push(`${folder ? `${folder}/` : ''}${f.name} (${r.data.error || 'could not be added'})`);
    if (progress != null && (j % 10 === 9 || j === list.length - 1)) toast.loading(`Adding sounds: ${j + 1} of ${list.length}`, { id: progress });
  }
  const lib = await getJson<{ files: SoundFile[] }>('/api/sounds');
  set({ files: lib.files, query: '', fresh: new Set(added) });
  loadAnalysis();
  const summary = `Added ${added.length} sound${added.length === 1 ? '' : 's'}${skipped ? ` (${skipped} other file${skipped === 1 ? '' : 's'} skipped)` : ''}`;
  if (progress != null) toast.success(summary, { id: progress, duration: 4000 });
  if (failed.length) say(`Not added: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ` and ${failed.length - 5} more` : ''}`);
}

/* ── the sound editor: the whole file, its defaults set by dragging ── */
export function openEditor(path: string) { set({ editing: path }); tellEdit({ type: 'pause' }); loadSound(path); }
export function closeEditor() { stopAudition(); set({ editing: null }); }

/* ── zoom and the graph's lines ── */
export function setLine(key: LineKey, visible: boolean) {
  const next = new Set(get().hiddenLines);
  if (visible) next.delete(key); else next.add(key);
  local.set('graph-hidden', JSON.stringify([...next]));
  set({ hiddenLines: next });
}

/* ── what the inspector shows: studio's params panel follows the selection ── */
export function selectionOf(s: Pick<EditState, 'sel' | 'focus' | 'sheet'>): Selection {
  const c = s.sel ? s.sheet.cues.find((x) => x.id === s.sel) : undefined;
  return c ? { kind: 'clip', id: c.id } : s.focus ? { kind: 'element', scope: s.focus.scope || null, label: s.focus.label } : { kind: 'none' };
}
useEdit.subscribe((s, p) => {
  if (s.sel === p.sel && s.focus === p.focus && s.rev === p.rev) return;
  const next = selectionOf(s), now = useStudio.getState().selection;
  if (JSON.stringify(next) !== JSON.stringify(now)) useStudio.getState().setSelection(next);
});

/* For an agent working in the studio page (the promo-motion skill's SOUND.md): the same measuring the studio
 * uses, so marks and anchors agree with what the user sees on the graph. Read-only. */
if (typeof window !== 'undefined') {
  (window as unknown as { __promoSound: unknown }).__promoSound = {
    measure: (address: string) => measureCurve(address), // { samples [t,x,y,w,h,shown,spin,tilt], marks [{kind,t,line}], … }
    eventsOf,                                              // an object's events in order: what a clip's anchor counts
    sheet: () => structuredClone(get().sheet), moments: () => get().moments, beats: () => get().beats, analysis: () => get().analysis,
  };
}

