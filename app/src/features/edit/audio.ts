// Audio in the studio: decoding (lengths, waveforms) and auditioning one sound as it will sound in the film.
// The previews play the film's own mix; this is only for trying a sound on its own.
import { useSyncExternalStore } from 'react';
import { post } from '@/lib/api';
import { soundUrl } from './geometry';
import type { Settings } from './types';

type Loading = Promise<AudioBuffer | null> & { buf?: AudioBuffer };
const bufs = new Map<string, Loading>();
const lens = new Map<string, number>();
const stretches = new Map<string, Promise<string | null>>();
let actx: AudioContext | null = null;
export const ctx = () => (actx ||= new AudioContext());

/* who hears about it: a file decoded (its length and waveform are known), an audition starting or ending */
const loaded = new Set<(path: string) => void>();
export function onLoaded(fn: (path: string) => void) { loaded.add(fn); return () => { loaded.delete(fn); }; }

export function loadSound(path: string, url = soundUrl(path)): Loading {
  let p = bufs.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => ctx().decodeAudioData(b))
      .then((buf) => {
        if (url === soundUrl(path)) { lens.set(path, buf.duration); bufs.get(url)!.buf = buf; for (const fn of loaded) fn(path); }
        return buf;
      }).catch(() => null) as Loading;
    bufs.set(url, p);
  }
  return p;
}
export const bufOf = (path: string) => bufs.get(soundUrl(path))?.buf ?? null;
export const fileLen = (path: string) => lens.get(path) ?? null;

export function stretchUrl(sound: string, from: number, to: number | null, rate: number) {
  const key = JSON.stringify([sound, from, to, rate]);
  if (!stretches.has(key)) stretches.set(key, post<{ url: string }>('/api/stretch', { sound, from, to, rate }).then((r) => (r.ok ? r.data.url : null)));
  return stretches.get(key)!;
}
/** A speed change that keeps pitch is made by the audio tool, when there is one; else it plays tape-style. */
export const keepsPitch = (s: Pick<Settings, 'keepPitch' | 'rate'>, audioTool: boolean) => s.keepPitch && Math.abs(s.rate - 1) > 1e-6 && audioTool;

export interface Audition { src: AudioBufferSourceNode; start: number; len: number; path: string }
let audition: Audition | null = null;
const auditioning = new Set<() => void>();
const announce = () => { for (const fn of auditioning) fn(); };
export const currentAudition = () => audition;

/** Plays one sound with the given settings, as it will sound in the film; onStart hears when and how long. */
export async function play(path: string, s: Settings, opts: { audioTool: boolean; onStart?: (a: Audition) => void; onFail?: () => void }) {
  stopAudition();
  const c = ctx();
  await c.resume();
  const stretch = keepsPitch(s, opts.audioTool);
  const url = stretch ? await stretchUrl(path, s.from, s.to, s.rate) : soundUrl(path);
  const buf = url ? await loadSound(path, url) : null;
  if (!buf) { opts.onFail?.(); return; }
  const from = stretch ? 0 : s.from, rate = stretch ? 1 : s.rate, end = stretch ? buf.duration : Math.min(s.to ?? buf.duration, buf.duration);
  const len = Math.max(0, (end - from) / rate);
  const src = c.createBufferSource(), g = c.createGain(), level = Math.pow(10, s.gain / 20), now = c.currentTime + 0.02;
  src.buffer = buf; src.playbackRate.value = rate;
  const fi = Math.min(s.fadeIn || 0, len), fo = Math.min(s.fadeOut || 0, len - fi);
  g.gain.setValueAtTime(fi ? 0 : level, now);
  if (fi) g.gain.linearRampToValueAtTime(level, now + fi);
  if (fo) { g.gain.setValueAtTime(level, now + len - fo); g.gain.linearRampToValueAtTime(0, now + len); }
  src.connect(g).connect(c.destination);
  src.start(now, from, Math.max(0, end - from));
  audition = { src, start: now, len, path };
  src.onended = () => { if (audition?.src === src) { audition = null; announce(); } };
  announce();
  opts.onStart?.(audition);
}
export function stopAudition() {
  try { audition?.src.stop(); } catch { /* ended */ }
  if (audition) { audition = null; announce(); }
}
/** The sound playing now, for every play button (each shows pause while its sound plays). */
export function usePlayingPath() {
  return useSyncExternalStore((fn) => { auditioning.add(fn); return () => { auditioning.delete(fn); }; }, () => audition?.path ?? null);
}
