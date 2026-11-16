// The Edit tab's data: a film's cue sheet (films/<film>/sound.json), the sound library's defaults
// (sounds/library.json), and what the preview reports. kit/sound.mjs is the source of truth for the shapes.

export interface Settings {
  gain: number;
  from: number;
  to: number | null;
  rate: number;
  keepPitch: boolean;
  fadeIn: number;
  fadeOut: number;
  hit: number | null;
}
export type SettingKey = keyof Settings;

export type EventKind = 'in' | 'peak' | 'stop' | 'out';
/** The object's event a clip sits nearest: its nth arrival, fastest moment, stop or exit. */
export interface Anchor { kind: EventKind; n: number; t: number }

export interface Cue extends Partial<Settings> {
  id: string;
  sound: string;
  at?: number;
  moment?: string;
  offset?: number;
  track?: number;
  mute?: boolean;
  object?: string;
  anchor?: Anchor;
}
export interface SheetObject { label: string; selector: string }
export interface Sheet { master: number; tracks?: number; objects?: Record<string, SheetObject>; cues: Cue[] }

export interface LibEntry extends Partial<Settings> { family?: string; tags?: string[]; uses?: string[]; description?: string }
export interface Library { sounds: Record<string, LibEntry> }

export interface Moment { id: string; times: number[]; dur?: number; label?: string }
export interface Beat { t: number; name: string; note?: string }
export interface SoundFile { path: string }
/** What the server measured of a sound (server/sound-lib.mjs). */
export interface Analysis { ok?: boolean; silent?: boolean; hit?: number; length?: number; brightness?: number; attack?: number; [k: string]: unknown }

/** An element of the film picked in the preview (or opened from its object). */
export interface Focus { label: string; address: string; scope: string | null }

export type LineKey = 'moves' | 'grows' | 'turns' | 'shows';
/** One measured step: [t, x, y, w, h, shown, spin, tilt]. */
export type Sample = number[];
export interface Mark { kind: EventKind; t: number; line?: LineKey }
export interface Curve {
  samples: Sample[];
  move: number[]; grow: number[]; turn: number[];
  nm: number[]; ng: number[]; nt: number[];
  maxMove: number; maxGrow: number; maxTurn: number;
  marks: Mark[];
}
export type CurveState = Curve | { busy: true } | { missing: true };
export const isCurve = (c: CurveState | null | undefined): c is Curve => !!c && 'samples' in c;
