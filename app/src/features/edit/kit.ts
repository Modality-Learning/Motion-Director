// The kit's sound rules (plain ES modules, shared with the renderer), with the types the Edit tab reads them by.
import * as sound from '@kit/sound.mjs';
import * as library from '@kit/sound-library.mjs';
import * as music from '@kit/music.mjs';
import type { Analysis, Anchor, Cue, LibEntry, Library, Moment, SettingKey, Settings, Sheet } from './types';

export interface SettingSpec { label: string; unit?: string; min?: number; max?: number; def: unknown; bool?: boolean }
export const SETTINGS = sound.SETTINGS as unknown as Record<SettingKey, SettingSpec>;
export const DEFAULTS = sound.DEFAULTS as unknown as Settings;
export const effective = sound.effective as (cue: Cue, lib: Library) => Settings;
export const overrides = sound.overrides as (cue: Cue) => SettingKey[];
export const playLength = sound.playLength as (s: Settings, fileLength: number) => number;
export const followEvent = sound.followEvent as (anchor: Anchor, events: { kind: string; t: number }[], reach?: number) => { kind: string; t: number } | null;
export interface Voice { cue: string; sound: string; at: number; from: number; to: number | null; gain: number; rate: number; keepPitch: boolean; fadeIn: number; fadeOut: number }
export const resolveVoices = sound.resolveVoices as (sheet: Sheet, lib: Library, moments: Moment[], duration?: number) => { voices: Voice[]; orphans: string[] };

export interface Family { id: string; label: string }
export interface Trait { label: string; hint: string }
export interface Use { id: string; label: string }
export type TraitKey = 'short' | 'sharp' | 'swell' | 'bright' | 'heavy' | 'busy' | 'long';
export const FAMILIES = library.FAMILIES as Family[];
export const TRAITS = library.TRAITS as Record<TraitKey, Trait>;
export const USES = library.USES as Use[];
export const familyLabel = library.familyLabel as (id: string) => string;
export const familyOf = library.familyOf as (path: string, m: Analysis | undefined, entry: LibEntry | null | undefined) => string;
export const traitsOf = library.traitsOf as (m: Analysis | undefined) => TraitKey[];
export const suggestUses = library.suggestUses as (path: string, family?: string | null) => string[];
export const suggestFor = library.suggestFor as (kind: string, sounds: { path: string; family: string; traits: string[]; uses?: string[] }[], n?: number) => string[];
export const useId = library.useId as (text: string) => string;
export const useLabel = library.useLabel as (id: string) => string;
/** The bar lines of a music brief across the film (kit/music.mjs). */
export const barTimes = music.barTimes as (brief: { bpm: number; beatsPerBar?: number; offset?: number }, duration: number) => number[];
