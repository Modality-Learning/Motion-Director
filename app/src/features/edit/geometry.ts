// The timeline's geometry and the clip rules that have no UI: where a clip sits, how long it plays, what a drag
// does to it, how many tracks there are. Plain functions, so they can be tested.
import { SETTINGS, effective, playLength } from './kit';
import type { Cue, Library, Moment, Settings, Sheet } from './types';

export const FRAME = 1 / 25; // one frame at the render rate: the nudge step
export const GUT = 148, PAD = 16, TRK = 52, MINI = 30; // the name column, right padding, track and summary row heights
export const G = { max: 12, min: -40 }; // the volume line's range, in dB

export const round = (v: number, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const nameOf = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '');
export const shortName = (p: string) => nameOf(p).replace(/^mixkit-/, '').replace(/-\d+$/, '');
export const soundUrl = (p: string) => `/sounds/${p.split('/').map(encodeURIComponent).join('/')}`;
export const dB = (g: number) => `${g > 0 ? '+' : ''}${g} dB`;

/** Where a volume sits on a clip of height h, and back (in half-dB steps). */
export const gainY = (g: number, h: number) => ((G.max - g) / (G.max - G.min)) * h;
export const yGain = (y: number, h: number) => round(clamp(G.max - (y / h) * (G.max - G.min), G.min, G.max) * 2, 0) / 2 + 0; // + 0: never -0

/** Pixels a second: the whole film fills the visible width at zoom 1. */
export const ppsFor = (width: number, duration: number, zoom: number) => ((Math.max(width, GUT + PAD + 1) - GUT - PAD) / (duration || 1)) * zoom;
export const xAt = (t: number, k: number) => GUT + t * k;
/** The ruler's ticks: a labelled one every `every` seconds, a small one every `tick`. */
export function ticks(k: number, duration: number) {
  const every = k > 160 ? 0.5 : k > 60 ? 1 : k > 25 ? 2 : 5, tick = every < 1 ? 0.1 : 1, out: { t: number; major: boolean }[] = [];
  for (let i = 0; i * tick <= duration + 1e-9; i++) {
    const t = round(i * tick, 2);
    out.push({ t, major: Math.abs(t / every - Math.round(t / every)) < 1e-6 });
  }
  return out;
}

const momentById = (id: string, moments: Moment[]) => (id === 'start' ? { id: 'start', times: [0] } : moments.find((m) => m.id === id));
/** Where a clip starts on the film (a clip tied to a moment starts at the moment's first time). */
export const startOf = (c: Cue, moments: Moment[]) => (c.moment === undefined ? c.at ?? 0 : (momentById(c.moment, moments)?.times[0] ?? 0) + (c.offset || 0));
/** Once moved, a clip tied to a moment is placed freely: nothing snaps for now. */
export function freeze(c: Cue, moments: Moment[]) {
  if (c.moment !== undefined) { c.at = round(startOf(c, moments)); delete c.moment; delete c.offset; }
}
/** How long a clip plays, given its file's length (half a second until the file is known). */
export const lenOf = (c: Cue, lib: Library, fileLen: number | null) => (fileLen ? playLength(effective(c, lib), fileLen) : 0.5);

/** The lane a clip is on: the music lane, an object's, or your own tracks (null). Tracks are numbered within it. */
export const MUSIC = '#music';
export const laneOf = (c: Cue) => (c.music ? MUSIC : c.object ?? null);
/* your own tracks: how many there are is saved with the film's sounds, so adding and removing are undoable */
export const usedTracks = (sheet: Sheet) => sheet.cues.filter((c) => laneOf(c) === null).reduce((m, c) => Math.max(m, c.track ?? 0), -1) + 1;
export const trackCount = (sheet: Sheet) => clamp(Math.max(usedTracks(sheet), sheet.tracks ?? Math.max(2, usedTracks(sheet) + 1)), 1, 16);
/** Removes track i and the sounds on it; the tracks below move up. */
export function removeTrack(sheet: Sheet, i: number) {
  const n = trackCount(sheet);
  sheet.cues = sheet.cues.filter((c) => laneOf(c) !== null || (c.track ?? 0) !== i);
  for (const c of sheet.cues) if (laneOf(c) === null && (c.track ?? 0) > i) c.track = (c.track ?? 0) - 1;
  sheet.tracks = Math.max(1, n - 1);
}
/** An object's layer: a row per track its clips use, and one to spare for dropping when it's open. */
export const layerRows = (cues: Cue[], open: boolean) => Math.max(1, cues.reduce((m, c) => Math.max(m, c.track ?? 0), -1) + 1 + (open ? 1 : 0));

/** The first track (in a lane: the music lane, an object's, or your own with null) free from `at` for `len` seconds. */
export function freeTrack(sheet: Sheet, lane: string | null, at: number, len: number, lenOfCue: (c: Cue) => number, moments: Moment[]) {
  const busy = (tr: number) => sheet.cues.some((c) => laneOf(c) === lane && (c.track ?? 0) === tr && startOf(c, moments) < at + len && startOf(c, moments) + lenOfCue(c) > at);
  let track = 0;
  while (track < 15 && busy(track)) track++;
  return track;
}

/** Where to add a sound so that it starts at t, or with `alignHit` its hit point (set, else measured) lands on t. */
export function placeAt(s: Settings, t: number, alignHit: boolean, measured?: { hit?: number; length?: number }) {
  const end = s.to ?? measured?.length ?? s.from + 1, hit = s.hit ?? measured?.hit;
  const at = alignHit && hit != null && hit >= s.from && hit <= end ? t - (hit - s.from) / s.rate : t;
  return { at, len: (end - s.from) / s.rate };
}

/* ── dragging a clip ── */
export type DragMode = 'move' | 'gain' | 'trim-l' | 'trim-r' | 'stretch-l' | 'stretch-r';
/** What a press on a clip does: an edge trims (or with Option stretches), the volume line sets the gain. */
export function dragModeAt(ox: number, oy: number, width: number, gain: number, h: number, alt: boolean): DragMode {
  const edge = ox < 7 ? 'l' : ox > width - 7 ? 'r' : null;
  return edge ? `${alt ? 'stretch' : 'trim'}-${edge}` : Math.abs(oy - gainY(gain, h)) <= 5 ? 'gain' : 'move';
}
export interface DragStart { s0: Settings; len0: number; start0: number; track0: number; flen: number; to0: number; oy: number; h: number; duration: number }
/** The clip's own values after dragging by dx seconds and dy pixels; only what the drag sets. */
export function dragTo(mode: DragMode, d: DragStart, dt: number, dy: number): Partial<Cue> {
  const { s0, len0, start0, track0, flen, to0 } = d;
  if (mode === 'move') return { at: round(clamp(start0 + dt, -30, d.duration)), track: clamp(Math.round(track0 + dy / TRK), 0, 15) };
  if (mode === 'trim-l') {
    const from = clamp(s0.from + dt * s0.rate, 0, to0 - 0.02 * s0.rate);
    return { from: round(from), at: round(start0 + (from - s0.from) / s0.rate) };
  }
  if (mode === 'trim-r') return { to: round(clamp(to0 + dt * s0.rate, s0.from + 0.02 * s0.rate, flen)) };
  if (mode === 'gain') return { gain: yGain(d.oy + dy, d.h) };
  const len = Math.max(0.05, len0 + (mode === 'stretch-r' ? dt : -dt));
  const rate = round(clamp((to0 - s0.from) / len, SETTINGS.rate.min!, SETTINGS.rate.max!));
  return mode === 'stretch-l' ? { rate, at: round(start0 + len0 - (to0 - s0.from) / rate) } : { rate };
}
/** The value that sits on a clip while it's dragged. */
export const readout = (mode: DragMode, s: Settings, start: number, len: number) =>
  mode === 'gain' ? dB(s.gain) : mode.startsWith('stretch') ? `${s.rate}×` : `${start.toFixed(2)} s · ${len.toFixed(2)} s`;
